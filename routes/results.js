const express = require('express');
const router = express.Router();

const Result = require('../models/Result');
const Student = require('../models/Student');
const Session = require('../models/Session');
const Term = require('../models/Term');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const Teacher = require('../models/Teacher');

/**
 * UTILITY: Assign grade/remark based on total score
 */
function getGradeAndRemark(totalScore) {
  if (totalScore >= 70) return { grade: 'A', remark: 'Excellent' };
  if (totalScore >= 60) return { grade: 'B', remark: 'Very Good' };
  if (totalScore >= 50) return { grade: 'C', remark: 'Good' };
  if (totalScore >= 45) return { grade: 'D', remark: 'Pass' };
  if (totalScore >= 40) return { grade: 'E', remark: 'Poor' };
  return { grade: 'F', remark: 'Fail' };
}

function ordinalSuffix(pos) {
  if (typeof pos !== "number") pos = parseInt(pos);
  if (pos % 100 >= 11 && pos % 100 <= 13) return pos + "th";
  switch (pos % 10) {
    case 1: return pos + "st";
    case 2: return pos + "nd";
    case 3: return pos + "rd";
    default: return pos + "th";
  }
}

/**
 * Calculate total score for a result
 */
function calculateResultTotal(result) {
  let total = 0;
  if (result.ca1_score) total += parseFloat(result.ca1_score) || 0;
  if (result.ca2_score) total += parseFloat(result.ca2_score) || 0;
  if (result.midterm_score) total += parseFloat(result.midterm_score) || 0;
  if (result.exam_score) total += parseFloat(result.exam_score) || 0;
  if (!result.ca1_score && !result.ca2_score && !result.midterm_score && !result.exam_score && result.score) {
    total = parseFloat(result.score) || 0;
  }
  return total;
}

/**
 * Calculate and persist SUBJECT positions for a specific session/term/class/subject
 * CRITICAL: Only counts PUBLISHED results for the specific session/term
 */
async function computeAndPersistSubjectPositions({ classId, sessionId, termId, subjectId }) {
  const filter = {
    class: classId,
    session: sessionId,      // Scope to specific session
    term: termId,            // Scope to specific term
    subject: subjectId,
    status: 'Published'      // CRITICAL: Only published results
  };
  
  const results = await Result.find(filter);
  
  // Build array with ID and total score
  const arr = results.map(r => {
    const total = calculateResultTotal(r);
    return { id: r._id.toString(), total };
  });
  
  // Sort by total descending
  arr.sort((a, b) => b.total - a.total);
  
  // Assign positions with tie-breaking
  let posMap = {};
  let currentPos = 1;
  let prevTotal = null;
  
  for (let i = 0; i < arr.length; i++) {
    // If score is different from previous, update position
    if (prevTotal !== null && arr[i].total < prevTotal) {
      currentPos = i + 1;  // Position is based on actual index (handles ties)
    }
    
    posMap[arr[i].id] = { 
      position: ordinalSuffix(currentPos), 
      numeric: currentPos 
    };
    
    prevTotal = arr[i].total;
  }
  
  // Update all results with their positions
  for (const id in posMap) {
    await Result.findByIdAndUpdate(id, {
      subject_position: posMap[id].position,
      subject_position_num: posMap[id].numeric
    });
  }
  
  return posMap;
}

/**
 * Calculate OVERALL positions for a student within their class for a specific session/term
 * CRITICAL: Only counts PUBLISHED results and scopes to specific session/term
 */
