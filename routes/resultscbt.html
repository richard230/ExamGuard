const express = require('express');
const router = express.Router();
const Result = require('../models/ResultCBT');
const Exam = require('../models/CBTExam');
const Student = require('../models/Student');
const Class = require('../models/Class'); // Ensure this is available
const mongoose = require('mongoose');
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
  ].filter(Boolean).map(value => String(value).trim());
  return [...new Set(values)];
}

function isPlatformAdmin(user = {}) {
  const roles = [user.role, user.userType, user.accountType, user.type]
    .filter(Boolean).map(value => String(value).toLowerCase().trim());
  return roles.some(role => [
    'systemadmin', 'system_admin', 'platformadmin', 'platform_admin'
  ].includes(role));
}

function getRequestedSchoolId(req) {
  return String(
    req.params?.schoolId ||
    req.body?.schoolId ||
    req.query?.schoolId ||
    req.headers?.['x-school-id'] ||
    req.headers?.['x-school-code'] ||
    req.headers?.['x-schoolid'] || ''
  ).trim();
}

async function resolveCurrentSchool(req) {
  const School = require('../models/School');
  const user = req.user || {};
  const identifiers = getUserSchoolIdentifiers(user);
  const requestedId = getRequestedSchoolId(req);
  const schoolIdentifier = requestedId || identifiers[0] || '';

  if (!schoolIdentifier) return null;

  const query = { status: 'active', isDeleted: { $ne: true } };
  if (mongoose.Types.ObjectId.isValid(schoolIdentifier)) query._id = schoolIdentifier;
  else query.schoolId = schoolIdentifier;

  const school = await School.findOne(query).lean();
  if (!school) return null;

  if (!isPlatformAdmin(user)) {
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

function schoolIdForQueries(school) {
  return String(school._id);
}

// GET /api/results - List all results
router.get('/', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await resolveCurrentSchool(req);
    if (!school) return res.status(401).json({ success: false, error: 'Unauthorized: No active school is associated with this account.' });
    const schoolId = schoolIdForQueries(school);
  const results = await Result.find({ schoolId })
    .populate('student', 'firstname surname othernames class')
    .populate({
      path: 'exam',
      populate: [{ path: 'class', select: 'name' }, { path: 'subject', select: 'name' }]
    });

    res.json(results.map(r => ({
      _id: r._id,
      studentName: ((r.student?.firstname || '') + ' ' + (r.student?.surname || '')).trim(),
      className: r.student?.class,
      subjectName: r.exam?.subject?.name,
      examTitle: r.exam?.title,
      score: r.score,
      total: Array.isArray(r.exam?.questions) ? r.exam.questions.reduce((acc, q) => acc + (q.score || 1), 0) : 0,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt
    })));
  } catch (err) {
    console.error('Error in GET /results:', err);
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// DELETE /api/results/:id - Delete a CBT result
router.delete('/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await resolveCurrentSchool(req);
    if (!school) return res.status(401).json({ success: false, error: 'Unauthorized: No active school is associated with this account.' });
    const deleted = await Result.findOneAndDelete({ _id: req.params.id, schoolId: schoolIdForQueries(school) });
    if (!deleted) return res.status(404).json({ error: 'Result not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/result - Save a new CBT result
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { exam, answers, startedAt, finishedAt } = req.body;
    const studentId = req.user ? req.user._id : req.body.student;
    const school = await resolveCurrentSchool(req);
    if (!school) return res.status(401).json({ success: false, error: 'Unauthorized: No active school is associated with this account.' });
    const schoolId = schoolIdForQueries(school);

    if (!exam || !answers || !studentId) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    // Fetch the exam to calculate the score
    const examDoc = await Exam.findOne({ _id: exam, schoolId });
    if (!examDoc) return res.status(400).json({ error: 'Exam not found.' });

    let calculatedScore = 0;
    if (Array.isArray(examDoc.questions) && Array.isArray(answers)) {
      for (let i = 0; i < answers.length; i++) {
        const correct = typeof examDoc.questions[i]?.answer === 'number'
          ? examDoc.questions[i].answer
          : null;
        if (
          answers[i] !== null &&
          typeof answers[i] !== 'undefined' &&
          correct !== null &&
          answers[i] === correct
        ) {
          calculatedScore += examDoc.questions[i]?.score || 1;
        }
      }
    }

    // --- Correct: Always save ObjectId for class ---
    // Find the student's class and always use the Class ObjectId
    const studentDoc = await Student.findOne({ _id: studentId, schoolId });
    if (!studentDoc) return res.status(400).json({ error: 'Student not found.' });
    let classId = studentDoc.class;

    // If it's a string and not an ObjectId, try to resolve using the name
    if (typeof classId === 'string' && !classId.match(/^[a-f\d]{24}$/i)) {
      const classDoc = await Class.findOne({ name: classId, schoolId });
      if (!classDoc) return res.status(400).json({ error: 'Class not found for name: ' + classId });
      classId = classDoc._id;
    }

    const result = new Result({
      student: studentId,
      exam,
      answers,
      score: calculatedScore,
      startedAt,
      finishedAt,
      class: classId, // Must be ObjectId
      schoolId
    });

    await result.save();
    res.status(201).json({ success: true, resultId: result._id, score: calculatedScore });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/results/:id - Get single result
router.get('/:id', authMiddleware, async (req, res) => {
  const school = await resolveCurrentSchool(req);
  if (!school) return res.status(401).json({ success: false, error: 'Unauthorized: No active school is associated with this account.' });
  const r = await Result.findOne({ _id: req.params.id, schoolId: schoolIdForQueries(school) })
    .populate('student', 'firstname surname othernames class')
    .populate({
      path: 'exam',
      populate: [{ path: 'class', select: 'name' }, { path: 'subject', select: 'name' }]
    });

  if (!r) return res.status(404).json({ error: 'Result not found' });
  res.json({
    _id: r._id,
    studentName: ((r.student?.firstname || '') + ' ' + (r.student?.surname || '')).trim(),
    className: r.student?.class,
    subjectName: r.exam?.subject?.name,
    examTitle: r.exam?.title,
    score: r.score,
    total: Array.isArray(r.exam?.questions) ? r.exam.questions.reduce((acc, q) => acc + (q.score || 1), 0) : 0,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    answers: r.answers
  });
});

module.exports = router;
