const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authMiddleware } = require('./auth');
const adminAuth = require('../middleware/adminAuth');
const School = require('../models/School');
const AdmissionCohort = require('../models/AdmissionCohort');
const AdmissionApplication = require('../models/AdmissionApplication');
const AdmissionSetup = require('../models/AdmissionSetup');
const Session = require('../models/Session');
const Class = require('../models/Class');
const Arm = require('../models/Arm');

/**
 * Resolve the current authenticated school.
 * School-scoped admins can only access their own tenant.
 * Platform admins may explicitly select a school.
 */
function getUserSchoolIdentifiers(user = {}) {
  const values = [
    user.schoolId,
    user.schoolKey,
    user.schoolCode,
    typeof user.school === 'string' ? user.school : null,
    user.school?.schoolId,
    user.school?._id
  ]
    .filter(Boolean)
    .map(value => String(value).trim());

  return [...new Set(values)];
}

function isPlatformAdmin(user = {}) {
  const roles = [user.role, user.userType, user.accountType, user.type]
    .filter(Boolean)
    .map(value => String(value).toLowerCase().trim());

  return roles.some(role => [
    'systemadmin',
    'system_admin',
    'platformadmin',
    'platform_admin'
  ].includes(role));
}

function getRequestedSchoolId(req) {
  return String(
    req.params?.schoolId ||
    req.body?.schoolId ||
    req.query?.schoolId ||
    req.headers?.['x-school-id'] ||
    req.headers?.['x-school-code'] ||
    req.headers?.['x-schoolid'] ||
    ''
  ).trim();
}

async function resolveCurrentSchool(req) {
  const user = req.user || {};
  const identifiers = getUserSchoolIdentifiers(user);
  const requestedId = getRequestedSchoolId(req);
  const platformAdmin = isPlatformAdmin(user);
  const schoolIdentifier = requestedId || identifiers[0] || '';

  if (!schoolIdentifier) return null;

  const query = {
    status: 'active',
    isDeleted: { $ne: true }
  };

  if (mongoose.Types.ObjectId.isValid(schoolIdentifier)) {
    query._id = schoolIdentifier;
  } else {
    query.schoolId = schoolIdentifier;
  }

  const school = await School.findOne(query).lean();
  if (!school) return null;

  if (!platformAdmin) {
    const belongs = identifiers.some(identifier =>
      identifier === String(school._id) ||
      identifier === String(school.schoolId)
    );

    if (!belongs) {
      const error = new Error('You are not authorized to access this school.');
      error.statusCode = 403;
      throw error;
    }
  }

  return school;
}

/**
 * Build a tenant filter using every verified identifier on the resolved School
 * document. Older admission records use School._id while newer records may use
 * School.schoolId. A scalar is still accepted for public flows that inherit the
 * tenant key from an already-loaded cohort.
 */
function getSchoolIdentifiers(school) {
  if (!school || typeof school !== 'object') {
    return school ? [String(school)] : [];
  }

  return [...new Set([school.schoolId, school._id]
    .filter(Boolean)
    .map(value => String(value).trim()))];
}

function getCanonicalSchoolId(school) {
  const id = school && typeof school === 'object'
    ? (school.schoolId || school._id)
    : school;
  return id ? String(id) : null;
}

function schoolFilter(schoolOrId, extra = {}) {
  const identifiers = getSchoolIdentifiers(schoolOrId);
  if (!identifiers.length) return { ...extra, schoolId: null };
  return { ...extra, schoolId: { $in: identifiers } };
}

async function getBoardUsage(schoolOrId, boardId) {
  const cohorts = await AdmissionCohort.find(schoolFilter(schoolOrId, { admissionSetupId: boardId })).select('_id').lean();
  const cohortIds = cohorts.map(item => item._id);
  const [directApplications, cohortApplications] = await Promise.all([
    AdmissionApplication.countDocuments(schoolFilter(schoolOrId, { admissionSetupId: boardId })),
    cohortIds.length ? AdmissionApplication.countDocuments(schoolFilter(schoolOrId, { cohort: { $in: cohortIds } })) : 0
  ]);
  return { cohortCount: cohorts.length, applicationCount: Math.max(directApplications, cohortApplications) };
}