async function computeOverallPosition({ studentId, classId, sessionId, termId }) {
  try {
    // Get this student's total score for this specific session/term (PUBLISHED ONLY)
    const studentResults = await Result.find({
      student: studentId,
      class: classId,
      session: sessionId,    // Scope to specific session
      term: termId,          // Scope to specific term
      status: 'Published'    // CRITICAL: Only published results
    });

    if (studentResults.length === 0) {
      return 0;  // No published results
    }

    let studentTotal = 0;
    studentResults.forEach(r => {
      studentTotal += calculateResultTotal(r);
    });

    // Get all students' totals for this specific session/term (PUBLISHED ONLY)
    const allResults = await Result.find({
      class: classId,
      session: sessionId,    // Scope to specific session
      term: termId,          // Scope to specific term
      status: 'Published'    // CRITICAL: Only published results
    }).populate('student');

    // Build student totals map
    const studentTotals = {};
    allResults.forEach(r => {
      const sid = r.student._id.toString();
      if (!studentTotals[sid]) {
        studentTotals[sid] = 0;
      }
      studentTotals[sid] += calculateResultTotal(r);
    });

    // Sort by total descending
    const sorted = Object.entries(studentTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([sid, total], idx) => ({ sid, total, position: idx + 1 }));

    // Find this student's position
    const positionObj = sorted.find(p => p.sid === studentId.toString());
    return positionObj?.position || 0;
  } catch (err) {
    console.error('Error computing overall position:', err);
    return 0;
  }
}

/**
 * UTILITY: Get session settings from sessionSettings module
 */
async function getSessionSettings() {
  try {
    const sessionSettingsModule = require('./sessionSettings');
    const settings = sessionSettingsModule.getSettings?.() || sessionSettingsModule.sessionSettings || {};
    return {
      principalName: settings.principalName || 'Principal',
      classAssignments: settings.classAssignments || {}
    };
  } catch (err) {
    console.error('Error fetching session settings:', err);
    return { principalName: 'Principal', classAssignments: {} };
  }
}

async function findOrCreateByName(Model, name, extra = {}) {
  if (!name) return null;
  let doc = await Model.findOne({ name });
  if (doc) return doc;
  doc = new Model({ name, ...extra });
  await doc.save();
  return doc;
}

async function findOrCreateStudent(row, classId) {
  if (!row.student_id) return null;
  let student = await Student.findOne({ student_id: row.student_id });
  if (student) return student;
  student = new Student({
    student_id: row.student_id,
    name: row.student_name,
    class: classId || null
  });
  await student.save();
  return student;
}

/**
 * BUILD REPORT DATA - Helper function
 * FIXED: Properly scopes all calculations to session/term
 */
