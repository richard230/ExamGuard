
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const AdmissionSetup = require('../models/AdmissionSetup');
const AdmissionApplication = require('../models/AdmissionApplication');
const AdmissionCohort = require('../models/AdmissionCohort');
const AttendanceRecord = require('../models/AttendanceRecord');
const Session = require('../models/Session');
const Class = require('../models/Class');
const Arm = require('../models/Arm');

const adminAuth = require('../middleware/adminAuth');

// ============================================================
// SCHOOL / TENANT HELPERS
// ============================================================

function getSchoolIdentifiers(req) {
  const user = req.user || {};
  return [...new Set([
    user.schoolId,
    user.school?.schoolId,
    user.school?._id
  ].filter(Boolean).map(value => String(value).trim()))];
}

function getSchoolId(req) {
  const identifiers = getSchoolIdentifiers(req);
  // Academic records in this legacy module use the School MongoDB ObjectId.
  return identifiers.find(value => mongoose.Types.ObjectId.isValid(value)) || identifiers[0] || null;
}

function schoolFilter(req, extra = {}) {
  const identifiers = getSchoolIdentifiers(req);
  return { ...extra, schoolId: { $in: identifiers } };
}

function requireSchool(req, res) {
  const schoolId = getSchoolId(req);

  if (!schoolId) {
    res.status(403).json({
      error: 'Your account is not associated with a school. Please select or configure your school.'
    });
    return null;
  }

  return schoolId;
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const VALID_TERMS = [
  'First Term',
  'Second Term',
  'Third Term'
];

// ============================================================
// ADMISSION SETUP
// ============================================================

// Create an Admission Board. New clients send a title and a classes array;
// older clients may still send classId for a single-class setup.
router.post('/admission/setup', adminAuth, async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const {
      title = '', session, term, classes: requestedClasses, classId,
      startDate, endDate, applicationFee
    } = req.body || {};

    const classIds = Array.isArray(requestedClasses) && requestedClasses.length
      ? [...new Set(requestedClasses.map(String))]
      : (classId ? [String(classId)] : []);

    if (!session || !term || !classIds.length || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Session, term, at least one eligible class, start date and end date are required.'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(session) || classIds.some(id => !mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ error: 'Invalid session or class selected.' });
    }

    if (!VALID_TERMS.includes(term)) {
      return res.status(400).json({ error: 'Invalid term selected.' });
    }

    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);
    if (Number.isNaN(parsedStartDate.getTime()) || Number.isNaN(parsedEndDate.getTime()) || parsedEndDate < parsedStartDate) {
      return res.status(400).json({ error: 'Please provide valid admission dates.' });
    }

    const fee = applicationFee === '' || applicationFee === undefined || applicationFee === null
      ? 0 : Number(applicationFee);
    if (!Number.isFinite(fee) || fee < 0) {
      return res.status(400).json({ error: 'Application fee must be a valid non-negative amount.' });
    }

    if (schoolId.length !== 24 || !mongoose.Types.ObjectId.isValid(schoolId)) {
      return res.status(403).json({ error: 'The authenticated school ID is invalid.' });
    }
    const schoolObjectId = new mongoose.Types.ObjectId(schoolId);
    const [sessionRecord, classRecords] = await Promise.all([
      Session.findOne({ _id: session, schoolId: schoolObjectId }).select('_id name schoolId'),
      Class.find({ _id: { $in: classIds }, schoolId: schoolObjectId }).select('_id name schoolId')
    ]);

    if (!sessionRecord) {
      return res.status(400).json({ error: 'The selected session could not be found for this school.' });
    }
    if (classRecords.length !== classIds.length) {
      return res.status(400).json({ error: 'One or more selected classes could not be found for this school.' });
    }

    const board = await AdmissionSetup.create({
      schoolId,
      title: String(title).trim(),
      session: sessionRecord._id,
      term,
      classes: classRecords.map(record => record._id),
      // Retain the legacy field for older clients and records.
      class: classRecords[0]._id,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      applicationFee: fee,
      isActive: true,
      createdBy: req.user?._id || req.user?.id
    });

    await board.populate([
      { path: 'session', select: 'name' },
      { path: 'classes', select: 'name' },
      { path: 'class', select: 'name' }
    ]);

    return res.status(201).json({ message: 'Admission board created successfully.', setup: board, board });
  } catch (error) {
    console.error('Admission board creation error:', error);
    return res.status(500).json({ error: 'Unable to create admission board.', details: error.message });
  }
});
// List admission boards belonging only to the authenticated school.
router.get('/admission/setups', adminAuth, async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const setups = await AdmissionSetup.find(schoolFilter(req))
      .populate('session', 'name')
      .populate('classes', 'name')
      .populate('class', 'name')
      .sort('-createdAt')
      .lean();

    const withCounts = await Promise.all(setups.map(async setup => {
      const cohortCount = await AdmissionCohort.countDocuments(schoolFilter(req, { admissionSetupId: setup._id }));
      return { ...setup, cohortCount, linkedCohortCount: cohortCount };
    }));

    return res.json(withCounts);
  } catch (error) {
    console.error('Load admission boards error:', error);
    return res.status(500).json({ error: 'Unable to load admission boards.' });
  }
});

