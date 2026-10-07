const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Exam = require('../models/CBTExam');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const Student = require('../models/Student');
const mongoose = require('mongoose');
const { authMiddleware } = require('./auth');
const adminAuth = require('../middleware/adminAuth');
const School = require('../models/School');


// ============ MULTI-SCHOOL / TENANT HELPERS ============

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

function schoolScope(school) {
  return String(school._id);
}

function schoolFilter(school, extra = {}) {
  return { ...extra, schoolId: schoolScope(school) };
}

// ============ UTILITY FUNCTIONS ============

// ✅ Generate unique exam code (server-side)
function generateUniqueExamCode() {
  // Generate cryptographically secure random code
  // Format: 12 uppercase alphanumeric characters
  return crypto
    .randomBytes(9)
    .toString('hex')
    .toUpperCase()
    .slice(0, 12);
}

// ✅ Validate exam code is unique
async function ensureUniqueExamCode(schoolId) {
  let code, exists;
  let attempts = 0;
  const maxAttempts = 10;
  
  do {
    code = generateUniqueExamCode();
    exists = await Exam.findOne({ examCode: code, schoolId });
    attempts++;
  } while (exists && attempts < maxAttempts);
  
  if (attempts >= maxAttempts) {
    throw new Error('Failed to generate unique exam code after multiple attempts');
  }
  
  return code;
}

// ============ GET ROUTES ============

