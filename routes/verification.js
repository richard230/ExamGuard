const express = require('express');
const router = express.Router();
const Result = require('../models/Result');
const Student = require('../models/Student');
const School = require('../models/School');
const Session = require('../models/Session');
const Term = require('../models/Term');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const UniversalUpload = require('../models/UniversalUpload');
const { authMiddleware } = require('./auth');

/**
 * POST /api/verify-student-report
 * Verify student report from universal cloud
 * 
 * Body:
 * - schoolId: School ID
 * - regNo: Student registration number
 * - scratchCard: Verification code (scratch card)
 * - sessionId: Session ID
 * - termId: Term ID
 * - classLevelId: Class ID
 * - verificationPurpose: Purpose of verification
 * - institutionName: Requesting institution name
 */
router.post('/verify-student-report', authMiddleware, async (req, res) => {
  try {
    const {
      schoolId,
      regNo,
      scratchCard,
      sessionId,
      termId,
      classLevelId,
      verificationPurpose,
      institutionName
    } = req.body;

    // Validate required fields
    if (!schoolId || !regNo || !scratchCard || !sessionId || !termId || !classLevelId) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'Missing required fields'
      });
    }

    // Step 1: Verify school exists and is active
    const school = await School.findById(schoolId);
    if (!school || school.status !== 'active') {
      return res.status(404).json({
        success: false,
        verified: false,
        message: 'School not found or inactive'
      });
    }

    // Step 2: Find student by registration number
    const student = await Student.findOne({
      $or: [
        { regNo: regNo },
        { student_id: regNo }
      ],
      school: schoolId
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        verified: false,
        message: 'Student not found in this school'
      });
    }

    // Step 3: Verify scratch card (simple validation - you can enhance this)
    // In production, you might want to check against a scratch card database
    // For now, we'll accept any non-empty scratch card
    if (!scratchCard || scratchCard.length < 4) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'Invalid scratch card code'
      });
    }

    // Step 4: Fetch results from universal cloud for this student/session/term
    const results = await Result.find({
      student: student._id,
      session: sessionId,
      term: termId,
      class: classLevelId,
      status: 'Published'
    })
      .populate('student', 'name regNo student_id')
      .populate('session', 'name startDate endDate')
      .populate('term', 'name')
      .populate('class', 'name')
      .populate('subject', 'name')
      .sort('subject');

    if (!results || results.length === 0) {
      return res.status(404).json({
        success: false,
        verified: false,
        message: 'No published results found for this student in the selected session/term'
      });
    }

    // Step 5: Get session, term, and class details
    const session = await Session.findById(sessionId);
    const term = await Term.findById(termId);
    const classLevel = await Class.findById(classLevelId);

    if (!session || !term || !classLevel) {
      return res.status(404).json({
        success: false,
        verified: false,
        message: 'Session, term, or class not found'
      });
    }

    // Step 6: Calculate aggregate data
    let totalScore = 0;
    let totalGradePoints = 0;
    const subjects = [];

    results.forEach(result => {
      const subjectTotal = (parseFloat(result.ca1_score) || 0) +
        (parseFloat(result.ca2_score) || 0) +
        (parseFloat(result.midterm_score) || 0) +
        (parseFloat(result.exam_score) || 0);

      totalScore += subjectTotal;
      totalGradePoints += parseFloat(result.grade) || 0;

      subjects.push({
        name: result.subject?.name || 'Unknown',
        ca1: result.ca1_score || 0,
        ca2: result.ca2_score || 0,
        midterm: result.midterm_score || 0,
        exam: result.exam_score || 0,
        total: subjectTotal,
        grade: result.grade || '-',
        position: result.subject_position || '-'
      });
    });

    // Calculate overall grade
    const averageScore = subjects.length > 0 ? totalScore / subjects.length : 0;
    let overallGrade = 'F';
    if (averageScore >= 70) overallGrade = 'A';
    else if (averageScore >= 60) overallGrade = 'B';
    else if (averageScore >= 50) overallGrade = 'C';
    else if (averageScore >= 45) overallGrade = 'D';
    else if (averageScore >= 40) overallGrade = 'E';

    // Step 7: Generate verification code
    const verificationCode = `VER-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Step 8: Log verification in universal upload (for audit trail)
    await UniversalUpload.findOneAndUpdate(
      { schoolRef: schoolId },
      {
        $push: {
          verifications: {
            studentId: student._id,
            verificationCode,
            verificationPurpose,
            requestingInstitution: institutionName,
            verificationTimestamp: new Date(),
            scratcCardHash: scratchCard // Store hash in production
          }
        }
      },
      { upsert: true }
    );

    // Step 9: Return verified report
    res.json({
      success: true,
      verified: true,
      message: 'Report verified successfully',
      data: {
        verificationCode,
        studentName: student.name || 'Unknown',
        regNo: student.regNo || student.student_id,
        school: {
          _id: school._id,
          name: school.schoolName
        },
        session: {
          _id: session._id,
          name: session.name
        },
        term: {
          _id: term._id,
          name: term.name
        },
        classLevel: {
          _id: classLevel._id,
          name: classLevel.name
        },
        totalScore: totalScore.toFixed(2),
        averageScore: averageScore.toFixed(2),
        overallGrade,
        subjects,
        issueDate: new Date(),
        verificationPurpose,
        requestingInstitution: institutionName,
        skills: {
          punctuality: '-',
          obedience: '-',
          honesty: '-',
          cleanliness: '-',
          initiative: '-',
          cooperation: '-'
        },
        attendance: {
          present: '-',
          absent: '-',
          rate: 0
        },
        teacherComment: {
          comment: 'No comment on record',
          teacherName: 'Unknown'
        },
        principalRemark: {
          remark: 'No remark on record',
          principalName: 'Unknown'
        }
      }
    });

  } catch (error) {
    console.error('Error verifying student report:', error);
    res.status(500).json({
      success: false,
      verified: false,
      message: 'Error verifying report',
      error: error.message
    });
  }
});

/**
 * GET /api/verification-history
 * Get verification history for current user/institution
 */
router.get('/verification-history', authMiddleware, async (req, res) => {
  try {
    // For now, return empty history
    // In production, you'd track verifications per institution
    res.json({
      success: true,
      data: []
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching verification history',
      error: error.message
    });
  }
});

module.exports = router;
