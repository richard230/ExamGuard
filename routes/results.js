const express = require('express');
const router = express.Router();

const Result = require('../models/Result');
const Student = require('../models/Student');
const Session = require('../models/Session');
const Term = require('../models/Term');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const Teacher = require('../models/Teacher'); // Add Teacher model

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
 * Calculate and persist subject positions for a class/session/term/subject
 */
async function computeAndPersistSubjectPositions({ classId, sessionId, termId, subjectId }) {
  const filter = {
    class: classId,
    session: sessionId,
    term: termId,
    subject: subjectId,
    status: 'Published'
  };
  const results = await Result.find(filter);
  const arr = results.map(r => {
    let total = 0;
    if (r.ca1_score) total += parseFloat(r.ca1_score) || 0;
    if (r.ca2_score) total += parseFloat(r.ca2_score) || 0;
    if (r.midterm_score) total += parseFloat(r.midterm_score) || 0;
    if (r.exam_score) total += parseFloat(r.exam_score) || 0;
    if (!r.ca1_score && !r.ca2_score && !r.midterm_score && !r.exam_score && r.score) total = parseFloat(r.score) || 0;
    return { id: r._id.toString(), total };
  });
  arr.sort((a, b) => b.total - a.total);
  let posMap = {};
  let currentPos = 1, prevTotal = null, skip = 0;
  for (let i = 0; i < arr.length; i++) {
    if (prevTotal !== null && arr[i].total < prevTotal) {
      currentPos = i + 1; skip = 0;
    } else if (prevTotal !== null && arr[i].total === prevTotal) { skip++; }
    posMap[arr[i].id] = { position: ordinalSuffix(currentPos), numeric: currentPos };
    prevTotal = arr[i].total;
  }
  for (const id in posMap) {
    await Result.findByIdAndUpdate(id, {
      subject_position: posMap[id].position,
      subject_position_num: posMap[id].numeric
    });
  }
  return posMap;
}

/**
 * UTILITY: Get session settings from sessionSettings module
 */
