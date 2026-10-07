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

function schoolFilter(schoolId, extra = {}) {
  return { ...extra, schoolId };
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



// ==================== MULTI-SCHOOL / TENANT SCOPE ====================
// Every authenticated admin endpoint resolves the current school first.
// All cohort, application, setup and statistics queries are then restricted
// to that school. Public applications inherit their school from the cohort.
// ==================== COHORT ENDPOINTS ====================

// GET all cohorts
router.get('/cohorts', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);

    const cohorts = await AdmissionCohort.find(schoolFilter(schoolId))
      .populate('session', 'name')
      .populate('class', 'name')
      .populate('arm', 'name')
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

    const cohort = await AdmissionCohort.findOne(schoolFilter(schoolId, { _id: req.params.id }))
      .populate('session')
      .populate('class')
      .populate('arm')
      .populate('createdBy', 'email name');

    if (!cohort) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    res.json(cohort);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE new cohort
router.post('/cohorts', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);

    const { session, term, class: classId, arm, startDate, endDate, applicationFee, description, capacity } = req.body;

    // Validation
    if (!session || !term || !classId || !arm || !startDate || !endDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if cohort already exists for this session/term/class/arm
    const exists = await AdmissionCohort.findOne({
      schoolId,
      session,
      term,
      class: classId,
      arm
    });

    if (exists) {
      return res.status(400).json({ error: 'Cohort already exists for this session/term/class/arm combination' });
    }

    const cohort = new AdmissionCohort({
      schoolId,
      session,
      term,
      class: classId,
      arm,
      startDate,
      endDate,
      applicationFee: applicationFee || 0,
      description,
      capacity: capacity || 50,
      createdBy: req.user._id
    });

    await cohort.save();
    await cohort.populate('session', 'name');
    await cohort.populate('class', 'name');
    await cohort.populate('arm', 'name');

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

    const { session, term, class: classId, arm, startDate, endDate, applicationFee, description, capacity } = req.body;

    const cohort = await AdmissionCohort.findOne(schoolFilter(schoolId, { _id: req.params.id }));
    if (!cohort) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    // Prevent editing closed cohorts
    if (cohort.status === 'closed') {
      return res.status(400).json({ error: 'Cannot edit closed cohorts' });
    }

    // Update fields
    if (session) cohort.session = session;
    if (term) cohort.term = term;
    if (classId) cohort.class = classId;
    if (arm) cohort.arm = arm;
    if (startDate) cohort.startDate = startDate;
    if (endDate) cohort.endDate = endDate;
    if (applicationFee !== undefined) cohort.applicationFee = applicationFee;
    if (description !== undefined) cohort.description = description;
    if (capacity) cohort.capacity = capacity;

    await cohort.save();
    await cohort.populate('session', 'name');
    await cohort.populate('class', 'name');
    await cohort.populate('arm', 'name');

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

    const cohort = await AdmissionCohort.findOne(schoolFilter(schoolId, { _id: req.params.id }));
    if (!cohort) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    // Check if cohort has applications
    const applicationCount = await AdmissionApplication.countDocuments(schoolFilter(schoolId, { cohort: req.params.id }));
    if (applicationCount > 0) {
      return res.status(400).json({ error: 'Cannot delete cohort with existing applications' });
    }

    await AdmissionCohort.findOneAndDelete(schoolFilter(schoolId, { _id: req.params.id }));
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

    const cohort = await AdmissionCohort.findOne(schoolFilter(schoolId, { _id: req.params.id }));
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

    const cohort = await AdmissionCohort.findOne(schoolFilter(schoolId, { _id: req.params.id }));
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

    const cohort = await AdmissionCohort.findOne(schoolFilter(schoolId, { _id: req.params.id }));
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
    let query = schoolFilter(schoolId);

    if (cohort) query.cohort = cohort;
    if (status) query.status = status;

    const applications = await AdmissionApplication.find(query)
      .populate('cohort')
      .populate('session', 'name')
      .populate('class', 'name')
      .populate('arm', 'name')
      .populate('reviewedBy', 'email name')
      .sort({ dateApplied: -1 });

    res.json(applications);
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

    const application = await AdmissionApplication.findOne(schoolFilter(schoolId, { _id: req.params.id }))
      .populate('cohort')
      .populate('session', 'name')
      .populate('class', 'name')
      .populate('arm', 'name')
      .populate('reviewedBy', 'email name');

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json(application);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE application (public or admin)
router.post('/application', async (req, res) => {
  try {
    const {
      cohort,
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

    const application = await AdmissionApplication.findOne(schoolFilter(schoolId, { _id: req.params.id }));
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
    const application = await AdmissionApplication.findOne(schoolFilter(schoolId, { _id: req.params.id }));
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const cohort = await AdmissionCohort.findOne(schoolFilter(schoolId, { _id: application.cohort }));
    if (cohort && cohort.applicantCount > 0) {
      cohort.applicantCount -= 1;
      await cohort.save();
    }

    await AdmissionApplication.findOneAndDelete(schoolFilter(schoolId, { _id: req.params.id }));
    res.json({ message: 'Application deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ADMISSION SETUP ENDPOINTS ====================

// CREATE setup
router.post('/setup', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);

    const { session, term, classId, armId, startDate, endDate, applicationFee } = req.body;

    if (!session || !term || !classId || !armId || !startDate || !endDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const setup = new AdmissionSetup({
      schoolId,
      session,
      term,
      class: classId,
      arm: armId,
      startDate,
      endDate,
      applicationFee: applicationFee || 0,
      createdBy: req.user._id
    });

    await setup.save();
    await setup.populate('session', 'name');
    await setup.populate('class', 'name');
    await setup.populate('arm', 'name');

    res.status(201).json(setup);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all setups
router.get('/setups', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);

    const setups = await AdmissionSetup.find(schoolFilter(schoolId))
      .populate('session', 'name')
      .populate('class', 'name')
      .populate('arm', 'name')
      .sort({ createdAt: -1 });

    res.json(setups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== STATISTICS ENDPOINTS ====================

// GET admission statistics
router.get('/stats', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireSchool(req, res);
    if (!school) return;
    const schoolId = String(school.schoolId || school._id);

    const totalApplications = await AdmissionApplication.countDocuments(schoolFilter(schoolId));
    const pendingApplications = await AdmissionApplication.countDocuments(schoolFilter(schoolId, { status: 'Pending' }));
    const approvedApplications = await AdmissionApplication.countDocuments(schoolFilter(schoolId, { status: 'Approved' }));
    const rejectedApplications = await AdmissionApplication.countDocuments(schoolFilter(schoolId, { status: 'Rejected' }));
    const activeCohorts = await AdmissionCohort.countDocuments(schoolFilter(schoolId, { status: 'active' }));
    const pausedCohorts = await AdmissionCohort.countDocuments(schoolFilter(schoolId, { status: 'paused' }));

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

    const cohort = await AdmissionCohort.findOne(schoolFilter(schoolId, { _id: req.params.id }));
    if (!cohort) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    const totalApplications = await AdmissionApplication.countDocuments(
      schoolFilter(schoolId, { cohort: req.params.id })
    );
    const pendingApplications = await AdmissionApplication.countDocuments(schoolFilter(schoolId, {
      cohort: req.params.id,
      status: 'Pending'
    }));
    const approvedApplications = await AdmissionApplication.countDocuments(schoolFilter(schoolId, {
      cohort: req.params.id,
      status: 'Approved'
    }));
    const rejectedApplications = await AdmissionApplication.countDocuments(schoolFilter(schoolId, {
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