// Update an admission board and synchronize settings to its linked cohorts.
router.put('/admission/setup/:id', adminAuth, async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: 'Invalid admission board ID.' });
    const board = await AdmissionSetup.findOne(schoolFilter(req, { _id: id }));
    if (!board) return res.status(404).json({ error: 'Admission board not found.' });
    const { title, session, term, startDate, endDate, applicationFee } = req.body || {};
    const incomingClasses = Array.isArray(req.body.classes) ? req.body.classes : (req.body.classId || req.body.class ? [req.body.classId || req.body.class] : null);
    if (session !== undefined && !isValidObjectId(session)) return res.status(400).json({ error: 'Invalid session selected.' });
    if (term !== undefined && !VALID_TERMS.includes(term)) return res.status(400).json({ error: 'Invalid term selected.' });
    if (incomingClasses !== null) {
      const classIds = [...new Set(incomingClasses.map(String))];
      if (!classIds.length || classIds.some(id => !isValidObjectId(id))) return res.status(400).json({ error: 'Select at least one valid eligible class.' });
      const linked = await AdmissionCohort.find(schoolFilter(req, { admissionSetupId: board._id })).select('class').lean();
      if (linked.some(c => !classIds.includes(String(c.class)))) return res.status(409).json({ error: 'A class used by an existing linked cohort cannot be removed from this board.' });
      board.classes = classIds;
      board.class = classIds[0];
    }
    const nextStart = startDate !== undefined ? new Date(startDate) : new Date(board.startDate);
    const nextEnd = endDate !== undefined ? new Date(endDate) : new Date(board.endDate);
    if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime()) || nextEnd < nextStart) return res.status(400).json({ error: 'Invalid admission dates.' });
    const fee = applicationFee === undefined ? Number(board.applicationFee || 0) : Number(applicationFee);
    if (!Number.isFinite(fee) || fee < 0) return res.status(400).json({ error: 'Application fee must be non-negative.' });
    if (title !== undefined) board.title = String(title).trim() || 'Admission Board';
    if (session !== undefined) board.session = session;
    if (term !== undefined) board.term = term;
    if (startDate !== undefined) board.startDate = nextStart;
    if (endDate !== undefined) board.endDate = nextEnd;
    if (applicationFee !== undefined) board.applicationFee = fee;
    await board.save();
    await AdmissionCohort.updateMany(schoolFilter(req, { admissionSetupId: board._id }), { $set: { session: board.session, term: board.term, startDate: board.startDate, endDate: board.endDate, applicationFee: board.applicationFee } });
    await board.populate([{ path: 'session', select: 'name' }, { path: 'classes', select: 'name' }, { path: 'class', select: 'name' }]);
    const cohortCount = await AdmissionCohort.countDocuments(schoolFilter(req, { admissionSetupId: board._id }));
    const applicationCount = await AdmissionApplication.countDocuments(schoolFilter(req, { admissionSetupId: board._id }));
    return res.json({ message: 'Admission board updated successfully.', board, cohortCount, linkedCohortCount: cohortCount, applicationCount });
  } catch (error) {
    console.error('Update admission board error:', error);
    return res.status(500).json({ error: 'Unable to update admission board.', details: error.message });
  }
});

// Activate or deactivate an admission board.
router.patch('/admission/setup/:id/status', adminAuth, async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid admission board ID.' });
    if (typeof req.body?.isActive !== 'boolean') return res.status(400).json({ error: 'isActive must be true or false.' });
    const board = await AdmissionSetup.findOneAndUpdate(schoolFilter(req, { _id: req.params.id }), { $set: { isActive: req.body.isActive } }, { new: true, runValidators: true });
    if (!board) return res.status(404).json({ error: 'Admission board not found.' });
    return res.json({ message: `Admission board ${board.isActive ? 'activated' : 'deactivated'} successfully.`, board });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to update admission board status.', details: error.message });
  }
});