async function getSessionSettings() {
  try {
    const sessionSettingsModule = require('./sessionSettings');
    // sessionSettingsModule has getSettings function and sessionSettings object
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
 */
async function buildReportData(student, classObj, sessionObj, termObj, results, sessionSettings) {
  const data = [];
  
  for (const r of results) {
    let total = 0;
    if (r.ca1_score) total += parseFloat(r.ca1_score) || 0;
    if (r.ca2_score) total += parseFloat(r.ca2_score) || 0;
    if (r.midterm_score) total += parseFloat(r.midterm_score) || 0;
    if (r.exam_score) total += parseFloat(r.exam_score) || 0;
    if (!r.ca1_score && !r.ca2_score && !r.midterm_score && !r.exam_score && r.score) total = parseFloat(r.score) || 0;

    const { grade, remark } = getGradeAndRemark(total);

    let subjectPos = '';
    if (r.subject && r.subject.name) {
      const posMap = await computeAndPersistSubjectPositions({
        classId: classObj._id,
        sessionId: sessionObj._id,
        termId: termObj._id,
        subjectId: r.subject._id
      });
      subjectPos = posMap[r._id.toString()]?.position || r.subject_position || '';
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

  const classSize = await Result.distinct('student', {
    class: classObj._id,
    session: sessionObj._id,
    term: termObj._id,
    status: 'Published'
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

  // Get form master for this student's class
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
    studentPosition: 1 // Calculate this if needed
  };
}

// --- MAIN CHECK ROUTE (GET /check) - WITH PRINCIPAL & FORM MASTER ---
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

    const results = await Result.find({
      student: student._id,
      class: classObj._id,
      session: sessionObj._id,
      term: termObj._id,
      status: 'Published'
    }).populate('subject');

    if (!results.length) return res.status(404).json({ error: 'Result unavailable for selected session and term.' });

    // Get session settings from your sessionSettings route/module
    const sessionSettings = await getSessionSettings();

    // Build complete report data with principal name and form master
    const reportData = await buildReportData(student, classObj, sessionObj, termObj, results, sessionSettings);

    res.json(reportData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * NEW ROUTE: GET student report by ID (for admin/teacher viewing)
 * Usage: GET /api/results/student/:studentId/report?sessionId=xxx&termId=xxx
 */
router.get('/student/:studentId/report', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { sessionId, termId, classId } = req.query;

    if (!studentId || !sessionId || !termId) {
      return res.status(400).json({ error: 'Missing required parameters: studentId, sessionId, termId' });
    }

    // Fetch student
    const student = await Student.findById(studentId).populate('class');
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Fetch session and term
    const sessionObj = await Session.findById(sessionId);
    const termObj = await Term.findById(termId);
    if (!sessionObj || !termObj) {
      return res.status(404).json({ error: 'Session or Term not found' });
    }

    // Fetch class
    let classObj = student.class;
    if (classId) {
      classObj = await Class.findById(classId);
    }
    if (!classObj) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Fetch results
    const results = await Result.find({
      student: student._id,
      class: classObj._id,
      session: sessionObj._id,
      term: termObj._id,
      status: 'Published'
    }).populate('subject');

    if (!results.length) {
      return res.status(404).json({ error: 'No results found for this student' });
    }

    // Get session settings from your sessionSettings module
    const sessionSettings = await getSessionSettings();

    // Build complete report data with principal name and form master
    const reportData = await buildReportData(student, classObj, sessionObj, termObj, results, sessionSettings);

    res.json(reportData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * MERGE DUPLICATES UTILITY
 * Finds all duplicate results for student+subject+session+term and merges them
 */
async function mergeDuplicateResults() {
  try {
    console.log('Starting duplicate merge process...');
    
    // Find all results grouped by student, subject, session, term
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
      
      // Keep the first result and merge all scores into it
      const primaryResult = results[0];
      const othersToDelete = results.slice(1);

      // Merge all scores (take the highest or most recent score for each type)
      const mergedData = {
        ca1_score: primaryResult.ca1_score,
        ca2_score: primaryResult.ca2_score,
        midterm_score: primaryResult.midterm_score,
        exam_score: primaryResult.exam_score,
        score: primaryResult.score,
        grade: primaryResult.grade,
        remarks: primaryResult.remarks
      };

      // Update with any non-empty scores from other results
      for (const other of othersToDelete) {
        if (other.ca1_score && !mergedData.ca1_score) mergedData.ca1_score = other.ca1_score;
        if (other.ca2_score && !mergedData.ca2_score) mergedData.ca2_score = other.ca2_score;
        if (other.midterm_score && !mergedData.midterm_score) mergedData.midterm_score = other.midterm_score;
        if (other.exam_score && !mergedData.exam_score) mergedData.exam_score = other.exam_score;
        if (other.score && !mergedData.score) mergedData.score = other.score;
      }

      // Update primary result with merged data
      await Result.findByIdAndUpdate(primaryResult._id, mergedData);

      // Delete other duplicate results
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
 * UPSERT BULK UPLOAD - Prevents duplicates and merges scores
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

        // Build update data with score type
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

        // Set the appropriate score field based on resultType
        updateData[`${resultType}_score`] = row.score;

        // Upsert: find existing record and update, or create new one
        const existingResult = await Result.findOne({
          student: student._id,
          session: sessionObj._id,
          term: termObj._id,
          class: classObj._id,
          subject: subjectObj._id
        });

        if (existingResult) {
          // Update existing result - merge the score
          const updatedResult = await Result.findByIdAndUpdate(
            existingResult._id,
            updateData,
            { new: true }
          );
          updated++;
        } else {
          // Create new result
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
 * BULK UPLOAD - Updated to use upsert logic
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

        // If upsert flag is true, check for existing and update
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

        // Create new result
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
 * Usage: POST /api/results/merge-duplicates (should be admin-protected)
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
 * GET: Filter results. Accepts session, term, student_id, class, subject
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

router.post('/push-cbt', async (req, res) => {
  try {
    // Validate input
    const allowedFields = ['ca1_score', 'ca2_score', 'midterm_score', 'exam_score'];
    const { scoreField } = req.body;
    if (!allowedFields.includes(scoreField)) {
      return res.status(400).json({ error: 'Invalid score field selected.' });
    }

    const ResultCBT = require('../models/ResultCBT');
    const CBTExam = require('../models/CBTExam');
    const Result = require('../models/Result');
    const Student = require('../models/Student');

    // Fetch all CBT results
    const cbtResults = await ResultCBT.find().populate('student exam');
    let inserted = 0, skipped = 0, errors = [];

    for (const r of cbtResults) {
      // Gather required info
      const exam = r.exam;
      const student = r.student;
      if (!exam || !student) { skipped++; continue; }

      // Optional: Check for duplicate universal result for same student/exam/subject/class/session/term
      const dup = await Result.findOne({
        student: student._id,
        class: exam.class,
        subject: exam.subject,
        session: exam.session,
        term: exam.term
      });
      if (dup) { skipped++; continue; }

      // Prepare new universal result
      let resultData = {
        student: student._id,
        class: exam.class || undefined,
        subject: exam.subject || undefined,
        session: exam.session || undefined,
        term: exam.term || undefined,
        status: "Draft",
        remarks: "Imported from CBT",
        [scoreField]: r.score // set only the chosen field
        // other fields will be default/empty as per schema
      };

      // Save
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
