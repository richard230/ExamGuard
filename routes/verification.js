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

// Helper: Normalize term name for flexible matching
function normalizeTerm(term) {
  const termMap = {
    'FIRST TERM': 'First Term',
    'SECOND TERM': 'Second Term',
    'THIRD TERM': 'Third Term',
    'first term': 'First Term',
    'second term': 'Second Term',
    'third term': 'Third Term',
    '1': 'First Term',
    '2': 'Second Term',
    '3': 'Third Term'
  };
  
  return termMap[term] || term;
}

// Helper: Normalize class name
function normalizeClass(className) {
  if (!className) return className;
  // Handle common variations
  const classMap = {
    'ss1': 'SS1',
    'ss2': 'SS2',
    'ss3': 'SS3',
    'jss1': 'JSS1',
    'jss2': 'JSS2',
    'jss3': 'JSS3',
    'primary1': 'Primary 1',
    'primary2': 'Primary 2',
    'primary3': 'Primary 3',
    'primary4': 'Primary 4',
    'primary5': 'Primary 5',
    'primary6': 'Primary 6'
  };
  
  const normalized = classMap[className.toLowerCase()];
  return normalized || className;
}

router.post('/verify-student-report', authMiddleware, async (req, res) => {
  try {
    console.log('=== VERIFICATION REQUEST ===');
    const {
      schoolId,
      regNo,
      scratchCard,
      sessionId,
      termName,
      className,
      verificationPurpose,
      institutionName
    } = req.body;

    console.log('Request Body:', { schoolId, regNo, termName, className });

    // Validate required fields
    if (!schoolId || !regNo || !scratchCard || !sessionId || !termName || !className) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'Missing required fields'
      });
    }

    // Step 1: Verify school exists
    console.log('Step 1: Verifying school...');
    const school = await School.findById(schoolId);
    if (!school || school.status !== 'active') {
      return res.status(404).json({
        success: false,
        verified: false,
        message: 'School not found or inactive'
      });
    }
    console.log('✓ School:', school.schoolName);

    // Step 2: Find student
    console.log('Step 2: Finding student with regNo:', regNo);
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
        message: 'Student not found in system'
      });
    }
    console.log('✓ Student:', student.firstname, student.surname);

    // Step 3: Verify scratch card
    if (!scratchCard || scratchCard.length < 4) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'Invalid scratch card code'
      });
    }

    // Step 4: Get Term details and normalize
    console.log('Step 4: Fetching term details...');
    const normalizedTermName = normalizeTerm(termName);
    
    const term = await Term.findOne({ 
      name: { $regex: new RegExp('^' + normalizedTermName + '$', 'i') } 
    });
    
    if (!term) {
      return res.status(404).json({
        success: false,
        verified: false,
        message: 'Term not found'
      });
    }
    console.log('✓ Term:', term.name, '-> Normalized:', normalizedTermName);

    // Step 5: Get Session details
    console.log('Step 5: Fetching session details...');
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        verified: false,
        message: 'Session not found'
      });
    }
    console.log('✓ Session:', session.name);

    // Step 6: Get Class details and normalize
    console.log('Step 6: Fetching class details...');
    const normalizedClassName = normalizeClass(className);
    
    const classLevel = await Class.findOne({
      name: { $regex: new RegExp('^' + normalizedClassName + '$', 'i') }
    });
    
    const finalClassName = classLevel ? normalizeClass(classLevel.name) : normalizedClassName;
    
    if (classLevel) {
      console.log('✓ Class found in DB:', classLevel.name, '-> Normalized:', finalClassName);
    } else {
      console.log('✓ Using class name as string:', className, '-> Normalized:', finalClassName);
    }

    // Step 7: Query UniversalUpload with flexible matching
    console.log('Step 7: Querying UniversalUpload with flexible matching...');
    console.log('Primary search criteria:', {
      schoolRef: schoolId,
      session: session.name,
      term: normalizedTermName,
      class: finalClassName
    });

    // Try exact match first
    let universalUpload = await UniversalUpload.findOne({
      schoolRef: schoolId,
      session: session.name,
      term: normalizedTermName,
      class: finalClassName,
      status: 'completed'
    });

    // If not found, try case-insensitive regex match
    if (!universalUpload) {
      console.log('Exact match not found, trying case-insensitive...');
      universalUpload = await UniversalUpload.findOne({
        schoolRef: schoolId,
        session: session.name,
        term: { $regex: new RegExp('^' + normalizedTermName + '$', 'i') },
        class: { $regex: new RegExp('^' + finalClassName + '$', 'i') },
        status: 'completed'
      });
    }

    // If still not found, try flexible term/class combination
    if (!universalUpload) {
      console.log('Trying flexible term matching...');
      // Get all variations of the term
      const termVariations = [normalizedTermName];
      if (normalizedTermName.includes('First')) termVariations.push('first term', 'FIRST TERM', '1');
      if (normalizedTermName.includes('Second')) termVariations.push('second term', 'SECOND TERM', '2');
      if (normalizedTermName.includes('Third')) termVariations.push('third term', 'THIRD TERM', '3');

      universalUpload = await UniversalUpload.findOne({
        schoolRef: schoolId,
        session: session.name,
        term: { $in: termVariations },
        class: { $regex: new RegExp('^' + finalClassName + '$', 'i') },
        status: 'completed'
      });
    }

    // If still not found, debug output
    if (!universalUpload) {
      console.log('❌ UniversalUpload not found, searching for debugging info...');
      const debugUploads = await UniversalUpload.find({ 
        schoolRef: schoolId,
        status: 'completed'
      })
        .select('uploadId session term class status results')
        .limit(10);
      
      console.log('Available uploads for this school:');
      debugUploads.forEach(u => {
        console.log(`  - Session: "${u.session}", Term: "${u.term}", Class: "${u.class}", Results: ${u.results.length}`);
      });

      return res.status(404).json({
        success: false,
        verified: false,
        message: `No results found for ${session.name} / ${normalizedTermName} / ${finalClassName}. Check server logs for available combinations.`
      });
    }

    console.log('✓ UniversalUpload found:', universalUpload.uploadId);
    console.log('  Actual values: Session:', universalUpload.session, '| Term:', universalUpload.term, '| Class:', universalUpload.class);

    // Step 8: Find student's results
    console.log('Step 8: Filtering student results...');
    const studentId = student._id.toString();
    console.log('Student ID to match:', studentId);
    console.log('Total results in upload:', universalUpload.results.length);

    const studentResults = universalUpload.results.filter(r => {
      const rStudentId = r.student_id?.toString ? r.student_id.toString() : String(r.student_id);
      const matches = rStudentId === studentId;
      if (matches) {
        console.log('  ✓ Match:', r.student_name, '-', r.subject);
      }
      return matches;
    });

    console.log('Student results found:', studentResults.length);

    if (studentResults.length === 0) {
      // Debug: show what student IDs are in the upload
      console.log('Available student IDs in upload:');
      universalUpload.results.slice(0, 5).forEach(r => {
        console.log(`  - ${r.student_name} (${r.student_id})`);
      });

      return res.status(404).json({
        success: false,
        verified: false,
        message: `No results found for ${student.firstname} ${student.surname} in this upload`
      });
    }

    // Step 9: Calculate aggregate data
    console.log('Step 9: Calculating scores...');
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

    const averageScore = subjects.length > 0 ? totalScore / subjects.length : 0;
    let overallGrade = 'F';
    if (averageScore >= 70) overallGrade = 'A';
    else if (averageScore >= 60) overallGrade = 'B';
    else if (averageScore >= 50) overallGrade = 'C';
    else if (averageScore >= 45) overallGrade = 'D';
    else if (averageScore >= 40) overallGrade = 'E';

    const verificationCode = `VER-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    console.log('✅ VERIFICATION SUCCESS');
    console.log(`Score: ${totalScore} | Grade: ${overallGrade} | Subjects: ${subjects.length}`);

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
          _id: classLevel?._id || finalClassName,
          name: finalClassName
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
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
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
 */
router.get('/verification-history', authMiddleware, async (req, res) => {
  try {
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