async function buildReportData(student, classObj, sessionObj, termObj, results, sessionSettings) {
  const data = [];
  
  for (const r of results) {
    const total = calculateResultTotal(r);
    const { grade, remark } = getGradeAndRemark(total);

    let subjectPos = '';
    if (r.subject && r.subject.name) {
      // Compute positions ONLY for PUBLISHED results in this session/term
      const posMap = await computeAndPersistSubjectPositions({
        classId: classObj._id,
        sessionId: sessionObj._id,
        termId: termObj._id,
        subjectId: r.subject._id
      });
      
      subjectPos = posMap[r._id.toString()]?.position || '';
      
      // Update this result with new grade/remark/position
      if (r.grade !== grade || r.remarks !== remark || r.subject_position !== subjectPos) {
        await Result.findByIdAndUpdate(r._id, {
          grade: grade,
          remarks: remark,
          subject_position: subjectPos
        });
      }
    }

    data.push({
      subject: r.subject?.name || '',
      ca1_score: r.ca1_score || '',
      ca2_score: r.ca2_score || '',
      midterm_score: r.midterm_score || '',
      exam_score: r.exam_score || '',
      total,
      grade,
      remarks: remark,
      subject_position: subjectPos
    });
  }

  // CRITICAL: Count ONLY PUBLISHED results for this specific session/term
  const classSize = await Result.distinct('student', {
    class: classObj._id,
    session: sessionObj._id,
    term: termObj._id,
    status: 'Published'  // Only count published
  }).then(students => students.length);

  let skillsReport = { skills: { affective: {}, psychomotor: {} }, attendance: {}, comment: "" };
  if (Array.isArray(student.skillsReports)) {
    const found = student.skillsReports.find(r =>
      r.session?.toLowerCase() === sessionObj.name.toLowerCase() &&
      r.term?.toLowerCase() === termObj.name.toLowerCase()
    );
    if (found) {
      skillsReport = {
        skills: found.skills || { affective: {}, psychomotor: {} },
        attendance: found.attendance || {},
        comment: found.comment || ""
      };
    }
  }

  const principalComment = skillsReport.comment || "";
  const attendance = skillsReport.attendance || {};

  // Get form master
  const classId = classObj._id.toString();
  const formMasterId = sessionSettings?.classAssignments?.[classId];
  let formMasterName = 'Form Master';

  if (formMasterId) {
    try {
      const formMaster = await Teacher.findById(formMasterId);
      if (formMaster) {
        formMasterName = `${formMaster.firstName || ''} ${formMaster.lastName || ''}`.trim() || 'Form Master';
      }
    } catch (err) {
      console.error('Error fetching form master:', err);
    }
  }

  const studentInfo = {
    name: student.name || `${student.surname || ''} ${student.firstname || ''}`.trim(),
    regNo: student.regNo,
    gender: student.gender,
    DOB: student.dob,
    email: student.studentEmail,
    age: student.age,
    class: { name: classObj.name, _id: classObj._id },
    photoBase64: student.photoBase64 || ""
  };

  // CRITICAL: Calculate position for THIS specific session/term ONLY
  const studentPosition = await computeOverallPosition({
    studentId: student._id,
    classId: classObj._id,
    sessionId: sessionObj._id,
    termId: termObj._id
  });

  return {
    results: data,
    skillsReport,
    attendance,
    principalComment,
    classSize,
    student: studentInfo,
    principalName: sessionSettings?.principalName || 'Principal',
    teacherName: formMasterName,
    session: sessionObj.name,
    term: termObj.name,
    studentPosition: studentPosition,
    nextTermDate: null,
    dateIssued: new Date().toISOString()
  };
}

/**
 * GET: Fetch results for admin/teacher dashboard with transformed data
 * Groups results by student (merged subjects) and only shows Published results
 */