// Delete is blocked whenever a board has linked cohorts or applications.
router.delete('/admission/setup/:id', adminAuth, async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid admission board ID.' });
    const board = await AdmissionSetup.findOne(schoolFilter(req, { _id: req.params.id }));
    if (!board) return res.status(404).json({ error: 'Admission board not found.' });
    const cohorts = await AdmissionCohort.find(schoolFilter(req, { admissionSetupId: board._id })).select('_id').lean();
    const cohortIds = cohorts.map(c => c._id);
    const applications = await AdmissionApplication.countDocuments(schoolFilter(req, { $or: [{ admissionSetupId: board._id }, ...(cohortIds.length ? [{ cohort: { $in: cohortIds } }] : [])] }));
    if (cohorts.length || applications) return res.status(409).json({ error: 'This board has linked cohorts or applications and cannot be deleted.', cohortCount: cohorts.length, applicationCount: applications });
    await AdmissionSetup.deleteOne(schoolFilter(req, { _id: board._id }));
    return res.json({ message: 'Admission board deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to delete admission board.', details: error.message });
  }
});

// ============================================================
// ADMISSION APPLICATIONS
// ============================================================

// List applications belonging only to the authenticated school.
router.get('/admission/applications', adminAuth, async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const applications = await AdmissionApplication.find(schoolFilter(req))
      .populate('session', 'name')
      .populate('class', 'name')
      .populate('arm', 'name')
      .populate('admissionSetupId', 'title name')
      .populate('cohort', 'name class arm session term admissionSetupId')
      .sort('-createdAt')
      .lean();

    return res.json(applications.map(app => ({
      ...app,
      admissionSetup: app.admissionSetupId || app.cohort?.admissionSetupId || null,
      admissionSetupName: (app.admissionSetupId || app.cohort?.admissionSetupId)?.title || '',
      cohortName: app.cohort?.name || '',
      sessionName: app.session?.name || '',
      className: app.class?.name || '',
      armName: app.arm?.name || ''
    })));
  } catch (error) {
    console.error('Load admission applications error:', error);
    return res.status(500).json({ error: 'Unable to load admission applications.' });
  }
});

// Get one application, but only if it belongs to this school.
router.get('/admission/application/:id', adminAuth, async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        error: 'Invalid application ID.'
      });
    }

    const app = await AdmissionApplication.findOne(schoolFilter(req, { _id: id }))
      .populate('session', 'name')
      .populate('class', 'name')
      .populate('arm', 'name')
      .populate('admissionSetupId', 'title name')
      .populate('cohort', 'name class arm session term admissionSetupId')
      .lean();

    if (!app) {
      return res.status(404).json({
        error: 'Application not found.'
      });
    }

    const admissionSetup = app.admissionSetupId || app.cohort?.admissionSetupId || null;
    return res.json({
      ...app,
      admissionSetup,
      admissionSetupName: admissionSetup?.title || '',
      cohortName: app.cohort?.name || '',
      sessionName: app.session?.name || '',
      className: app.class?.name || '',
      armName: app.arm?.name || ''
    });

  } catch (error) {
    console.error('Get admission application error:', error);
    return res.status(500).json({
      error: 'Unable to retrieve application.'
    });
  }
});

// Approve or reject an application belonging to this school.
router.put('/admission/application/:id', adminAuth, async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const { id } = req.params;
    const { status } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        error: 'Invalid application ID.'
      });
    }

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Select Approved or Rejected.'
      });
    }

    const updated = await AdmissionApplication.findOneAndUpdate(
      schoolFilter(req, { _id: id }),
      {
        $set: { status }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!updated) {
      return res.status(404).json({
        error: 'Application not found.'
      });
    }

    return res.json({
      message: 'Status updated successfully.',
      status: updated.status
    });

  } catch (error) {
    console.error('Update application status error:', error);
    return res.status(500).json({
      error: 'Unable to update application status.'
    });
  }
});

// ============================================================
// DROPDOWN DATA
// ============================================================

// Sessions for the authenticated school.
router.get('/sessions', adminAuth, async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const sessions = await Session.find({ schoolId })
      .sort('-createdAt')
      .select('_id name')
      .lean();

    return res.json(sessions);

  } catch (error) {
    console.error('Load sessions error:', error);
    return res.status(500).json({
      error: 'Unable to load sessions.'
    });
  }
});

// Classes for the authenticated school.
router.get('/classes', adminAuth, async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const classes = await Class.find({ schoolId })
      .sort('name')
      .select('_id name')
      .lean();

    return res.json(classes);

  } catch (error) {
    console.error('Load classes error:', error);
    return res.status(500).json({
      error: 'Unable to load classes.'
    });
  }
});

