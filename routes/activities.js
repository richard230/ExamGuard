const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Activity = require('../models/ExamActivity');
const Student = require('../models/Student');
const Exam = require('../models/CBTExam');
const School = require('../models/School');

const { authMiddleware } = require('./auth');
const adminAuth = require('../middleware/adminAuth');

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
  const roles = [
    user.role,
    user.userType,
    user.accountType,
    user.type
  ]
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

  if (!isPlatformAdmin(user)) {
    const belongs = identifiers.some(identifier =>
      identifier === String(school._id) ||
      identifier === String(school.schoolId)
    );

    if (!belongs) {
      const error = new Error(
        'You are not authorized to access this school.'
      );

      error.statusCode = 403;
      throw error;
    }
  }

  return school;
}

function schoolIdForQueries(school) {
  return String(school._id);
}

router.get('/', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await resolveCurrentSchool(req);

    if (!school) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No active school is associated with this account.'
      });
    }

    const schoolId = schoolIdForQueries(school);

    const acts = await Activity.find({ schoolId })
      .populate('student', 'firstname surname class')
      .populate('exam', 'title')
      .sort({ createdAt: -1 });

    res.json(
      acts.map(a => ({
        _id: a._id,
        studentName: (
          (a.student?.firstname || '') +
          ' ' +
          (a.student?.surname || '')
        ).trim(),
        className: a.student?.class,
        examTitle: a.exam?.title,
        startedAt: a.startedAt,
        finishedAt: a.finishedAt,
        status: a.status
      }))
    );

  } catch (err) {
    console.error('Error in GET /activity:', err);

    res.status(err.statusCode || 500).json({
      success: false,
      error: err.message
    });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const school = await resolveCurrentSchool(req);

    if (!school) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No active school is associated with this account.'
      });
    }

    const a = await Activity.findOne({
      _id: req.params.id,
      schoolId: schoolIdForQueries(school)
    })
      .populate('student', 'firstname surname class')
      .populate('exam', 'title');

    if (!a) {
      return res.status(404).json({
        error: 'Activity not found'
      });
    }

    res.json({
      _id: a._id,
      studentName: (
        (a.student?.firstname || '') +
        ' ' +
        (a.student?.surname || '')
      ).trim(),
      className: a.student?.class,
      examTitle: a.exam?.title,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      status: a.status,
      activityLog: a.activityLog
    });

  } catch (err) {
    console.error('Error in GET /activity/:id:', err);

    res.status(err.statusCode || 500).json({
      success: false,
      error: err.message
    });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      student,
      exam,
      action,
      timestamp,
      ...rest
    } = req.body;

    if (!student || !exam || !action) {
      return res.status(400).json({
        error: 'Missing required fields.'
      });
    }

    const school = await resolveCurrentSchool(req);

    if (!school) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No active school is associated with this account.'
      });
    }

    const schoolId = schoolIdForQueries(school);

    const studentDoc = await Student.findOne({
      _id: student,
      schoolId
    });

    if (!studentDoc) {
      return res.status(404).json({
        error: 'Student not found in this school.'
      });
    }

    const examDoc = await Exam.findOne({
      _id: exam,
      schoolId
    });

    if (!examDoc) {
      return res.status(404).json({
        error: 'Exam not found in this school.'
      });
    }

    const activity = new Activity({
      schoolId,
      student,
      exam,
      action,
      timestamp: timestamp
        ? new Date(timestamp)
        : new Date(),
      ...rest
    });

    await activity.save();

    res.status(201).json({
      success: true,
      activityId: activity._id
    });

  } catch (err) {
    console.error('Error in POST /activity:', err);

    res.status(err.statusCode || 500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