router.get('/dashboard/all', async (req, res) => {
  try {
    const query = { status: 'Published' }; // CRITICAL: Only published results
    
    if (req.query.session) {
      const sess = await Session.findOne({ name: req.query.session });
      if (sess) query.session = sess._id;
    }
    
    if (req.query.term) {
      const term = await Term.findOne({ name: req.query.term });
      if (term) query.term = term._id;
    }
    
    if (req.query.student_id) {
      const student = await Student.findOne({ student_id: req.query.student_id });
      if (student) query.student = student._id;
    }
    
    if (req.query.class) {
      const klass = await Class.findOne({ name: req.query.class });
      if (klass) query.class = klass._id;
    }
    
    if (req.query.subject) {
      const subject = await Subject.findOne({ name: req.query.subject });
      if (subject) query.subject = subject._id;
    }

    const results = await Result.find(query)
      .populate('student')
      .populate('class')
      .populate('session')
      .populate('term')
      .populate('subject')
      .sort({ _id: -1 });

    if (!results.length) {
      return res.json([]);
    }

    // Group results by student and merge subjects
    const studentMap = {};
    
    results.forEach(result => {
      const studentId = result.student?._id.toString();
      if (!studentId) return;
      
      const key = `${studentId}-${result.class?._id}-${result.session?._id}-${result.term?._id}`;
      
      if (!studentMap[key]) {
        studentMap[key] = {
          studentId,
          studentName: result.student?.name || `${result.student?.surname || ''} ${result.student?.firstname || ''}`.trim(),
          regNo: result.student?.regNo,
          classLevel: result.class?.name,
          academicYear: result.session?.name,
          term: result.term?.name,
          subjects: [],
          totalScore: 0,
          grade: '',
          remarks: '',
          status: result.status,
          resultIds: [] // Store all result IDs for this student group
        };
      }
      
      const total = calculateResultTotal(result);
      const { grade, remark } = getGradeAndRemark(total);
      
      studentMap[key].subjects.push({
        name: result.subject?.name,
        ca1_score: result.ca1_score || 0,
        ca2_score: result.ca2_score || 0,
        midterm_score: result.midterm_score || 0,
        exam_score: result.exam_score || 0,
        total: total,
        grade: grade,
        remarks: remark
      });
      
      studentMap[key].totalScore += total;
      studentMap[key].resultIds.push(result._id.toString());
    });

    // Transform to array and calculate final grades
    const transformedResults = Object.values(studentMap).map(student => {
      const numSubjects = student.subjects.length;
      const avgScore = numSubjects > 0 ? student.totalScore / numSubjects : 0;
      const { grade, remark } = getGradeAndRemark(avgScore);
      
      return {
        id: student.resultIds[0], // Use first result ID for view details
        allResultIds: student.resultIds, // Store all IDs
        studentId: student.studentId,
        studentName: student.studentName,
        regNo: student.regNo,
        classLevel: student.classLevel,
        academicYear: student.academicYear,
        term: student.term,
        totalScore: numSubjects > 0 ? (student.totalScore / numSubjects).toFixed(2) : '0.00',
        totalSubjectScore: student.totalScore.toFixed(2),
        numSubjects: numSubjects,
        grade: grade,
        remarks: remark,
        status: student.status,
        subjects: student.subjects
      };
    });

    res.json(transformedResults);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET: Fetch detailed results for a student (merged view)
 */
router.get('/dashboard/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { sessionId, termId } = req.query;

    const query = {
      student: studentId,
      status: 'Published'
    };

    if (sessionId) query.session = sessionId;
    if (termId) query.term = termId;

    const results = await Result.find(query)
      .populate('student')
      .populate('class')
      .populate('session')
      .populate('term')
      .populate('subject');

    if (!results.length) {
      return res.status(404).json({ error: 'No results found for this student' });
    }

    // Merge all results for this student
    const firstResult = results[0];
    let totalScore = 0;
    const subjects = [];

    results.forEach(result => {
      const total = calculateResultTotal(result);
      const { grade, remark } = getGradeAndRemark(total);
      
      totalScore += total;
      subjects.push({
        name: result.subject?.name,
        ca1_score: result.ca1_score || 0,
        ca2_score: result.ca2_score || 0,
        midterm_score: result.midterm_score || 0,
        exam_score: result.exam_score || 0,
        total: total,
        grade: grade,
        remarks: remark
      });
    });

    const avgScore = results.length > 0 ? totalScore / results.length : 0;
    const { grade, remark } = getGradeAndRemark(avgScore);

    res.json({
      id: firstResult._id.toString(),
      studentName: firstResult.student?.name || `${firstResult.student?.surname || ''} ${firstResult.student?.firstname || ''}`.trim(),
      regNo: firstResult.student?.regNo,
      classLevel: firstResult.class?.name,
      academicYear: firstResult.session?.name,
      term: firstResult.term?.name,
      totalScore: avgScore.toFixed(2),
      totalSubjectScore: totalScore.toFixed(2),
      numSubjects: results.length,
      grade: grade,
      remarks: remark,
      status: firstResult.status,
      subjects: subjects
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// --- MAIN CHECK ROUTE (GET /check) ---
router.get('/check', async (req, res) => {
  try {
    const { regNo, scratchCard, class: className, session, term } = req.query;
    if (!regNo || !scratchCard || !className || !session || !term)
      return res.status(400).json({ error: 'Missing required parameters.' });

    let student = await Student.findOne({ regNo }) || await Student.findOne({ student_id: regNo });
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const storedCard = (student.scratchCard || 'ABCD').trim().toUpperCase();
    if (scratchCard.trim().toUpperCase() !== storedCard) {
      return res.status(401).json({ error: 'Invalid scratch card' });
    }

    const classObj = await Class.findOne({ name: className });
    if (!classObj) return res.status(404).json({ error: 'Result unavailable for selected session and term.' });

    const sessionObj = await Session.findOne({ name: session });
    if (!sessionObj) return res.status(404).json({ error: 'Result unavailable for selected session and term.' });

    const termObj = await Term.findOne({ name: term });
    if (!termObj) return res.status(404).json({ error: 'Result unavailable for selected session and term.' });

    // CRITICAL: Query ONLY Published results for this specific session/term
    const results = await Result.find({
      student: student._id,
      class: classObj._id,
      session: sessionObj._id,
      term: termObj._id,
      status: 'Published'  // Only published
    }).populate('subject');

    if (!results.length) return res.status(404).json({ error: 'Result unavailable for selected session and term.' });

    const sessionSettings = await getSessionSettings();
    const reportData = await buildReportData(student, classObj, sessionObj, termObj, results, sessionSettings);

    res.json(reportData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET student report by ID for admin/teacher viewing
 */
router.get('/student/:studentId/report', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { sessionId, termId, classId } = req.query;

    if (!studentId || !sessionId || !termId) {
      return res.status(400).json({ error: 'Missing required parameters: studentId, sessionId, termId' });
    }

    const student = await Student.findById(studentId).populate('class');
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const sessionObj = await Session.findById(sessionId);
    const termObj = await Term.findById(termId);
    if (!sessionObj || !termObj) {
      return res.status(404).json({ error: 'Session or Term not found' });
    }

    let classObj = student.class;
    if (classId) {
      classObj = await Class.findById(classId);
    }
    if (!classObj) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // CRITICAL: Query ONLY Published results
    const results = await Result.find({
      student: student._id,
      class: classObj._id,
      session: sessionObj._id,
      term: termObj._id,
      status: 'Published'  // Only published
    }).populate('subject');

    if (!results.length) {
      return res.status(404).json({ error: 'No results found for this student' });
    }

    const sessionSettings = await getSessionSettings();
    const reportData = await buildReportData(student, classObj, sessionObj, termObj, results, sessionSettings);

    res.json(reportData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * MERGE DUPLICATES UTILITY
 */
async function mergeDuplicateResults() {
  try {
    console.log('Starting duplicate merge process...');
    
    const duplicateGroups = await Result.aggregate([
      {
        $group: {
          _id: {
            student: '$student',
            subject: '$subject',
            session: '$session',
            term: '$term'
          },
          count: { $sum: 1 },
          ids: { $push: '$_id' },
          results: { $push: '$$ROOT' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);

    console.log(`Found ${duplicateGroups.length} duplicate groups`);

    let mergedCount = 0;

    for (const group of duplicateGroups) {
      const results = group.results;
      const primaryResult = results[0];
      const othersToDelete = results.slice(1);

      const mergedData = {
        ca1_score: primaryResult.ca1_score,
        ca2_score: primaryResult.ca2_score,
        midterm_score: primaryResult.midterm_score,
        exam_score: primaryResult.exam_score,
        score: primaryResult.score,
        grade: primaryResult.grade,
        remarks: primaryResult.remarks
      };

      for (const other of othersToDelete) {
        if (other.ca1_score && !mergedData.ca1_score) mergedData.ca1_score = other.ca1_score;
        if (other.ca2_score && !mergedData.ca2_score) mergedData.ca2_score = other.ca2_score;
        if (other.midterm_score && !mergedData.midterm_score) mergedData.midterm_score = other.midterm_score;
        if (other.exam_score && !mergedData.exam_score) mergedData.exam_score = other.exam_score;
        if (other.score && !mergedData.score) mergedData.score = other.score;
      }

      await Result.findByIdAndUpdate(primaryResult._id, mergedData);

      for (const other of othersToDelete) {
        await Result.findByIdAndDelete(other._id);
      }

      mergedCount++;
    }

    console.log(`Merged ${mergedCount} duplicate groups`);
    return { mergedCount, duplicateGroupsFound: duplicateGroups.length };
  } catch (err) {
    console.error('Error in mergeDuplicateResults:', err);
    throw err;
  }
}

/**
 * UPSERT BULK UPLOAD
 */
router.post('/upsert', async (req, res) => {
  try {
    const { session, term, class: className, subject, resultType, results } = req.body;
    
    if (!results || results.length === 0) {
      return res.status(400).json({ success: false, error: 'No results provided' });
    }

    const sessionObj = await findOrCreateByName(Session, session);
    const termObj = await findOrCreateByName(Term, term);
    const classObj = await findOrCreateByName(Class, className);
    const subjectObj = await findOrCreateByName(Subject, subject);

    if (!sessionObj || !termObj || !classObj || !subjectObj) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required references (session, term, class, or subject)' 
      });
    }

    let inserted = 0;
    let updated = 0;
    const errors = [];

    for (const row of results) {
      try {
        const student = await findOrCreateStudent(row, classObj._id);
        
        if (!student) {
          errors.push(`${row.student_name}: Could not find or create student`);
          continue;
        }

        const updateData = {
          student: student._id,
          session: sessionObj._id,
          term: termObj._id,
          class: classObj._id,
          subject: subjectObj._id,
          grade: row.grade,
          remarks: row.remarks || '',
          status: row.status || 'Draft'
        };

        updateData[`${resultType}_score`] = row.score;

        // CRITICAL: Query includes session/term for proper scoping
        const existingResult = await Result.findOne({
          student: student._id,
          session: sessionObj._id,
          term: termObj._id,
          class: classObj._id,
          subject: subjectObj._id
        });

        if (existingResult) {
          await Result.findByIdAndUpdate(existingResult._id, updateData, { new: true });
          updated++;
        } else {
          const newResult = new Result(updateData);
          await newResult.save();
          inserted++;
        }
      } catch (err) {
        errors.push(`${row.student_name}: ${err.message}`);
      }
    }

    res.json({ 
      success: true, 
      inserted, 
      updated,
      total: inserted + updated,
      errors: errors.length > 0 ? errors : undefined 
    });
  } catch (err) {
    console.error('Upsert error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * BULK UPLOAD
 */
router.post('/upload', async (req, res) => {
  try {
    const { session, term, class: className, subject, resultType, results, upsert } = req.body;
    
    if (!results || results.length === 0) {
      return res.status(400).json({ success: false, error: 'No results provided' });
    }

    const sessionObj = await findOrCreateByName(Session, session);
    const termObj = await findOrCreateByName(Term, term);
    const classObj = await findOrCreateByName(Class, className);
    const subjectObj = await findOrCreateByName(Subject, subject);

    if (!sessionObj || !termObj || !classObj || !subjectObj) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required references' 
      });
    }

    let inserted = 0;
    let updated = 0;
    const insertedResults = [];
    const errors = [];

    for (const row of results) {
      try {
        const student = await findOrCreateStudent(row, classObj._id);
        
        if (!student) {
          errors.push(`${row.student_name}: Could not find or create student`);
          continue;
        }

        const resultData = {
          student: student._id,
          session: sessionObj._id,
          term: termObj._id,
          class: classObj._id,
          subject: subjectObj._id,
          grade: row.grade,
          remarks: row.remarks || '',
          status: row.status || 'Draft'
        };

        resultData[`${resultType}_score`] = row.score;

        if (upsert) {
          const existingResult = await Result.findOne({
            student: student._id,
            session: sessionObj._id,
            term: termObj._id,
            class: classObj._id,
            subject: subjectObj._id
          });

          if (existingResult) {
            const updatedResult = await Result.findByIdAndUpdate(
              existingResult._id,
              resultData,
              { new: true }
            );
            updated++;
            insertedResults.push(updatedResult);
            continue;
          }
        }

        const result = new Result(resultData);
        await result.save();
        inserted++;
        insertedResults.push(result);
      } catch (err) {
        errors.push(`${row.student_name}: ${err.message}`);
      }
    }

    res.json({ 
      success: true, 
      inserted, 
      updated,
      total: inserted + updated,
      results: insertedResults,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * ADMIN ROUTE: Merge all existing duplicates
 */
router.post('/merge-duplicates', async (req, res) => {
  try {
    const result = await mergeDuplicateResults();
    res.json({ 
      success: true, 
      message: 'Duplicate merge completed',
      ...result
    });
  } catch (err) {
    console.error('Merge duplicates error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET: Filter results with proper session/term scoping
 */
router.get('/', async (req, res) => {
  try {
    const query = {};
    if (req.query.session) {
      const sess = await Session.findOne({ name: req.query.session });
      if (!sess) {
        return res.status(404).json({ error: "Result unavailable for selected session and term." });
      }
      query.session = sess._id;
    }
    if (req.query.term) {
      const term = await Term.findOne({ name: req.query.term });
      if (!term) {
        return res.status(404).json({ error: "Result unavailable for selected session and term." });
      }
      query.term = term._id;
    }
    if (req.query.student_id) {
      const student = await Student.findOne({ student_id: req.query.student_id });
      if (student) query.student = student._id;
    }
    if (req.query.class) {
      const klass = await Class.findOne({ name: req.query.class });
      if (klass) query.class = klass._id;
    }
    if (req.query.subject) {
      const subject = await Subject.findOne({ name: req.query.subject });
      if (subject) query.subject = subject._id;
    }

    const results = await Result.find(query)
      .populate('student')
      .populate('class')
      .populate('session')
      .populate('term')
      .populate('subject')
      .sort({ _id: -1 });

    if (!results.length) {
      return res.status(404).json({ error: "Result unavailable for selected session and term." });
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET: Single result
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await Result.findById(req.params.id)
      .populate('student')
      .populate('session')
      .populate('term')
      .populate('class')
      .populate('subject');
    if (!result) return res.status(404).json({ error: 'Result not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * UPDATE: Full update
 */
router.put('/:id', async (req, res) => {
  try {
    const updated = await Result.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate('student')
      .populate('session')
      .populate('term')
      .populate('class')
      .populate('subject');
    if (!updated) return res.status(404).json({ error: 'Result not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * UPDATE: Partial update
 */
router.patch('/:id', async (req, res) => {
  try {
    const updated = await Result.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'Result not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUBLISH a result
 */
router.post('/:id/publish', async (req, res) => {
  try {
    const updated = await Result.findByIdAndUpdate(req.params.id, { status: 'Published' }, { new: true });
    if (!updated) return res.status(404).json({ error: 'Result not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE: Remove a result
 */
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Result.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Result not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * CBT PUSH ROUTE
 */
router.post('/push-cbt', async (req, res) => {
  try {
    const allowedFields = ['ca1_score', 'ca2_score', 'midterm_score', 'exam_score'];
    const { scoreField } = req.body;
    if (!allowedFields.includes(scoreField)) {
      return res.status(400).json({ error: 'Invalid score field selected.' });
    }

    const ResultCBT = require('../models/ResultCBT');
    const CBTExam = require('../models/CBTExam');
    const Result = require('../models/Result');
    const Student = require('../models/Student');

    const cbtResults = await ResultCBT.find().populate('student exam');
    let inserted = 0, skipped = 0, errors = [];

    for (const r of cbtResults) {
      const exam = r.exam;
      const student = r.student;
      if (!exam || !student) { skipped++; continue; }

      // CRITICAL: Check for duplicate including session/term
      const dup = await Result.findOne({
        student: student._id,
        class: exam.class,
        subject: exam.subject,
        session: exam.session,
        term: exam.term
      });
      if (dup) { skipped++; continue; }

      let resultData = {
        student: student._id,
        class: exam.class || undefined,
        subject: exam.subject || undefined,
        session: exam.session || undefined,
        term: exam.term || undefined,
        status: "Draft",
        remarks: "Imported from CBT",
        [scoreField]: r.score
      };

      try {
        const newResult = new Result(resultData);
        await newResult.save();
        inserted++;
      } catch (err) {
        errors.push({ student: student._id, exam: exam._id, error: err.message });
      }
    }

    res.json({ success: true, inserted, skipped, errors });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
