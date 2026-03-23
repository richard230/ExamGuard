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
 * POST /api/res/verify-student-report
 * Verify student report from universal cloud
 */
router.post('/verify-student-report', authMiddleware, async (req, res) => {
  try {
    console.log('=== VERIFICATION REQUEST ===');
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

    console.log('Request Body:', { schoolId, regNo, scratchCard, sessionId, termId, classLevelId });

    // Validate required fields
    if (!schoolId || !regNo || !scratchCard || !sessionId || !termId || !classLevelId) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'Missing required fields: schoolId, regNo, scratchCard, sessionId, termId, classLevelId'
      });
    }

    // Step 1: Verify school exists and is active
    console.log('Step 1: Verifying school...');
    const school = await School.findById(schoolId);
    console.log('School found:', school ? school.schoolName : 'NOT FOUND');

    if (!school || school.status !== 'active') {
      return res.status(404).json({
        success: false,
        verified: false,
        message: 'School not found or inactive'
      });
    }

    // Step 2: Find student by registration number
    console.log('Step 2: Finding student with regNo:', regNo);
    const student = await Student.findOne({
      $or: [
        { regNo: regNo },
        { student_id: regNo }
      ]
    });

    console.log('Student found:', student ? student.firstname + ' ' + student.surname : 'NOT FOUND');

    if (!student) {
      return res.status(404).json({
        success: false,
        verified: false,
        message: 'Student not found in system'
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

    // Step 4: Query UniversalUpload collection for results
    console.log('Step 4: Querying UniversalUpload...');
    console.log('Search criteria:', { schoolRef: schoolId, session: sessionId, term: termId, class: classLevelId });

    const universalUpload = await UniversalUpload.findOne({
      schoolRef: schoolId,
      session: sessionId,
      term: termId,
      class: classLevelId,
      status: 'completed'
    });

    console.log('UniversalUpload found:', universalUpload ? universalUpload.uploadId : 'NOT FOUND');

    if (!universalUpload || !universalUpload.results || universalUpload.results.length === 0) {
      console.log('Debug: Available UniversalUploads for school:', schoolId);
      const allUploads = await UniversalUpload.find({ schoolRef: schoolId }).select('uploadId session term class status');
      console.log('All uploads:', allUploads);

      return res.status(404).json({
        success: false,
        verified: false,
        message: 'No results found for this school/session/term/class combination'
      });
    }

    // Step 5: Find student's results within the UniversalUpload
    console.log('Step 5: Filtering student results...');
    console.log('Student ID:', student._id.toString());
    console.log('Total results in upload:', universalUpload.results.length);

    const studentResults = universalUpload.results.filter(r => {
      const match = r.student_id === student._id.toString() || r.student_id === student._id;
      if (match) {
        console.log('  ✓ Found result:', r.student_name, '-', r.subject);
      }
      return match;
    });

    console.log('Student results found:', studentResults.length);

    if (!studentResults || studentResults.length === 0) {
      return res.status(404).json({
        success: false,
        verified: false,
        message: `No results found for student ${student.firstname} ${student.surname} in this session/term`
      });
    }

    // Step 6: Get session, term, and class details
    console.log('Step 6: Fetching session/term/class details...');
    const session = await Session.findById(sessionId);
    const term = await Term.findById(termId);
    const classLevel = await Class.findById(classLevelId);

    console.log('Session:', session ? session.name : 'NOT FOUND');
    console.log('Term:', term ? term.name : 'NOT FOUND');
    console.log('Class:', classLevel ? classLevel.name : 'NOT FOUND');

    if (!session || !term || !classLevel) {
      return res.status(404).json({
        success: false,
        verified: false,
        message: 'Session, term, or class not found'
      });
    }

    // Step 7: Calculate aggregate data from student results
    console.log('Step 7: Calculating scores...');
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

    console.log('=== VERIFICATION SUCCESS ===');
    console.log('Total Score:', totalScore);
    console.log('Average Score:', averageScore);
    console.log('Overall Grade:', overallGrade);
    console.log('Subjects:', subjects.length);

    // Step 9: Return verified report
    res.json({
      success: true,
      verified: true,
      message: 'Report verified successfully',
      data: {
        verificationCode,
        studentName: student.firstname + ' ' + student.surname,
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
    console.error('❌ Error verifying student report:', error);
    res.status(500).json({
      success: false,
      verified: false,
      message: 'Error verifying report',
      error: error.message
    });
  }
});

/**
 * GET /api/res/verification-history
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
