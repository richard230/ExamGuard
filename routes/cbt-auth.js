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
    const { examCode, classId, studentId, schoolId } = req.body;

    // ---------- VALIDATION ----------
    if (!examCode || !classId || !studentId) {
      return res.status(400).json({
        error: 'examCode, classId, studentId required'
      });
    }

    // ---------- STUDENT / SCHOOL CONTEXT ----------
    // The student's stored school is authoritative; never trust a schoolId
    // supplied by the browser without checking it against the student record.
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (!student.schoolId) {
      return res.status(403).json({ error: 'Student account is not associated with a school.' });
    }

    const studentSchoolId = student.schoolId.toString();
    if (schoolId && String(schoolId) !== studentSchoolId) {
      return res.status(403).json({ error: 'Student does not belong to the selected school.' });
    }

    if (!student.class) {
      return res.status(400).json({ error: 'Student class missing' });
    }

    // ---------- CLASS LOOKUP ----------
    const classDoc = await Class.findOne({
      name: classId, // e.g. "SS1"
      schoolId: student.schoolId
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
      class: classDoc._id,
      schoolId: student.schoolId,
      isCodeActive: true,
      status: { $in: ['Scheduled', 'Active'] }
    });

    if (!exam) {
      return res.status(404).json({
        error: 'Invalid exam code or exam not active'
      });
    }

    // ---------- TOKEN ----------
    // authMiddleware identifies accounts using decoded.id and verifies with
    // process.env.JWT_SECRET. Include both the expected id and school context.
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not configured; refusing to issue a CBT token.');
      return res.status(500).json({ error: 'Authentication is not configured on the server.' });
    }

    const token = jwt.sign(
      {
        id: student._id.toString(),
        studentId: student._id.toString(),
        schoolId: studentSchoolId,
        examId: exam._id.toString(),
        classId: classDoc._id.toString(),
        role: 'student',
        type: 'student'
      },
      process.env.JWT_SECRET,
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
    const { examCode, classId, schoolId } = req.body;

    if (!examCode || !classId || !schoolId) {
      return res.status(400).json({
        error: 'examCode, classId and schoolId required',
        valid: false
      });
    }

    // ---------- CLASS (SCHOOL-SCOPED) ----------
    const classDoc = await Class.findOne({
      name: classId,
      schoolId
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
      schoolId,
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