// Arms for the authenticated school.
router.get('/arms', adminAuth, async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const arms = await Arm.find({ schoolId })
      .sort('name')
      .select('_id name')
      .lean();

    return res.json(arms);

  } catch (error) {
    console.error('Load arms error:', error);
    return res.status(500).json({
      error: 'Unable to load arms.'
    });
  }
});

// ============================================================
// ATTENDANCE
// ============================================================

// Create an attendance record for the authenticated school.
router.post('/attendance/record', adminAuth, async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const {
      date,
      userId,
      name,
      role,
      class: className,
      department,
      status,
      remark
    } = req.body;

    if (!date || !userId || !name || !role || !status) {
      return res.status(400).json({
        error: 'Date, user ID, name, role and status are required.'
      });
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        error: 'Invalid attendance date.'
      });
    }

    const record = new AttendanceRecord({
      schoolId,
      date: parsedDate,
      userId,
      name,
      role,
      class: className,
      department,
      status,
      remark,
      recordedBy: req.user?._id || req.user?.id
    });

    await record.save();

    return res.status(201).json(record);

  } catch (error) {
    console.error('Create attendance record error:', error);
    return res.status(500).json({
      error: 'Unable to create attendance record.',
      details: error.message
    });
  }
});

// Attendance summary for this school only.
router.get('/attendance/summary', adminAuth, async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todayFilter = {
      schoolId,
      date: { $gte: today, $lt: tomorrow },
      status: 'Present'
    };

    const [
      studentsPresent,
      teachingPresent,
      nonTeachingPresent
    ] = await Promise.all([
      AttendanceRecord.countDocuments({
        ...todayFilter,
        role: 'student'
      }),
      AttendanceRecord.countDocuments({
        ...todayFilter,
        role: 'teaching'
      }),
      AttendanceRecord.countDocuments({
        ...todayFilter,
        role: 'non-teaching'
      })
    ]);

    const trends = {
      labels: [],
      students: [],
      teaching: [],
      nonTeaching: []
    };

    const trendQueries = [];

    for (let i = 6; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);

      const nextDay = new Date(day);
      nextDay.setDate(day.getDate() + 1);

      trends.labels.push(day.toISOString().slice(0, 10));

      trendQueries.push(
        AttendanceRecord.countDocuments({
          schoolId,
          date: { $gte: day, $lt: nextDay },
          role: 'student',
          status: 'Present'
        }),
        AttendanceRecord.countDocuments({
          schoolId,
          date: { $gte: day, $lt: nextDay },
          role: 'teaching',
          status: 'Present'
        }),
        AttendanceRecord.countDocuments({
          schoolId,
          date: { $gte: day, $lt: nextDay },
          role: 'non-teaching',
          status: 'Present'
        })
      );
    }

    const counts = await Promise.all(trendQueries);

    for (let i = 0; i < 7; i++) {
      trends.students.push(counts[i * 3]);
      trends.teaching.push(counts[i * 3 + 1]);
      trends.nonTeaching.push(counts[i * 3 + 2]);
    }

    return res.json({
      studentsPresent,
      teachingPresent,
      nonTeachingPresent,
      trends
    });

  } catch (error) {
    console.error('Attendance summary error:', error);
    return res.status(500).json({
      error: 'Unable to load attendance summary.'
    });
  }
});

// Attendance records for this school only.
router.get('/attendance/records', adminAuth, async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const { date, role, status, search } = req.query;

    const filter = { schoolId };

    if (date) {
      const start = new Date(date);

      if (Number.isNaN(start.getTime())) {
        return res.status(400).json({
          error: 'Invalid attendance date filter.'
        });
      }

      start.setHours(0, 0, 0, 0);

      const end = new Date(start);
      end.setDate(start.getDate() + 1);

      filter.date = {
        $gte: start,
        $lt: end
      };
    }

    if (role) filter.role = role;
    if (status) filter.status = status;

    if (search) {
      const searchRegex = new RegExp(escapeRegex(search), 'i');

      filter.$or = [
        { name: searchRegex },
        { userId: searchRegex }
      ];
    }

    const records = await AttendanceRecord.find(filter)
      .sort('-date')
      .lean();

    return res.json(records.map(record => ({
      _id: record._id,
      date: record.date,
      name: record.name,
      id: record.userId,
      regNo: record.userId,
      staffId: record.userId,
      role: record.role,
      class: record.class,
      department: record.department,
      status: record.status,
      remark: record.remark,
      recordedBy: record.recordedBy
    })));

  } catch (error) {
    console.error('Load attendance records error:', error);
    return res.status(500).json({
      error: 'Unable to load attendance records.'
    });
  }
});

module.exports = router;
