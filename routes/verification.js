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

// ============ HELPER FUNCTIONS ============

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

/**
 * Format position with ordinal suffix (1st, 2nd, 3rd, etc)
 */
function ordinalSuffix(pos) {
  if (typeof pos !== 'number') pos = parseInt(pos);
  if (pos % 100 >= 11 && pos % 100 <= 13) return pos + 'th';
  switch (pos % 10) {
    case 1: return pos + 'st';
    case 2: return pos + 'nd';
    case 3: return pos + 'rd';
    default: return pos + 'th';
  }
}

/**
 * Calculate total score from component scores
 */
function calculateTotal(ca1, ca2, midterm, exam) {
  return (parseFloat(ca1) || 0) +
         (parseFloat(ca2) || 0) +
         (parseFloat(midterm) || 0) +
         (parseFloat(exam) || 0);
}

/**
 * Calculate subject position for a student within their class/session/term
 * Queries all students with same subject and ranks by total score
 */
async function calculateSubjectPosition(studentId, classId, sessionId, termId, subjectId, subjectName) {
  try {
    console.log(`  📍 Calculating position for subject: ${subjectName}`);

    // Get all published results for this subject in the class/session/term
    const allResults = await Result.find({
      class: classId,
      session: sessionId,
      term: termId,
      subject: subjectId,
      status: 'Published'
    }).populate('student').select('student ca1_score ca2_score midterm_score exam_score');

    console.log(`    📊 Found ${allResults.length} students in this subject`);

    if (allResults.length === 0) {
      console.log('    ⚠️  No results to rank against');
      return '-'; // No results to rank against
    }

    // Calculate total score for each result
    const resultsWithScores = allResults.map(r => {
      const total = calculateTotal(r.ca1_score, r.ca2_score, r.midterm_score, r.exam_score);
      return {
        id: r._id.toString(),
        studentId: r.student._id.toString(),
        studentName: r.student.firstname + ' ' + r.student.surname,
        total
      };
    });

    // Sort by score descending
    resultsWithScores.sort((a, b) => b.total - a.total);

    console.log(`    📋 Top 3 scores: ${resultsWithScores.slice(0, 3).map(r => `${r.studentName}(${r.total})`).join(', ')}`);

    // Assign positions with tie-handling
    let position = 1;
    let lastScore = null;

    for (let i = 0; i < resultsWithScores.length; i++) {
      const current = resultsWithScores[i];

      // Update position if score is different from previous
      if (lastScore !== null && current.total < lastScore) {
        position = i + 1; // Position accounts for ties
      }

      if (current.studentId === studentId) {
        const positionText = ordinalSuffix(position);
        console.log(`    ✓ Position: ${positionText} (out of ${allResults.length})`);
        return positionText;
      }

      lastScore = current.total;
    }

    console.log('    ⚠️  Student not found in results');
    return '-'; // Student not found in results
  } catch (err) {
    console.error('    ❌ Error calculating subject position:', err.message);
    return '-';
  }
}

// ============ ROUTES ============

/**
 * POST /api/res/verify-student-report
 * Verify a student's report by matching registration number, scratch card, and academic context
 */
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

    // ============ STEP 1: VERIFY SCHOOL ============
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

    // ============ STEP 2: FIND STUDENT ============
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

    // ============ STEP 3: VERIFY SCRATCH CARD ============
    if (!scratchCard || scratchCard.length < 4) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'Invalid scratch card code'
      });
    }

    // ============ STEP 4: GET TERM DETAILS ============
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

    // ============ STEP 5: GET SESSION DETAILS ============
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

    // ============ STEP 6: GET CLASS DETAILS ============
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

    // ============ STEP 7: QUERY UNIVERSALUPLOAD ============
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
      isDeleted: false
    });

    // If not found, try case-insensitive matching on class
    if (!universalUpload) {
      console.log('  ⚠️  No exact match, trying case-insensitive...');
      universalUpload = await UniversalUpload.findOne({
        schoolRef: schoolId,
        session: session.name,
        term: normalizedTermName,
        class: { $regex: new RegExp('^' + finalClassName + '$', 'i') },
        isDeleted: false
      });
    }

    if (!universalUpload) {
      return res.status(404).json({
        success: false,
        verified: false,
        message: `No results found for ${session.name} - ${normalizedTermName} - ${finalClassName}`
      });
    }
    console.log('✓ UniversalUpload found:', universalUpload.uploadId);

    // ============ STEP 8: FIND STUDENT RESULTS IN UPLOAD ============
    console.log('Step 8: Finding student results in upload...');
    const studentId = student._id.toString();
    
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

    // ============ STEP 9: CALCULATE AGGREGATE DATA ============
    console.log('Step 9: Calculating scores...');
    let totalScore = 0;
    const subjects = [];

    studentResults.forEach(result => {
      const subjectTotal =
        (parseFloat(result.ca1_score) || 0) +
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
        position: '-' // Will be populated in Step 10
      });
    });

    const averageScore = subjects.length > 0 ? totalScore / subjects.length : 0;
    let overallGrade = 'F';
    if (averageScore >= 70) overallGrade = 'A';
    else if (averageScore >= 60) overallGrade = 'B';
    else if (averageScore >= 50) overallGrade = 'C';
    else if (averageScore >= 45) overallGrade = 'D';
    else if (averageScore >= 40) overallGrade = 'E';

    // ============ STEP 10: CALCULATE SUBJECT POSITIONS ============
    console.log('Step 10: Calculating subject positions...');
    
    for (let i = 0; i < subjects.length; i++) {
      const subject = subjects[i];
      
      // Find Subject document
      const subjectDoc = await Subject.findOne({ name: subject.name });
      
      if (subjectDoc && classLevel) {
        // Calculate position for this student in this subject
        const position = await calculateSubjectPosition(
          student._id,
          classLevel._id,
          session._id,
          term._id,
          subjectDoc._id,
          subject.name
        );
        
        subject.position = position;
      } else {
        console.log(`  ⚠️  Could not find subject document for: ${subject.name}`);
        subject.position = '-';
      }
    }

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
        subjects, // Now includes positions calculated in Step 10
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
 * Retrieve verification history for authenticated user
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