function idOf(value) {
  return value && typeof value === 'object' ? String(value._id || value.id || '') : String(value || '');
}

async function validateBoardClass(school, admissionSetupId, classId) {
  if (!admissionSetupId) return { board: null };
  if (!mongoose.Types.ObjectId.isValid(admissionSetupId)) {
    return { error: 'Invalid admission board selected.' };
  }
  const board = await AdmissionSetup.findOne(schoolFilter(school, { _id: admissionSetupId }));
  if (!board) return { error: 'The selected admission board was not found for this school.' };
  if (board.isActive === false) return { error: 'The selected admission board is inactive.' };
  const eligibleClasses = Array.isArray(board.classes) && board.classes.length
    ? board.classes.map(idOf)
    : (board.class ? [idOf(board.class)] : []);
  if (!eligibleClasses.includes(String(classId))) {
    return { error: 'The selected class is not included in this admission board.' };
  }
  return { board };
}

async function requireSchool(req, res) {
  const school = await resolveCurrentSchool(req);

  if (!school) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: No active school is associated with this account.'
    });
    return null;
  }

  return school;
}

// Return real Arm documents (MongoDB IDs), never placeholder IDs such as arm-a.
router.get('/arms', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);
    const arms = await Arm.find(schoolFilter(school))
      .select('_id name armName class classId')
      .sort({ name: 1, armName: 1 })
      .lean();
    res.json(arms);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});



// ==================== MULTI-SCHOOL / TENANT SCOPE ====================
// Every authenticated admin endpoint resolves the current school first.
// All cohort, application, setup and statistics queries are then restricted
// to that school. Public applications inherit their school from the cohort.

// PUBLIC: list active admission cohorts for the school currently being viewed.
// This endpoint exposes only the minimum information needed by the public
// admissions page. It never accepts a tenant identifier from the request body.
router.get('/public/:schoolId/cohorts', async (req, res) => {
  try {
    const requestedSchoolId = String(req.params.schoolId || '').trim();
    if (!requestedSchoolId || requestedSchoolId.length > 128) {
      return res.status(400).json({ error: 'A valid school identifier is required.' });
    }

    const schoolQuery = {
      status: 'active',
      isDeleted: { $ne: true }
    };
    if (mongoose.Types.ObjectId.isValid(requestedSchoolId)) {
      schoolQuery._id = requestedSchoolId;
    } else {
      schoolQuery.schoolId = requestedSchoolId;
    }

    const publicSchool = await School.findOne(schoolQuery).select('_id schoolId name').lean();
    if (!publicSchool) {
      return res.status(404).json({ error: 'The selected school could not be found.' });
    }

    const schoolIdentifiers = [...new Set([
      publicSchool.schoolId,
      String(publicSchool._id)
    ].filter(Boolean).map(String))];

    const now = new Date();
    const cohorts = await AdmissionCohort.find({
      schoolId: { $in: schoolIdentifiers },
      status: 'active'
    })
      .select('_id name description class arm session term startDate endDate applicationFee capacity applicantCount admissionSetupId status')
      .populate('class', 'name')
      .populate('arm', 'name armName')
      .populate('session', 'name')
      .populate('admissionSetupId', 'title isActive startDate endDate applicationFee')
      .sort({ startDate: 1, createdAt: -1 })
      .lean();

    const available = cohorts.filter(cohort => {
      if (cohort.startDate && now < new Date(cohort.startDate)) return false;
      if (cohort.endDate && now > new Date(cohort.endDate)) return false;

      const board = cohort.admissionSetupId;
      if (board) {
        if (board.isActive === false) return false;
        if (board.startDate && now < new Date(board.startDate)) return false;
        if (board.endDate && now > new Date(board.endDate)) return false;
      }

      if (Number(cohort.capacity) > 0 && Number(cohort.applicantCount || 0) >= Number(cohort.capacity)) return false;
      return true;
    }).map(cohort => ({
      _id: cohort._id,
      name: cohort.name,
      description: cohort.description || '',
      class: cohort.class,
      arm: cohort.arm,
      session: cohort.session,
      term: cohort.term,
      startDate: cohort.startDate,
      endDate: cohort.endDate,
      applicationFee: Number(cohort.applicationFee ?? cohort.admissionSetupId?.applicationFee ?? 0),
      admissionBoardName: cohort.admissionSetupId?.title || '',
      remainingSlots: Number(cohort.capacity) > 0
        ? Math.max(0, Number(cohort.capacity) - Number(cohort.applicantCount || 0))
        : null
    }));

    return res.json({
      school: {
        _id: String(publicSchool._id),
        schoolId: publicSchool.schoolId || String(publicSchool._id),
        name: publicSchool.name || ''
      },
      cohorts: available
    });
  } catch (error) {
    console.error('Public admission cohort listing error:', error);
    return res.status(500).json({ error: 'Unable to load available admission options.' });
  }
});

