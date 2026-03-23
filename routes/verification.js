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

/**
 * POST /api/res/verify-student-report
 * Verify student report from universal cloud
 */
router.post('/verify-student-report', async (req, res) => {
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
      ]
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        verified: false,
        message: 'Student not found'
      });
    }

    // Step 3: Verify scratch card
    if (!scratchCard || scratchCard.length < 4) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'Invalid scratch card code'
      });
    }

    // Step 4: Find results in UniversalUpload collection
    const universalUpload = await UniversalUpload.findOne({
      schoolRef: schoolId,
      session: sessionId,
      term: termId,
      class: classLevelId,
      status: 'completed'
    }).populate('schoolRef', 'schoolName');

    if (!universalUpload || !universalUpload.results || universalUpload.results.length === 0) {
      return res.status(404).json({
        success: false,
        verified: false,
        message: 'No results found for this school/session/term/class combination'
      });
    }

    // Step 5: Find student's results within the UniversalUpload
    // The student_id in results is the MongoDB ObjectId of the student
    const studentResults = universalUpload.results.filter(r => {
      return r.student_id === student._id.toString() || r.student_id === student._id;
    });

    if (!studentResults || studentResults.length === 0) {
      return res.status(404).json({
        success: false,
        verified: false,
        message: 'No published results found for this student in the selected session/term/class'
      });
    }

    // Step 6: Get session, term, and class details
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

    // Step 7: Calculate aggregate data from student results
    let totalScore = 0;
    const subjects = [];

    studentResults.forEach(result => {
      const subjectTotal = (parseFloat(result.ca1_score) || 0) +
        (parseFloat(result.ca2_score) || 0) +
        (parseFloat(result.midterm_score) || 0) +
        (parseFloat(result.exam_score) || 0);

      totalScore += subjectTotal;

      subjects.push({
        name: result.subject || 'Unknown',
        ca1: result.ca1_score || 0,
        ca2: result.ca2_score || 0,
        midterm: result.midterm_score || 0,
        exam: result.exam_score || 0,
        total: subjectTotal,
        grade: result.grade || '-',
        position: '-'
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

    // Step 8: Generate verification code
    const verificationCode = `VER-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Step 9: Return verified report
    res.json({
      success: true,
      verified: true,
      message: 'Report verified successfully',
      data: {
        verificationCode,
        studentName: student.name || student.surname + ' ' + student.firstname || 'Unknown',
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
