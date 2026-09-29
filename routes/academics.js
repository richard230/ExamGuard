const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const { authMiddleware } = require('./auth');
const Session = require('../models/Session');
const Term = require('../models/Term');
const Class = require('../models/Class');
const ExamSchedule = require('../models/ExamSchedule');
const ExamMode = require('../models/ExamMode');
const CBTMock = require('../models/CBTMock');
const CBTMockResult = require('../models/CBTMockResult');
const Result = require('../models/Result');
const Staff = require('../models/Staff');
const Subject = require('../models/Subject');
const getSchoolId = req => req.user && req.user.schoolId;
const requireSchoolId = (req, res) => {
  const schoolId = getSchoolId(req);
  if (!schoolId) {
    res.status(403).json({ error: 'School context is required' });
    return null;
  }
  return schoolId;
};
router.delete('/subjects/:id', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const subject = await Subject.findOneAndDelete({ _id: req.params.id, schoolId });
  if (!subject) return res.status(404).json({ error: "Subject not found" });
  res.json({ success: true });
});
router.get('/subjects/:id', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const subject = await Subject.findOne({ _id: req.params.id, schoolId });
  if (!subject) return res.status(404).json({ error: "Subject not found" });
  res.json({
    _id: subject._id,
    name: subject.name
  });
});
router.delete('/classes/:classId/subjects/:subjectId', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { classId, subjectId } = req.params;
  let cls = await Class.findOne({ _id: classId, schoolId });
  if (!cls) return res.status(404).json({ error: "Class not found" });
  const initialCount = cls.subjects.length;
  cls.subjects = cls.subjects.filter(s => String(s.subject) !== String(subjectId));
  if (cls.subjects.length === initialCount) {
    return res.status(404).json({ error: "Subject not assigned to this class" });
  }
  await cls.save();
  res.json({ success: true });
});
router.post('/classes/:classId/subjects', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { classId } = req.params;
  const { subjectName, teacherId } = req.body;
  if (!subjectName || !teacherId) return res.status(400).json({ error: "Subject name and teacher required" });
  let subject = await Subject.findOne({ name: subjectName, schoolId });
  if (!subject) {
    subject = new Subject({ name: subjectName, schoolId });
    await subject.save();
  }
  let cls = await Class.findOne({ _id: classId, schoolId });
  if (!cls) return res.status(404).json({ error: "Class not found" });
  if (cls.subjects.some(s => String(s.subject) === String(subject._id))) {
    return res.status(409).json({ error: "Subject already assigned to class" });
  }
  cls.subjects.push({ subject: subject._id, teacher: teacherId });
  await cls.save();
  res.json({
    success: true,
    classId,
    subject: { id: subject._id, name: subject.name },
    teacherId
  });
});
router.get('/cbt/mocks/today/:classId', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  try {
    const classId = req.params.classId;
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const cbts = await CBTMock.find({
      schoolId,
      class: classId,
      date: { $gte: startOfDay, $lt: endOfDay }
    }).populate('class');
    res.json(cbts.map(c => ({
      _id: c._id,
      title: c.title,
      class: c.class ? { _id: c.class._id, name: c.class.name } : undefined,
      mode: c.mode,
      date: c.date
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.post('/classes', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { name, arms, teacherIds } = req.body;
  if (!name) return res.status(400).json({ error: "Class name required" });
  let existing = await Class.findOne({ name, schoolId });
  if (existing) return res.status(409).json({ error: "Class already exists" });
  let teacherArr = [];
  if (teacherIds) {
    teacherArr = Array.isArray(teacherIds) ? teacherIds : [teacherIds];
  }
  const newClass = new Class({
    name, schoolId,
    arms: Array.isArray(arms) ? arms : [],
    teachers: teacherArr,
    subjects: []
  });
  await newClass.save();
  if (teacherArr.length > 0) {
    await Staff.updateMany(
      { _id: { $in: teacherArr }, schoolId },
      { $addToSet: { classes: newClass._id } }
    );
  }
  await newClass.populate('teachers');
  res.status(201).json({
    _id: newClass._id,
    name: newClass.name,
    arms: newClass.arms,
    teachers: newClass.teachers.map(t => ({
      _id: t._id,
      first_name: t.first_name,
      last_name: t.last_name,
      email: t.email
    })),
    subjects: newClass.subjects
  });
});
router.get('/classes', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const classes = await Class.find({ schoolId })
    .populate('teachers')
    .populate({
      path: 'subjects.subject',
      model: 'Subject'
    })
    .populate({
      path: 'subjects.teacher',
      model: 'Staff'
    });
  res.json(classes.map(c => ({
    _id: c._id,
    name: c.name,
    arms: c.arms,
    teachers: c.teachers.map(t => ({
      _id: t._id,
      first_name: t.first_name,
      last_name: t.last_name,
      email: t.email
    })),
    subjects: c.subjects
  })));
});
router.get('/sessions', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const sessions = await Session.find({ schoolId }).sort('-createdAt');
  res.json(sessions.map(s => ({
    _id: s._id,
    name: s.name,
    startDate: s.startDate,
    endDate: s.endDate
  })));
});
router.post('/sessions', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { name, startDate, endDate } = req.body;
  if (!name) return res.status(400).json({ error: "Session name required" });
  let session;
  if (req.body._id) {
    session = await Session.findOneAndUpdate(
      { _id: req.body._id, schoolId },
      { name, startDate, endDate },
      { new: true }
    );
  } else {
    session = new Session({ name, startDate, endDate, schoolId });
    await session.save();
  }
  res.json(session);
});
router.get('/terms', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  try {
    const terms = await Term.find({ schoolId }).populate('session').sort('-createdAt');
    res.json(terms.map(t => ({
      _id: t._id,
      name: t.name,
      session: t.session ? { _id: t.session._id, name: t.session.name } : null,
      startDate: t.startDate,
      endDate: t.endDate
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
router.post('/terms', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { name, sessionId, startDate, endDate } = req.body;
  if (!name || !sessionId) return res.status(400).json({ error: "Term name and session required" });
  let term;
  if (req.body._id) {
    term = await Term.findOneAndUpdate(
      { _id: req.body._id, schoolId },
      { name, session: sessionId, startDate, endDate },
      { new: true }
    );
  } else {
    term = new Term({ name, session: sessionId, startDate, endDate, schoolId });
    await term.save();
  }
  res.json(term);
});
router.delete('/classes/:id', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const cls = await Class.findOneAndDelete({ _id: req.params.id, schoolId });
  if (!cls) return res.status(404).json({ error: "Class not found" });
  res.json({ success: true });
});
router.delete('/exams/schedules/:id', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const exam = await ExamSchedule.findOneAndDelete({ _id: req.params.id, schoolId });
  if (!exam) return res.status(404).json({ error: "Exam schedule not found" });
  res.json({ success: true });
});
router.delete('/cbt/mocks/:id', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const cbt = await CBTMock.findOneAndDelete({ _id: req.params.id, schoolId });
  if (!cbt) return res.status(404).json({ error: "CBT/mock not found" });
  res.json({ success: true });
});
router.delete('/results/cbt-mocks/:id', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const result = await CBTMockResult.findOneAndDelete({ _id: req.params.id, schoolId });
  if (!result) return res.status(404).json({ error: "Result not found" });
  res.json({ success: true });
});
router.delete('/sessions/:id', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const session = await Session.findOneAndDelete({ _id: req.params.id, schoolId });
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json({ success: true });
});
router.delete('/terms/:id', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const term = await Term.findOneAndDelete({ _id: req.params.id, schoolId });
  if (!term) return res.status(404).json({ error: "Term not found" });
  res.json({ success: true });
});
router.get('/exams/schedules', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const schedules = await ExamSchedule.find({ schoolId }).populate('term class').sort('-date');
  res.json(schedules.map(e => ({
    _id: e._id,
    title: e.title,
    term: e.term ? { _id: e.term._id, name: e.term.name } : undefined,
    class: e.class ? { _id: e.class._id, name: e.class.name } : undefined,
    date: e.date
  })));
});
router.post('/exams/schedules', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { title, termId, classId, date } = req.body;
  if (!title || !termId || !classId || !date) return res.status(400).json({ error: "All fields required" });
  let exam;
  if (req.body._id) {
    exam = await ExamSchedule.findOneAndUpdate(
      { _id: req.body._id, schoolId },
      { title, term: termId, class: classId, date },
      { new: true }
    );
  } else {
    exam = new ExamSchedule({ title, term: termId, class: classId, date, schoolId });
    await exam.save();
  }
  res.json(exam);
});
router.get('/exams/modes', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const modes = await ExamMode.find({ schoolId }).populate('exam');
  res.json(modes.map(m => ({
    _id: m._id,
    exam: m.exam ? { _id: m.exam._id, title: m.exam.title } : undefined,
    mode: m.mode,
    duration: m.duration
  })));
});
router.post('/exams/modes', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { examId, mode, duration } = req.body;
  if (!examId || !mode || !duration) return res.status(400).json({ error: "All fields required" });
  let examMode = await ExamMode.findOneAndUpdate(
    { exam: examId, schoolId },
    { mode, duration },
    { upsert: true, new: true }
  );
  res.json(examMode);
});
router.get('/cbt/mocks', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const cbts = await CBTMock.find({ schoolId }).populate('class').sort('-date');
  res.json(cbts.map(c => ({
    _id: c._id,
    title: c.title,
    class: c.class ? { _id: c.class._id, name: c.class.name } : undefined,
    mode: c.mode,
    date: c.date
  })));
});
router.post('/cbt/mocks', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { title, classId, mode, date } = req.body;
  if (!title || !classId || !mode || !date) return res.status(400).json({ error: "All fields required" });
  let cbt;
  if (req.body._id) {
    cbt = await CBTMock.findOneAndUpdate(
      { _id: req.body._id, schoolId },
      { title, class: classId, mode, date },
      { new: true }
    );
  } else {
    cbt = new CBTMock({ title, class: classId, mode, date, schoolId });
    await cbt.save();
  }
  res.json(cbt);
});
router.get('/results/cbt-mocks', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { sessionId, classId, type } = req.query;
  let filter = {};
  if (sessionId) filter.session = sessionId;
  if (classId) filter.class = classId;
  if (type) filter.type = type;
  const results = await CBTMockResult.find({ ...filter, schoolId })
    .populate('student class exam mock')
    .sort('-date');
  res.json(results.map(r => ({
    _id: r._id,
    student: r.student ? { _id: r.student._id, name: r.student.name } : undefined,
    class: r.class ? { _id: r.class._id, name: r.class.name } : undefined,
    type: r.type,
    exam: r.exam ? { _id: r.exam._id, title: r.exam.title } : undefined,
    mock: r.mock ? { _id: r.mock._id, title: r.mock.title } : undefined,
    score: r.score,
    date: r.date
  })));
});
router.get('/sessions/:id', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const session = await Session.findOne({ _id: req.params.id, schoolId });
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json({
    _id: session._id,
    name: session.name,
    startDate: session.startDate,
    endDate: session.endDate
  });
});
router.get('/terms/:id', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const term = await Term.findOne({ _id: req.params.id, schoolId });
  if (!term) return res.status(404).json({ error: "Term not found" });
  res.json({
    _id: term._id,
    name: term.name,
    sessionId: term.session,
    startDate: term.startDate,
    endDate: term.endDate
  });
});
router.get('/exams/schedules/:id', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const exam = await ExamSchedule.findOne({ _id: req.params.id, schoolId });
  if (!exam) return res.status(404).json({ error: "Exam schedule not found" });
  res.json({
    _id: exam._id,
    title: exam.title,
    termId: exam.term,
    classId: exam.class,
    date: exam.date
  });
});
router.get('/exams/modes/:id', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const mode = await ExamMode.findOne({ _id: req.params.id, schoolId });
  if (!mode) return res.status(404).json({ error: "Exam mode not found" });
  res.json({
    _id: mode._id,
    examId: mode.exam,
    mode: mode.mode,
    duration: mode.duration
  });
});
router.get('/cbt/mocks/:id', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const cbt = await CBTMock.findOne({ _id: req.params.id, schoolId });
  if (!cbt) return res.status(404).json({ error: "CBT/mock not found" });
  res.json({
    _id: cbt._id,
    title: cbt.title,
    classId: cbt.class,
    mode: cbt.mode,
    date: cbt.date
  });
});
router.put('/sessions/:id', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { name, startDate, endDate } = req.body;
  const session = await Session.findOneAndUpdate(
    { _id: req.params.id, schoolId },
    { name, startDate, endDate },
    { new: true }
  );
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json(session);
});
router.put('/terms/:id', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { name, sessionId, startDate, endDate } = req.body;
  const term = await Term.findOneAndUpdate(
    { _id: req.params.id, schoolId },
    { name, session: sessionId, startDate, endDate },
    { new: true }
  );
  if (!term) return res.status(404).json({ error: "Term not found" });
  res.json(term);
});
router.put('/exams/schedules/:id', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { title, termId, classId, date } = req.body;
  const exam = await ExamSchedule.findOneAndUpdate(
    { _id: req.params.id, schoolId },
    { title, term: termId, class: classId, date },
    { new: true }
  );
  if (!exam) return res.status(404).json({ error: "Exam schedule not found" });
  res.json(exam);
});
router.put('/exams/modes/:id', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { examId, mode, duration } = req.body;
  const examMode = await ExamMode.findOneAndUpdate(
    { _id: req.params.id, schoolId },
    { exam: examId, mode, duration },
    { new: true }
  );
  if (!examMode) return res.status(404).json({ error: "Exam mode not found" });
  res.json(examMode);
});
router.put('/classes/:id', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { name, arms, teacherIds } = req.body;
  const update = {
    name,
    arms: Array.isArray(arms) ? arms : [],
  };
  if (teacherIds) {
    update.teachers = Array.isArray(teacherIds) ? teacherIds : [teacherIds];
  }
  const cls = await Class.findOneAndUpdate(
    { _id: req.params.id, schoolId },
    update,
    { new: true }
  ).populate('teachers');
  if (!cls) return res.status(404).json({ error: "Class not found" });
  res.json({
    _id: cls._id,
    name: cls.name,
    arms: cls.arms,
    teachers: cls.teachers.map(t => ({
      _id: t._id,
      first_name: t.first_name,
      last_name: t.last_name,
      email: t.email
    })),
    subjects: cls.subjects
  });
});
router.get('/classes/:id', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const cls = await Class.findOne({ _id: req.params.id, schoolId }).populate('teachers');
  if (!cls) return res.status(404).json({ error: "Class not found" });
  res.json({
    _id: cls._id,
    name: cls.name,
    arms: cls.arms,
    teachers: cls.teachers.map(t => ({
      _id: t._id,
      first_name: t.first_name,
      last_name: t.last_name,
      email: t.email
    })),
    subjects: cls.subjects
  });
});
router.put('/cbt/mocks/:id', authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  const { title, classId, mode, date } = req.body;
  const cbt = await CBTMock.findOneAndUpdate(
    { _id: req.params.id, schoolId },
    { title, class: classId, mode, date },
    { new: true }
  );
  if (!cbt) return res.status(404).json({ error: "CBT/mock not found" });
  res.json(cbt);
});
router.post('/push-cbt-results', authMiddleware, authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  try {
    const { cbtResults, scoreField, sessionId, termId } = req.body;
    if (!cbtResults || !Array.isArray(cbtResults) || cbtResults.length === 0) {
      return res.status(400).json({ error: 'No CBT results provided' });
    }
    if (!scoreField) {
      return res.status(400).json({ error: 'Score field not specified' });
    }
    if (!sessionId || !termId) {
      return res.status(400).json({ error: 'Session and Term are required' });
    }
    const validFields = ['ca1_score', 'ca2_score', 'midterm_score', 'exam_score'];
    if (!validFields.includes(scoreField)) {
      return res.status(400).json({ error: 'Invalid score field' });
    }
    const session = await Session.findOne({ _id: sessionId, schoolId });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const term = await Term.findOne({ _id: termId, schoolId });
    if (!term) return res.status(404).json({ error: 'Term not found' });
    const pushedResults = [];
    const errors = [];
    for (const cbtResult of cbtResults) {
      try {
        const { studentId, examId, score, subject, classId } = cbtResult;
        if (!studentId || score === undefined) {
          errors.push({
            exam: examId || 'unknown',
            error: 'Missing student ID or score'
          });
          continue;
        }
        let result = await Result.findOne({
          student: studentId,
          session: sessionId,
          term: termId,
          subject: subject,
          schoolId
        });
        if (!result) {
          result = new Result({
            student: studentId,
            session: sessionId,
            term: termId,
            subject: subject,
            class: classId,
            schoolId
          });
        }
        result[scoreField] = parseFloat(score) || 0;
        const ca1 = parseFloat(result.ca1_score) || 0;
        const ca2 = parseFloat(result.ca2_score) || 0;
        const midterm = parseFloat(result.midterm_score) || 0;
        const exam = parseFloat(result.exam_score) || 0;
        result.total_score = ca1 + ca2 + midterm + exam;
        const total = result.total_score;
        if (total >= 70) {
          result.grade = 'A';
          result.remarks = 'Excellent';
        } else if (total >= 60) {
          result.grade = 'B';
          result.remarks = 'Very Good';
        } else if (total >= 50) {
          result.grade = 'C';
          result.remarks = 'Good';
        } else if (total >= 45) {
          result.grade = 'D';
          result.remarks = 'Pass';
        } else if (total >= 40) {
          result.grade = 'E';
          result.remarks = 'Poor';
        } else {
          result.grade = 'F';
          result.remarks = 'Fail';
        }
        result.status = 'draft';
        result.cbt_result_id = examId;
        await result.save();
        pushedResults.push({
          success: true,
          studentId,
          examId,
          resultId: result._id,
          score: result.total_score,
          grade: result.grade
        });
      } catch (itemErr) {
        console.error('Error processing CBT result:', itemErr);
        errors.push({
          exam: cbtResult.examId || 'unknown',
          error: itemErr.message
        });
      }
    }
    res.json({
      success: true,
      message: `Pushed ${pushedResults.length} CBT results to universal`,
      pushedCount: pushedResults.length,
      errorCount: errors.length,
      pushedResults,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    console.error('Error pushing CBT results:', err);
    res.status(500).json({ error: err.message });
  }
});
router.get('/push-cbt-results/preview', authMiddleware, authMiddleware, adminAuth, async (req, res) => {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;
  try {
    const { examId } = req.query;
    if (!examId) {
      return res.status(400).json({ error: 'Exam ID is required' });
    }
    const cbtResults = await CBTMockResult.find({ mock: examId, schoolId })
      .populate('student', 'first_name surname student_id')
      .populate('class', 'name')
      .limit(100);
    res.json({
      count: cbtResults.length,
      results: cbtResults.map(r => ({
        studentId: r.student?._id,
        studentName: `${r.student?.first_name || ''} ${r.student?.surname || ''}`,
        studentRegNo: r.student?.student_id,
        score: r.score,
        examId: examId,
        classId: r.class?._id
      }))
    });
  } catch (err) {
    console.error('Error previewing CBT results:', err);
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;