// ==================== COHORT ENDPOINTS ====================

// GET all cohorts
router.get('/cohorts', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);

    const cohorts = await AdmissionCohort.find(schoolFilter(school))
      .populate('session', 'name')
      .populate('class', 'name')
      .populate('arm', 'name')
      .populate('admissionSetupId', 'title session term classes startDate endDate applicationFee isActive')
      .sort({ createdAt: -1 });

    res.json(cohorts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single cohort
router.get('/cohorts/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);

    const cohort = await AdmissionCohort.findOne(schoolFilter(school, { _id: req.params.id }))
      .populate('session')
      .populate('class')
      .populate('arm')
      .populate('admissionSetupId', 'title session term classes startDate endDate applicationFee isActive')
      .populate('createdBy', 'email name');

    if (!cohort) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    res.json(cohort);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE new cohort (linked to an admission board or independent)
router.post('/cohorts', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);
    const { name, term, arm, startDate, endDate, applicationFee, description, capacity } = req.body;
    const classId = req.body.class || req.body.classId;
    const admissionSetupId = req.body.admissionSetupId || null;
    if (!classId || !mongoose.Types.ObjectId.isValid(classId)) {
      return res.status(400).json({ error: 'A valid class is required.' });
    }

    let session = req.body.session;
    let finalTerm = term;
    let finalStartDate = startDate;
    let finalEndDate = endDate;
    let finalFee = applicationFee;
    if (admissionSetupId) {
      const validation = await validateBoardClass(school, admissionSetupId, classId);
      if (validation.error) return res.status(400).json({ error: validation.error });
      const board = validation.board;
      session = session || board.session;
      finalTerm = finalTerm || board.term;
      finalStartDate = finalStartDate || board.startDate;
      finalEndDate = finalEndDate || board.endDate;
      if (finalFee === undefined || finalFee === null || finalFee === '') finalFee = board.applicationFee;
    }
    if (!session || !finalTerm || !finalStartDate || !finalEndDate) {
      return res.status(400).json({ error: 'Session, term, start date and end date are required for an independent cohort.' });
    }
    if (new Date(finalEndDate) < new Date(finalStartDate)) {
      return res.status(400).json({ error: 'End date cannot be earlier than start date.' });
    }
    if (arm) {
      if (!mongoose.Types.ObjectId.isValid(arm)) return res.status(400).json({ error: 'Invalid Arm ID.' });
      const armRecord = await Arm.findOne(schoolFilter(school, { _id: arm })).lean();
      if (!armRecord) return res.status(400).json({ error: 'The selected arm does not belong to this school.' });
    }
    const exists = await AdmissionCohort.findOne(schoolFilter(school, { session, term: finalTerm, class: classId, arm: arm || null }));
    if (exists) return res.status(400).json({ error: 'Cohort already exists for this session/term/class/arm combination.' });

    const linkedBoard = admissionSetupId ? await AdmissionSetup.findOne(schoolFilter(school, { _id: admissionSetupId })).select('schoolId').lean() : null;
    const cohortSchoolId = linkedBoard?.schoolId || schoolId;
    const cohort = new AdmissionCohort({
      schoolId: cohortSchoolId, name, admissionSetupId, session, term: finalTerm, class: classId,
      arm: arm || undefined, startDate: finalStartDate, endDate: finalEndDate,
      applicationFee: Number(finalFee || 0), description,
      capacity: Number(capacity || 50), createdBy: req.user._id
    });
    await cohort.save();
    await cohort.populate('session', 'name');
    await cohort.populate('class', 'name');
    await cohort.populate('arm', 'name');
    await cohort.populate('admissionSetupId', 'title session term classes startDate endDate applicationFee isActive');
    res.status(201).json(cohort);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE cohort
router.put('/cohorts/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);

    const { session, term, arm, startDate, endDate, applicationFee, description, capacity } = req.body;
    const classId = req.body.class || req.body.classId;

    const cohort = await AdmissionCohort.findOne(schoolFilter(school, { _id: req.params.id }));
    if (!cohort) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    // Keep legacy linked cohorts aligned with the exact tenant key stored on
    // their board. This also keeps the public application flow's board lookup
    // consistent after an existing cohort is edited.
    if (cohort.admissionSetupId) {
      const existingBoard = await AdmissionSetup.findOne(
        schoolFilter(school, { _id: cohort.admissionSetupId })
      ).select('schoolId').lean();
      if (existingBoard?.schoolId) cohort.schoolId = existingBoard.schoolId;
    }

    // Prevent editing closed cohorts
    if (cohort.status === 'closed') {
      return res.status(400).json({ error: 'Cannot edit closed cohorts' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'admissionSetupId')) {
      const boardId = req.body.admissionSetupId || null;
      if (boardId) {
        const validation = await validateBoardClass(school, boardId, classId || cohort.class);
        if (validation.error) return res.status(400).json({ error: validation.error });
        const board = validation.board;
        cohort.admissionSetupId = board._id;
        cohort.schoolId = board.schoolId;
        cohort.session = session || board.session;
        cohort.term = term || board.term;
        cohort.startDate = startDate || board.startDate;
        cohort.endDate = endDate || board.endDate;
        if (applicationFee === undefined) cohort.applicationFee = board.applicationFee || 0;
      } else {
        cohort.admissionSetupId = null;
      }
    }

    // Update fields
    if (session) cohort.session = session;
    if (term) cohort.term = term;
    if (classId) {
      if (cohort.admissionSetupId && !Object.prototype.hasOwnProperty.call(req.body, 'admissionSetupId')) {
        const validation = await validateBoardClass(school, cohort.admissionSetupId, classId);
        if (validation.error) return res.status(400).json({ error: validation.error });
      }
      cohort.class = classId;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'arm')) {
      if (arm) {
        if (!mongoose.Types.ObjectId.isValid(arm)) return res.status(400).json({ error: 'Invalid Arm ID. Please select a valid school arm or leave it blank.' });
        const armRecord = await Arm.findOne(schoolFilter(school, { _id: arm })).lean();
        if (!armRecord) return res.status(400).json({ error: 'The selected arm does not belong to this school or no longer exists.' });
      }
      cohort.arm = arm || undefined;
    }
    if (startDate) cohort.startDate = startDate;
    if (endDate) cohort.endDate = endDate;
    if (applicationFee !== undefined) cohort.applicationFee = applicationFee;
    if (description !== undefined) cohort.description = description;
    if (capacity) cohort.capacity = capacity;

    await cohort.save();
    await cohort.populate('session', 'name');
    await cohort.populate('class', 'name');
    await cohort.populate('arm', 'name');
    await cohort.populate('admissionSetupId', 'title session term classes startDate endDate applicationFee isActive');

    res.json(cohort);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE cohort
router.delete('/cohorts/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);

    const cohort = await AdmissionCohort.findOne(schoolFilter(school, { _id: req.params.id }));
    if (!cohort) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    // Check if cohort has applications
    const applicationCount = await AdmissionApplication.countDocuments(schoolFilter(school, { cohort: req.params.id }));
    if (applicationCount > 0) {
      return res.status(400).json({ error: 'Cannot delete cohort with existing applications' });
    }

    await AdmissionCohort.findOneAndDelete(schoolFilter(school, { _id: req.params.id }));
    res.json({ message: 'Cohort deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PAUSE cohort
router.put('/cohorts/:id/pause', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);

    const cohort = await AdmissionCohort.findOne(schoolFilter(school, { _id: req.params.id }));
    if (!cohort) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    cohort.status = 'paused';
    await cohort.save();

    res.json({ message: 'Cohort paused successfully', cohort });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// RESUME cohort
router.put('/cohorts/:id/resume', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);

    const cohort = await AdmissionCohort.findOne(schoolFilter(school, { _id: req.params.id }));
    if (!cohort) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    if (cohort.status !== 'paused') {
      return res.status(400).json({ error: 'Only paused cohorts can be resumed' });
    }

    cohort.status = 'active';
    await cohort.save();

    res.json({ message: 'Cohort resumed successfully', cohort });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CLOSE cohort
router.put('/cohorts/:id/close', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);

    const cohort = await AdmissionCohort.findOne(schoolFilter(school, { _id: req.params.id }));
    if (!cohort) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    cohort.status = 'closed';
    await cohort.save();

    res.json({ message: 'Cohort closed successfully', cohort });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== APPLICATION ENDPOINTS ====================

// GET all applications
router.get('/applications', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);

    const { cohort, status } = req.query;
    let query = schoolFilter(school);

    if (cohort) query.cohort = cohort;
    if (status) query.status = status;

    const applications = await AdmissionApplication.find(query)
      .populate({ path: 'cohort', populate: { path: 'admissionSetupId', select: 'title session term classes' } })
      .populate('admissionSetupId', 'title session term classes')
      .populate('session', 'name')
      .populate('class', 'name')
      .populate('arm', 'name')
      .populate('reviewedBy', 'email name')
      .sort({ dateApplied: -1 });

    res.json(applications.map(application => {
      const item = application.toObject();
      item.admissionSetup = item.admissionSetupId || item.cohort?.admissionSetupId || null;
      item.admissionSetupId = item.admissionSetupId || item.cohort?.admissionSetupId?._id || item.cohort?.admissionSetupId || null;
      item.sessionName = item.session?.name || '';
      item.className = item.class?.name || '';
      item.armName = item.arm?.name || item.arm?.armName || '';
      return item;
    }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single application
router.get('/application/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);

    const application = await AdmissionApplication.findOne(schoolFilter(school, { _id: req.params.id }))
      .populate({ path: 'cohort', populate: { path: 'admissionSetupId', select: 'title session term classes' } })
      .populate('admissionSetupId', 'title session term classes')
      .populate('session', 'name')
      .populate('class', 'name')
      .populate('arm', 'name')
      .populate('reviewedBy', 'email name');

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const item = application.toObject();
    item.admissionSetup = item.admissionSetupId || item.cohort?.admissionSetupId || null;
    item.admissionSetupId = item.admissionSetupId || item.cohort?.admissionSetupId?._id || item.cohort?.admissionSetupId || null;
    item.sessionName = item.session?.name || '';
    item.className = item.class?.name || '';
    item.armName = item.arm?.name || item.arm?.armName || '';
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE application (public or admin)
router.post('/application', async (req, res) => {
  try {
    const {
      cohort,
      class: requestedClass,
      classId: requestedClassId,
      name,
      email,
      phone,
      parentEmail,
      parentPhone,
      dateOfBirth,
      gender,
      address,
      previousSchool,
      documents,
      photoUrl
    } = req.body;

    if (!cohort || !name || !email || !phone || !gender) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if cohort exists and is active
    const cohortData = await AdmissionCohort.findById(cohort);
    if (!cohortData) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    if (cohortData.status !== 'active') {
      return res.status(400).json({ error: 'Admissions for this cohort are currently closed' });
    }
    const submittedClassId = requestedClass || requestedClassId;
    if (submittedClassId && String(submittedClassId) !== String(cohortData.class)) {
      return res.status(400).json({ error: 'The selected class does not match this admission cohort.' });
    }
    let admissionBoard = null;
    if (cohortData.admissionSetupId) {
      admissionBoard = await AdmissionSetup.findOne(schoolFilter(String(cohortData.schoolId), { _id: cohortData.admissionSetupId }));
      if (!admissionBoard || admissionBoard.isActive === false) {
        return res.status(400).json({ error: 'The admission board for this cohort is inactive or unavailable.' });
      }
      const allowed = Array.isArray(admissionBoard.classes) && admissionBoard.classes.length
        ? admissionBoard.classes.map(idOf)
        : (admissionBoard.class ? [idOf(admissionBoard.class)] : []);
      if (!allowed.includes(String(cohortData.class))) {
        return res.status(400).json({ error: 'This cohort class is not eligible under its admission board.' });
      }
      const now = new Date();
      if ((admissionBoard.startDate && now < new Date(admissionBoard.startDate)) || (admissionBoard.endDate && now > new Date(admissionBoard.endDate))) {
        return res.status(400).json({ error: 'The admission board is outside its application window.' });
      }
    }

    // Check capacity
    if (cohortData.applicantCount >= cohortData.capacity) {
      return res.status(400).json({ error: 'Cohort is at full capacity' });
    }

    // Check if applicant already applied for this cohort
    const applicationSchoolId = String(cohortData.schoolId || '');
    const exists = await AdmissionApplication.findOne(
      schoolFilter(applicationSchoolId, { email, cohort })
    );
    if (exists) {
      return res.status(400).json({ error: 'You have already applied for this cohort' });
    }

    const application = new AdmissionApplication({
      schoolId: applicationSchoolId,
      admissionSetupId: cohortData.admissionSetupId || null,
      cohort,
      session: cohortData.session,
      term: cohortData.term,
      class: cohortData.class,
      arm: cohortData.arm,
      name,
      email,
      phone,
      parentEmail,
      parentPhone,
      dateOfBirth,
      gender,
      address,
      previousSchool,
      documents,
      photoUrl,
      applicationFee: cohortData.applicationFee
    });

    await application.save();

    // Increment applicant count
    cohortData.applicantCount += 1;
    await cohortData.save();

    res.status(201).json({
      message: 'Application submitted successfully',
      application
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE application status
router.put('/application/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);

    const { status, notes } = req.body;

    if (!status || !['Pending', 'Approved', 'Rejected', 'Enrolled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const application = await AdmissionApplication.findOne(schoolFilter(school, { _id: req.params.id }));
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    application.status = status;
    if (notes) application.notes = notes;
    application.dateReviewed = new Date();
    application.reviewedBy = req.user._id;

    await application.save();
    await application.populate('reviewedBy', 'email name');

    res.json({ message: `Application ${status}`, application });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE application
router.delete('/application/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);
    const application = await AdmissionApplication.findOne(schoolFilter(school, { _id: req.params.id }));
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const cohort = await AdmissionCohort.findOne(schoolFilter(school, { _id: application.cohort }));
    if (cohort && cohort.applicantCount > 0) {
      cohort.applicantCount -= 1;
      await cohort.save();
    }

    await AdmissionApplication.findOneAndDelete(schoolFilter(school, { _id: req.params.id }));
    res.json({ message: 'Application deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ADMISSION SETUP ENDPOINTS ====================

// CREATE admission board (legacy endpoint retained as /setup)
router.post('/setup', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);
    const { title, session, term, startDate, endDate, applicationFee } = req.body;
    const classes = Array.isArray(req.body.classes) ? req.body.classes : (req.body.classId || req.body.class ? [req.body.classId || req.body.class] : []);
    if (!session || !term || !classes.length || !startDate || !endDate) {
      return res.status(400).json({ error: 'Title, session, term, at least one eligible class, start date and end date are required.' });
    }
    if (new Date(endDate) < new Date(startDate)) return res.status(400).json({ error: 'End date cannot be earlier than start date.' });
    const uniqueClasses = [...new Set(classes.map(String))];
    if (uniqueClasses.some(id => !mongoose.Types.ObjectId.isValid(id))) return res.status(400).json({ error: 'One or more selected class IDs are invalid.' });
    const setup = new AdmissionSetup({
      schoolId, title: String(title || 'Admission Board').trim(), session, term,
      classes: uniqueClasses, class: uniqueClasses[0], startDate, endDate,
      applicationFee: Number(applicationFee || 0), isActive: true, createdBy: req.user._id
    });
    await setup.save();
    await setup.populate('session', 'name');
    await setup.populate('classes', 'name');
    await setup.populate('class', 'name');
    const cohortCount = await AdmissionCohort.countDocuments(schoolFilter(school, { admissionSetupId: setup._id }));
    res.status(201).json({ ...setup.toObject(), cohortCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all admission boards (legacy endpoint retained as /setups)
router.get('/setups', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);
    const setups = await AdmissionSetup.find(schoolFilter(school))
      .populate('session', 'name')
      .populate('classes', 'name')
      .populate('class', 'name')
      .sort({ createdAt: -1 });
    const results = await Promise.all(setups.map(async setup => ({
      ...setup.toObject(),
      ...(await getBoardUsage(school, setup._id))
    })));
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET a single admission board
router.get('/setup/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);
    const setup = await AdmissionSetup.findOne(schoolFilter(school, { _id: req.params.id }))
      .populate('session', 'name').populate('classes', 'name').populate('class', 'name');
    if (!setup) return res.status(404).json({ error: 'Admission board not found.' });
    const usage = await getBoardUsage(school, setup._id);
    res.json({ ...setup.toObject(), ...usage });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// UPDATE an admission board. Linked cohorts inherit the updated board settings.
router.put('/setup/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid admission board ID.' });

    const board = await AdmissionSetup.findOne(schoolFilter(school, { _id: req.params.id }));
    if (!board) return res.status(404).json({ error: 'Admission board not found.' });

    const { title, session, term, startDate, endDate, applicationFee } = req.body || {};
    const requestedClasses = Array.isArray(req.body.classes)
      ? req.body.classes
      : (req.body.classId || req.body.class ? [req.body.classId || req.body.class] : null);

    if (session !== undefined && !mongoose.Types.ObjectId.isValid(session)) return res.status(400).json({ error: 'Invalid session selected.' });
    if (term !== undefined && !['First Term', 'Second Term', 'Third Term'].includes(term)) return res.status(400).json({ error: 'Invalid term selected.' });

    let classIds = null;
    if (requestedClasses !== null) {
      classIds = [...new Set(requestedClasses.map(String))];
      if (!classIds.length || classIds.some(id => !mongoose.Types.ObjectId.isValid(id))) return res.status(400).json({ error: 'Select at least one valid eligible class.' });
      const existingCohorts = await AdmissionCohort.find(schoolFilter(school, { admissionSetupId: board._id })).select('class').lean();
      const removedInUse = existingCohorts.some(cohort => !classIds.includes(String(cohort.class)));
      if (removedInUse) return res.status(409).json({ error: 'You cannot remove a class that already has a linked cohort. Reassign or remove that cohort first.' });
    }

    const nextStart = startDate !== undefined ? new Date(startDate) : new Date(board.startDate);
    const nextEnd = endDate !== undefined ? new Date(endDate) : new Date(board.endDate);
    if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime()) || nextEnd < nextStart) return res.status(400).json({ error: 'Please provide valid admission dates. End date cannot be earlier than start date.' });
    const fee = applicationFee === undefined ? Number(board.applicationFee || 0) : Number(applicationFee);
    if (!Number.isFinite(fee) || fee < 0) return res.status(400).json({ error: 'Application fee must be a valid non-negative amount.' });

    if (title !== undefined) board.title = String(title).trim() || 'Admission Board';
    if (session !== undefined) board.session = session;
    if (term !== undefined) board.term = term;
    if (classIds) { board.classes = classIds; board.class = classIds[0]; }
    if (startDate !== undefined) board.startDate = nextStart;
    if (endDate !== undefined) board.endDate = nextEnd;
    if (applicationFee !== undefined) board.applicationFee = fee;
    await board.save();

    await AdmissionCohort.updateMany(schoolFilter(school, { admissionSetupId: board._id }), {
      $set: { session: board.session, term: board.term, startDate: board.startDate, endDate: board.endDate, applicationFee: board.applicationFee }
    });

    await board.populate('session', 'name');
    await board.populate('classes', 'name');
    await board.populate('class', 'name');
    const usage = await getBoardUsage(school, board._id);
    return res.json({ message: 'Admission board updated successfully.', ...board.toObject(), ...usage });
  } catch (error) {
    console.error('Update admission board error:', error);
    return res.status(500).json({ error: error.message || 'Unable to update admission board.' });
  }
});

// ACTIVATE / DEACTIVATE an admission board.
router.patch('/setup/:id/status', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid admission board ID.' });
    if (typeof req.body?.isActive !== 'boolean') return res.status(400).json({ error: 'isActive must be true or false.' });
    const board = await AdmissionSetup.findOneAndUpdate(
      schoolFilter(school, { _id: req.params.id }),
      { $set: { isActive: req.body.isActive } },
      { new: true, runValidators: true }
    ).populate('session', 'name').populate('classes', 'name').populate('class', 'name');
    if (!board) return res.status(404).json({ error: 'Admission board not found.' });
    return res.json({ message: `Admission board ${board.isActive ? 'activated' : 'deactivated'} successfully.`, board });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unable to update admission board status.' });
  }
});

// DELETE a board only when it has no linked cohorts or applications.
router.delete('/setup/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid admission board ID.' });
    const board = await AdmissionSetup.findOne(schoolFilter(school, { _id: req.params.id }));
    if (!board) return res.status(404).json({ error: 'Admission board not found.' });
    const usage = await getBoardUsage(school, board._id);
    if (usage.cohortCount > 0 || usage.applicationCount > 0) {
      return res.status(409).json({ error: 'This admission board cannot be deleted because it has linked cohorts or applications.', ...usage });
    }
    await AdmissionSetup.deleteOne(schoolFilter(school, { _id: board._id }));
    return res.json({ message: 'Admission board deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unable to delete admission board.' });
  }
});

// ==================== STATISTICS ENDPOINTS ====================

// GET admission statistics
router.get('/stats', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);

    const totalApplications = await AdmissionApplication.countDocuments(schoolFilter(school));
    const pendingApplications = await AdmissionApplication.countDocuments(schoolFilter(school, { status: 'Pending' }));
    const approvedApplications = await AdmissionApplication.countDocuments(schoolFilter(school, { status: 'Approved' }));
    const rejectedApplications = await AdmissionApplication.countDocuments(schoolFilter(school, { status: 'Rejected' }));
    const activeCohorts = await AdmissionCohort.countDocuments(schoolFilter(school, { status: 'active' }));
    const pausedCohorts = await AdmissionCohort.countDocuments(schoolFilter(school, { status: 'paused' }));

    res.json({
      totalApplications,
      pendingApplications,
      approvedApplications,
      rejectedApplications,
      activeCohorts,
      pausedCohorts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET cohort statistics
router.get('/cohorts/:id/stats', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);

    const cohort = await AdmissionCohort.findOne(schoolFilter(school, { _id: req.params.id }));
    if (!cohort) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    const totalApplications = await AdmissionApplication.countDocuments(
      schoolFilter(school, { cohort: req.params.id })
    );
    const pendingApplications = await AdmissionApplication.countDocuments(schoolFilter(school, {
      cohort: req.params.id,
      status: 'Pending'
    }));
    const approvedApplications = await AdmissionApplication.countDocuments(schoolFilter(school, {
      cohort: req.params.id,
      status: 'Approved'
    }));
    const rejectedApplications = await AdmissionApplication.countDocuments(schoolFilter(school, {
      cohort: req.params.id,
      status: 'Rejected'
    }));

    res.json({
      cohort: cohort.name,
      totalApplications,
      pendingApplications,
      approvedApplications,
      rejectedApplications,
      capacity: cohort.capacity,
      remainingCapacity: cohort.capacity - totalApplications
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
