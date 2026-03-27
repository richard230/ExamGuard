// /routes/cbt-auth.js

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const Student = require('../models/Student');
const Exam = require('../models/CBTExam');
const Class = require('../models/Class');

// ================= HELPERS =================
function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function getStudentName(student) {
  if (student.name) return student.name;
  return `${student.firstname || ''} ${student.surname || ''}`.trim() || 'Student';
}

// ================= CODE LOGIN =================
router.post('/code-login', async (req, res) => {
  try {
    const { examCode, classId, studentId } = req.body;

    // ---------- VALIDATION ----------
    if (!examCode || !classId || !studentId) {
      return res.status(400).json({
        error: 'examCode, classId, studentId required'
      });
    }

    // ---------- STUDENT ----------
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (!student.class) {
      return res.status(400).json({ error: 'Student class missing' });
    }

    // ---------- CLASS LOOKUP ----------
    const classDoc = await Class.findOne({
      name: classId // e.g. "SS1"
    });

    if (!classDoc) {
      return res.status(404).json({
        error: 'Class not found'
      });
    }

    // ---------- CLASS VALIDATION ----------
    const studentClass = student.class.toString().toUpperCase();
    const incomingClass = classDoc.name.toUpperCase();

    if (studentClass !== incomingClass) {
      return res.status(403).json({
        error: 'Student does not belong to this class'
      });
    }

    // ---------- EXAM ----------
    const exam = await Exam.findOne({
      examCode: normalizeCode(examCode),
      class: classDoc._id, // ✅ FIXED
      isCodeActive: true,
      status: { $in: ['Scheduled', 'Active'] }
    });

    if (!exam) {
      return res.status(404).json({
        error: 'Invalid exam code or exam not active'
      });
    }

    // ---------- TOKEN ----------
    const token = jwt.sign(
      {
        studentId: student._id,
        examId: exam._id,
        classId: classDoc._id,
        type: 'student'
      },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '12h' }
    );

    // ---------- RESPONSE ----------
    return res.json({
      success: true,
      token,

      student: {
        _id: student._id,
        name: getStudentName(student),
        class: classDoc.name,
        email: student.studentEmail || student.email || '-'
      },

      exam: {
        _id: exam._id,
        title: exam.title,
        subject: exam.subjectName || exam.subject || '',
        duration: exam.duration,

        questions: (exam.questions || []).map(q => ({
          _id: q._id,
          text: q.text,
          options: q.options,
          score: q.score || 1
        }))
      }
    });

  } catch (err) {
    console.error('Code login error:', err);
    return res.status(500).json({
      error: 'Authentication failed'
    });
  }
});

// ================= VALIDATE CODE =================
router.post('/validate-code', async (req, res) => {
  try {
    const { examCode, classId } = req.body;

    if (!examCode || !classId) {
      return res.status(400).json({
        error: 'examCode and classId required',
        valid: false
      });
    }

    // ---------- CLASS ----------
    const classDoc = await Class.findOne({
      name: classId
    });

    if (!classDoc) {
      return res.status(404).json({
        error: 'Class not found',
        valid: false
      });
    }

    // ---------- EXAM ----------
    const exam = await Exam.findOne({
      examCode: normalizeCode(examCode),
      class: classDoc._id,
      isCodeActive: true,
      status: { $in: ['Scheduled', 'Active'] }
    });

    if (!exam) {
      return res.status(404).json({
        error: 'Invalid or inactive exam',
        valid: false
      });
    }

    return res.json({
      success: true,
      valid: true,
      exam: {
        _id: exam._id,
        title: exam.title,
        subject: exam.subjectName || exam.subject || '',
        duration: exam.duration
      }
    });

  } catch (err) {
    console.error('Validate code error:', err);
    return res.status(500).json({
      error: 'Validation failed',
      valid: false
    });
  }
});

module.exports = router;
