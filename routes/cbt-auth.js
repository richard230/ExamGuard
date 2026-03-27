const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Student = require('../models/Student');
const Exam = require('../models/CBTExam');
const Class = require('../models/Class');

// ✅ NEW: POST /api/cbt/auth/code-login - Student login with exam code
router.post('/code-login', async (req, res) => {
  try {
    const { examCode, classId, studentId } = req.body;
    
    // Validate inputs
    if (!examCode || !classId || !studentId) {
      return res.status(400).json({
        error: 'Missing exam code, class ID, or student ID'
      });
    }
    
    // Find student
    const student = await Student.findById(studentId).populate('class');
    if (!student) {
      return res.status(404).json({
        error: 'Student not found'
      });
    }
    
    // Verify student belongs to the specified class
    if (student.class?._id.toString() !== classId && student.classId?.toString() !== classId) {
      return res.status(403).json({
        error: 'Student does not belong to this class'
      });
    }
    
    // Find exam by code + class
    const exam = await Exam.findOne({
      examCode: examCode.toUpperCase(),
      class: classId,
      isCodeActive: true,
      status: { $in: ['Scheduled', 'Active'] }
    })
      .populate('class', 'name')
      .populate('subject', 'name');
    
    if (!exam) {
      return res.status(404).json({
        error: 'Invalid exam code for this class or exam is not active'
      });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      {
        studentId: student._id,
        examId: exam._id,
        classId: classId,
        type: 'student'
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
    
    res.json({
      success: true,
      token,
      student: {
        _id: student._id,
        name: student.name || `${student.first_name} ${student.last_name}`,
        class: student.class?.name,
        email: student.email
      },
      exam: {
        _id: exam._id,
        title: exam.title,
        duration: exam.duration,
        questions: exam.questions.map(q => ({
          _id: q._id,
          text: q.text,
          options: q.options,
          score: q.score
        }))
      }
    });
  } catch (err) {
    console.error('Code login error:', err);
    res.status(500).json({
      error: 'Authentication failed: ' + err.message
    });
  }
});

// ✅ POST /api/cbt/auth/validate-code - Just validate without login
router.post('/validate-code', async (req, res) => {
  try {
    const { examCode, classId } = req.body;
    
    if (!examCode || !classId) {
      return res.status(400).json({
        error: 'Missing exam code or class ID'
      });
    }
    
    const exam = await Exam.findOne({
      examCode: examCode.toUpperCase(),
      class: classId,
      isCodeActive: true,
      status: { $in: ['Scheduled', 'Active'] }
    })
      .populate('class', 'name')
      .populate('subject', 'name');
    
    if (!exam) {
      return res.status(404).json({
        error: 'Invalid exam code for this class or exam is not active',
        valid: false
      });
    }
    
    res.json({
      success: true,
      valid: true,
      exam: {
        _id: exam._id,
        title: exam.title,
        subject: exam.subject?.name,
        duration: exam.duration
      }
    });
  } catch (err) {
    res.status(500).json({
      error: 'Validation failed: ' + err.message,
      valid: false
    });
  }
});

module.exports = router;