// GET /api/exam - List all exams
router.get('/', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await resolveCurrentSchool(req);
    if (!school) return res.status(401).json({ success: false, error: 'Unauthorized: No active school is associated with this account.' });
    const exams = await Exam.find(schoolFilter(school))
      .populate('class', 'name')
      .populate('subject', 'name')
      .sort({ createdAt: -1 });
    
    res.json(exams.map(ex => ({
      _id: ex._id,
      title: ex.title,
      className: ex.class?.name,
      subjectName: ex.subject?.name,
      scheduledFor: ex.scheduledFor,
      duration: ex.duration,
      status: ex.status,
      examCode: ex.examCode, // ✅ Include code
      isCodeActive: ex.isCodeActive,
      codeGeneratedAt: ex.codeGeneratedAt,
      questions: ex.questions
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/exam/student - List exams for students (with optional code filtering)
router.get('/student', authMiddleware, async (req, res) => {
  try {
    let statusFilter = req.query.status;
    const school = await resolveCurrentSchool(req);
    if (!school) return res.status(401).json({ success: false, error: 'Unauthorized: No active school is associated with this account.' });
    let query = { schoolId: schoolScope(school), isCodeActive: true }; // ✅ Only active codes
    
    if (statusFilter) {
      let statusArray = statusFilter.split(',').map(s => s.trim());
      query.status = { $in: statusArray };
    }
    
    // ✅ If exam code provided, filter by it
    if (req.query.code) {
      query.examCode = req.query.code;
    }
    
    // ✅ If class provided, filter by it
    if (req.query.class) {
      query.class = req.query.class;
    }
    
    const exams = await Exam.find(query)
      .populate('class', 'name')
      .populate('subject', 'name')
      .sort({ createdAt: -1 });
    
    res.json(exams.map(ex => ({
      _id: ex._id,
      title: ex.title,
      className: ex.class?.name,
      subjectName: ex.subject?.name,
      scheduledFor: ex.scheduledFor,
      duration: ex.duration,
      status: ex.status,
      examCode: ex.examCode, // ✅ Include code
      questions: ex.questions
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ NEW: GET /api/exam/validate-code - Validate exam code + class combo
router.post('/validate-code', authMiddleware, async (req, res) => {
  try {
    const { examCode, classId } = req.body;
    const school = await resolveCurrentSchool(req);
    if (!school) return res.status(401).json({ success: false, error: 'Unauthorized: No active school is associated with this account.' });
    
    if (!examCode || !classId) {
      return res.status(400).json({ 
        error: 'Missing exam code or class ID' 
      });
    }
    
    // Validate exam code format (basic check)
    if (examCode.length < 6 || examCode.length > 20) {
      return res.status(400).json({ 
        error: 'Invalid exam code format' 
      });
    }
    
    // Find exam by code + class
    const exam = await Exam.findOne({
      schoolId: schoolScope(school),
      examCode: examCode.toUpperCase(),
      class: classId,
      isCodeActive: true,
      status: { $in: ['Scheduled', 'Active'] }
    })
      .populate('class', 'name')
      .populate('subject', 'name');
    
    if (!exam) {
      return res.status(404).json({ 
        error: 'Exam code not found for this class or exam is not active' 
      });
    }
    
    res.json({
      success: true,
      exam: {
        _id: exam._id,
        title: exam.title,
        class: exam.class.name,
        subject: exam.subject?.name,
        duration: exam.duration,
        scheduledFor: exam.scheduledFor,
        questions: exam.questions.map(q => ({
          text: q.text,
          options: q.options,
          score: q.score
        }))
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ POST ROUTES ============

// ✅ UPDATED: POST /api/exam - Create exam
router.post('/', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { title, class: classId, subject, duration, questions } = req.body;
    const school = await resolveCurrentSchool(req);
    if (!school) return res.status(401).json({ success: false, error: 'Unauthorized: No active school is associated with this account.' });
    
    if (!title || !classId || !subject || !duration || !questions) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }
    
    const exam = new Exam({ 
      schoolId: schoolScope(school),
      title, 
      class: classId, 
      subject, 
      duration, 
      questions,
      // ✅ Don't generate code yet - wait for scheduling
    });
    
    await exam.save();
    
    res.status(201).json({ 
      success: true, 
      examId: exam._id,
      exam: {
        _id: exam._id,
        title: exam.title,
        examCode: exam.examCode || null
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ UPDATED: PATCH /api/exam/:id/schedule - Set schedule WITH code generation
router.patch('/:id/schedule', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { scheduledFor } = req.body;
    const school = await resolveCurrentSchool(req);
    if (!school) return res.status(401).json({ success: false, error: 'Unauthorized: No active school is associated with this account.' });
    
    if (!scheduledFor) {
      return res.status(400).json({ error: 'Missing scheduled date.' });
    }
    
    const exam = await Exam.findOne({ _id: req.params.id, schoolId: schoolScope(school) });
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    
    // ✅ Generate code if it doesn't exist
    if (!exam.examCode) {
      exam.examCode = await ensureUniqueExamCode(schoolScope(school));
      exam.codeGeneratedAt = new Date();
      exam.isCodeActive = true;
    }
    
    exam.scheduledFor = scheduledFor;
    exam.status = 'Scheduled';
    
    await exam.save();
    
    res.json({ 
      success: true,
      exam: {
        _id: exam._id,
        examCode: exam.examCode,
        codeGeneratedAt: exam.codeGeneratedAt
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ NEW: POST /api/exam/:id/deactivate-code - Deactivate exam code
router.post('/:id/deactivate-code', authMiddleware, adminAuth, async (req, res) => {
  try {
    const exam = await Exam.findOneAndUpdate(
      { _id: req.params.id, schoolId: schoolScope(school) },
      { isCodeActive: false },
      { new: true }
    );
    
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    
    res.json({ 
      success: true, 
      message: 'Exam code deactivated. Students can no longer use this code.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ NEW: POST /api/exam/:id/activate-code - Reactivate exam code
router.post('/:id/activate-code', authMiddleware, adminAuth, async (req, res) => {
  try {
    const exam = await Exam.findOneAndUpdate(
      { _id: req.params.id, schoolId: schoolScope(school) },
      { isCodeActive: true },
      { new: true }
    );
    
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    
    res.json({ 
      success: true, 
      message: 'Exam code activated.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/exam/:id/stop - Stop exam
router.post('/:id/stop', authMiddleware, adminAuth, async (req, res) => {
  try {
    const exam = await Exam.findOneAndUpdate(
      { _id: req.params.id, schoolId: schoolScope(school) }, 
      { 
        status: 'Stopped',
        isCodeActive: false // ✅ Also deactivate code when stopping
      }, 
      { new: true }
    );
    
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ PUT ROUTES ============

// ✅ UPDATED: PUT /api/exam/:id - Update exam
router.put('/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { title, duration, questions, scheduledFor } = req.body;
    const school = await resolveCurrentSchool(req);
    if (!school) return res.status(401).json({ success: false, error: 'Unauthorized: No active school is associated with this account.' });
    
    const updateData = {};
    if (title) updateData.title = title;
    if (duration) updateData.duration = duration;
    if (questions) updateData.questions = questions;
    if (scheduledFor) updateData.scheduledFor = scheduledFor;
    
    const exam = await Exam.findOne({ _id: req.params.id, schoolId: schoolScope(school) });
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    
    // ✅ Generate code if scheduling and code doesn't exist
    if (scheduledFor && !exam.examCode) {
      updateData.examCode = await ensureUniqueExamCode(schoolScope(school));
      updateData.codeGeneratedAt = new Date();
      updateData.isCodeActive = true;
      updateData.status = 'Scheduled';
    }
    
    Object.assign(exam, updateData);
    await exam.save();
    
    res.json({ 
      success: true, 
      exam: {
        _id: exam._id,
        examCode: exam.examCode
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ DELETE ROUTES ============

// DELETE /api/exam/:id - Delete exam
router.delete('/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await resolveCurrentSchool(req);
    if (!school) return res.status(401).json({ success: false, error: 'Unauthorized: No active school is associated with this account.' });
    const exam = await Exam.findOneAndDelete({
      _id: req.params.id,
      schoolId: schoolScope(school)
    });
    
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ GET ROUTES (SUMMARY) ============

// GET /api/exam/summary - Fetch exam summaries only (no questions)
router.get('/summary', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await resolveCurrentSchool(req);
    if (!school) return res.status(401).json({ success: false, error: 'Unauthorized: No active school is associated with this account.' });
    const exams = await Exam.find(schoolFilter(school))
      .populate('class', 'name')
      .populate('subject', 'name')
      .sort({ createdAt: -1 });
    
    res.json(exams.map(ex => ({
      _id: ex._id,
      title: ex.title,
      class: ex.class?._id,
      className: ex.class?.name,
      subject: ex.subject?._id,
      subjectName: ex.subject?.name,
      duration: ex.duration,
      status: ex.status,
      scheduledFor: ex.scheduledFor,
      examCode: ex.examCode, // ✅ Include code
      isCodeActive: ex.isCodeActive
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ MERGE ROUTES ============

// ✅ UPDATED: POST /api/exam/merge - Merge selected exams into a new exam
router.post('/merge', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { examIds, title, class: classId, subject, duration, scheduledFor } = req.body;
    const school = await resolveCurrentSchool(req);
    if (!school) return res.status(401).json({ success: false, error: 'Unauthorized: No active school is associated with this account.' });
    
    if (!examIds || !Array.isArray(examIds) || examIds.length < 1) {
      return res.status(400).json({ error: 'Select at least two exams to merge.' });
    }
    
    const exams = await Exam.find({ _id: { $in: examIds }, schoolId: schoolScope(school) });
    if (exams.length !== examIds.length) {
      return res.status(404).json({ error: 'One or more exams not found.' });
    }

    let mergedQuestions = [];
    exams.forEach(ex => {
      (ex.questions || []).forEach(q => mergedQuestions.push(q));
    });

    const examTitle = title || exams[0].title + ' (Merged)';
    const examClass = classId || exams[0].class;
    const examSubject = subject || exams[0].subject;
    const examDuration = duration || exams[0].duration;
    const examScheduledFor = scheduledFor || null;

    // ✅ Generate code if scheduling
    let examCode = null;
    let codeGeneratedAt = null;
    if (examScheduledFor) {
      examCode = await ensureUniqueExamCode(schoolScope(school));
      codeGeneratedAt = new Date();
    }

    const mergedExam = new Exam({
      schoolId: schoolScope(school),
      title: examTitle,
      class: examClass,
      subject: examSubject,
      duration: examDuration,
      scheduledFor: examScheduledFor,
      status: examScheduledFor ? 'Scheduled' : 'Draft',
      questions: mergedQuestions,
      examCode: examCode,
      codeGeneratedAt: codeGeneratedAt,
      isCodeActive: !!examCode
    });
    
    await mergedExam.save();
    
    res.status(201).json({ 
      success: true, 
      examId: mergedExam._id,
      examCode: examCode,
      exam: {
        _id: mergedExam._id,
        title: mergedExam.title,
        examCode: examCode
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/exam/bulk-details?ids=id1,id2,...
router.get('/bulk-details', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await resolveCurrentSchool(req);
    if (!school) return res.status(401).json({ success: false, error: 'Unauthorized: No active school is associated with this account.' });
    const ids = (req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
    
    if (!ids.length) return res.status(400).json({ error: 'No ids provided.' });
    
    const exams = await Exam.find({ _id: { $in: ids }, schoolId: schoolScope(school) })
      .populate('class', 'name')
      .populate('subject', 'name');
    
    res.json(exams.map(ex => ({
      _id: ex._id,
      title: ex.title,
      className: ex.class?.name,
      subjectName: ex.subject?.name,
      duration: ex.duration,
      status: ex.status,
      scheduledFor: ex.scheduledFor,
      examCode: ex.examCode, // ✅ Include code
      isCodeActive: ex.isCodeActive,
      questions: ex.questions
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/exam/:id - Get single exam
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const ex = await Exam.findById(req.params.id)
      .populate('class', 'name')
      .populate('subject', 'name');
    
    if (!ex) return res.status(404).json({ error: 'Exam not found' });
    
    res.json({
      _id: ex._id,
      title: ex.title,
      className: ex.class?.name,
      subjectName: ex.subject?.name,
      duration: ex.duration,
      status: ex.status,
      scheduledFor: ex.scheduledFor,
      examCode: ex.examCode, // ✅ Include code
      isCodeActive: ex.isCodeActive,
      codeGeneratedAt: ex.codeGeneratedAt,
      questions: ex.questions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
