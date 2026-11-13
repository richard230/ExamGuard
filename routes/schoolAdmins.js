
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const AdmissionSetup = require('../models/AdmissionSetup');
const AdmissionApplication = require('../models/AdmissionApplication');
const AttendanceRecord = require('../models/AttendanceRecord');
const Session = require('../models/Session');
const Class = require('../models/Class');
const Arm = require('../models/Arm');

const adminAuth = require('../middleware/adminAuth');

// ============================================================
// SCHOOL / TENANT HELPERS
// ============================================================

function getSchoolId(req) {
  const user = req.user || {};

  const schoolId =
    user.schoolId ||
    user.school?.schoolId ||
    user.school?._id ||
    null;

  return schoolId ? String(schoolId) : null;
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

// Create or update an admission setup for the authenticated school.
router.post('/admission/setup', adminAuth, async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const {
      session,
      term,
      classId,
      armId,
      startDate,
      endDate,
      applicationFee
    } = req.body || {};

    // Session, term, class and dates are required.
    // Arm and application fee are optional.
    if (!session || !term || !classId || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Session, term, class, start date and end date are required.'
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(session) ||
      !mongoose.Types.ObjectId.isValid(classId)
    ) {
      return res.status(400).json({
        error: 'Invalid session or class selected.'
      });
    }

    if (
      armId &&
      !mongoose.Types.ObjectId.isValid(armId)
    ) {
      return res.status(400).json({
        error: 'Invalid arm selected.'
      });
    }

    if (!VALID_TERMS.includes(term)) {
      return res.status(400).json({
        error: 'Invalid term selected.'
      });
    }

    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);

    if (
      Number.isNaN(parsedStartDate.getTime()) ||
      Number.isNaN(parsedEndDate.getTime()) ||
      parsedEndDate < parsedStartDate
    ) {
      return res.status(400).json({
        error: 'Please provide valid admission dates.'
      });
    }

    const fee =
      applicationFee === '' ||
      applicationFee === undefined ||
      applicationFee === null
        ? 0
        : Number(applicationFee);

    if (!Number.isFinite(fee) || fee < 0) {
      return res.status(400).json({
        error: 'Application fee must be a valid non-negative amount.'
      });
    }

    // Normalize the authenticated school ID.
    // Session and Class schemas store schoolId as an ObjectId.
    const schoolObjectId = new mongoose.Types.ObjectId(String(schoolId));
    const schoolStringId = String(schoolObjectId);

    // Confirm that selected records belong to the authenticated school.
    const [sessionRecord, classRecord, armRecord] = await Promise.all([
      Session.findOne({
        _id: session,
        schoolId: schoolObjectId
      }).select('_id name schoolId'),

      Class.findOne({
        _id: classId,
        schoolId: schoolObjectId
      }).select('_id name schoolId'),

      armId
        ? Arm.findOne({
            _id: armId,
            schoolId: schoolObjectId
          }).select('_id name schoolId')
        : Promise.resolve(null)
    ]);

    if (!sessionRecord) {
      return res.status(400).json({
        error: 'The selected session could not be found for this school.'
      });
    }

    if (!classRecord) {
      return res.status(400).json({
        error: 'The selected class could not be found for this school.'
      });
    }

    if (armId && !armRecord) {
      return res.status(400).json({
        error: 'The selected arm could not be found for this school.'
      });
    }

    // AdmissionSetup uses "class" and "arm", not "classId" and "armId".
    // Its schoolId field is a String, unlike Session and Class.
    const setupFilter = {
      schoolId: schoolStringId,
      session: sessionRecord._id,
      term,
      class: classRecord._id,
      arm: armId ? armRecord._id : null
    };

    const updateFields = {
      schoolId: schoolStringId,
      session: sessionRecord._id,
      term,
      class: classRecord._id,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      applicationFee: fee,
      updatedAt: new Date()
    };

    // Explicitly clear the arm when no arm was selected.
    if (armId) {
      updateFields.arm = armRecord._id;
    } else {
      updateFields.$unset = { arm: 1 };
    }

    const setup = await AdmissionSetup.findOneAndUpdate(
      setupFilter,
      {
        $set: {
          schoolId: schoolStringId,
          session: sessionRecord._id,
          term,
          class: classRecord._id,
          startDate: parsedStartDate,
          endDate: parsedEndDate,
          applicationFee: fee,
          updatedAt: new Date()
        },
        ...(armId ? {} : { $unset: { arm: 1 } })
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    );

    await setup.populate([
      { path: 'session', select: 'name' },
      { path: 'class', select: 'name' },
      { path: 'arm', select: 'name' }
    ]);

    return res.status(200).json({
      message: 'Admission setup saved successfully.',
      setup
    });

  } catch (error) {
    console.error('Admission setup error:', {
      message: error.message,
      stack: error.stack,
      userId: req.user?.id,
      schoolId: req.user?.schoolId
    });

    return res.status(500).json({
      error: 'Unable to save admission setup.',
      details: error.message
    });
  }
});
// List admission setups belonging only to the authenticated school.
router.get('/admission/setups', adminAuth, async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const setups = await AdmissionSetup.find({ schoolId })
      .populate('session', 'name')
      .populate('class', 'name')
      .populate('arm', 'name')
      .sort('-createdAt')
      .lean();

    return res.json(setups);

  } catch (error) {
    console.error('Load admission setups error:', error);
    return res.status(500).json({
      error: 'Unable to load admission setups.'
    });
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

    const applications = await AdmissionApplication.find({ schoolId })
      .populate('session', 'name')
      .populate('classId', 'name')
      .populate('armId', 'name')
      .sort('-createdAt')
      .lean();

    return res.json(applications.map(app => ({
      _id: app._id,
      name: app.name,
      sessionName: app.session?.name,
      term: app.term,
      className: app.classId?.name,
      armName: app.armId?.name,
      dateApplied: app.dateApplied,
      status: app.status,
      email: app.email,
      phone: app.phone,
      documents: app.documents
    })));

  } catch (error) {
    console.error('Load admission applications error:', error);
    return res.status(500).json({
      error: 'Unable to load admission applications.'
    });
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

    const app = await AdmissionApplication.findOne({
      _id: id,
      schoolId
    })
      .populate('session', 'name')
      .populate('classId', 'name')
      .populate('armId', 'name')
      .lean();

    if (!app) {
      return res.status(404).json({
        error: 'Application not found.'
      });
    }

    return res.json({
      _id: app._id,
      name: app.name,
      sessionName: app.session?.name,
      term: app.term,
      className: app.classId?.name,
      armName: app.armId?.name,
      dateApplied: app.dateApplied,
      status: app.status,
      email: app.email,
      phone: app.phone,
      documents: app.documents
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
      {
        _id: id,
        schoolId
      },
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
