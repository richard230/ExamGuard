const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const apiKeyAuth = require('../middleware/apiKeyAuth');
const Result = require('../models/Result');
const Student = require('../models/Student');
const Session = require('../models/Session');
const Term = require('../models/Term');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const Teacher = require('../models/Teacher');
const { authMiddleware } = require('./auth');
// ===============================
// AUTHENTICATION
// ===============================

// /check is intentionally public.
// All other Results routes require authentication.
router.use((req, res, next) => {
  if (req.path === '/check') {
    return next();
  }

  return authMiddleware(req, res, next);
});
/**
 * Utility helper to extract schoolId safely from authenticated user session
 */
function getAuthSchoolId(req) {
  return req.user?.schoolId || req.user?.school || null;
}

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

// 1. computeAndPersistSubjectPositions - Scoped by schoolId
async function computeAndPersistSubjectPositions({ schoolId, classId, sessionId, termId, subjectId }) {
  const filter = {
    schoolId,
    class: classId,
    session: sessionId,
    term: termId,
    subject: subjectId,
    status: 'Published'
  };
  const results = await Result.find(filter);
  const arr = results.map(r => {
    const total = calculateResultTotal(r);
    return { id: r._id.toString(), total };
  });
  arr.sort((a, b) => b.total - a.total);
  let posMap = {};
  let currentPos = 1;
  let prevTotal = null;
  for (let i = 0; i < arr.length; i++) {
    if (prevTotal !== null && arr[i].total < prevTotal) {
      currentPos = i + 1;
    }
    posMap[arr[i].id] = { 
      position: ordinalSuffix(currentPos), 
      numeric: currentPos 
    };
    prevTotal = arr[i].total;
  }
  for (const id in posMap) {
    await Result.findOneAndUpdate(
      { _id: id, schoolId },
      {
        subject_position: posMap[id].position,
        subject_position_num: posMap[id].numeric
      }
    );
  }
  return posMap;
}

// 2. computeOverallPosition - Scoped by schoolId
async function computeOverallPosition({ schoolId, studentId, classId, sessionId, termId }) {
  try {
    const studentResults = await Result.find({
      schoolId,
      student: studentId,
      class: classId,
      session: sessionId,
      term: termId,
      status: 'Published'
    });
    if (studentResults.length === 0) {
      return 0;
    }
    let studentTotal = 0;
    studentResults.forEach(r => {
      studentTotal += calculateResultTotal(r);
    });
    const allResults = await Result.find({
      schoolId,
      class: classId,
      session: sessionId,
      term: termId,
      status: 'Published'
    }).populate('student');
    const studentTotals = {};
    allResults.forEach(r => {
      if (!r.student) return;
      const sid = r.student._id.toString();
      if (!studentTotals[sid]) {
        studentTotals[sid] = 0;
      }
      studentTotals[sid] += calculateResultTotal(r);
    });
    const sorted = Object.entries(studentTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([sid, total], idx) => ({ sid, total, position: idx + 1 }));
    const positionObj = sorted.find(p => p.sid === studentId.toString());
    return positionObj?.position || 0;
  } catch (err) {
    console.error('Error computing overall position:', err);
    return 0;
  }
}

async function getSessionSettings(schoolId) {
  try {
    const sessionSettingsModule = require('./sessionSettings');
    const settings = sessionSettingsModule.getSettings?.(schoolId) || sessionSettingsModule.sessionSettings || {};
    return {
      principalName: settings.principalName || 'Principal',
      classAssignments: settings.classAssignments || {}
    };
  } catch (err) {
    console.error('Error fetching session settings:', err);
    return { principalName: 'Principal', classAssignments: {} };
  }
}

// 3. findOrCreateByName - Scoped by schoolId
async function findOrCreateByName(Model, name, schoolId, extra = {}) {
  if (!name) return null;
  let doc = await Model.findOne({ schoolId, name });
  if (doc) return doc;
  doc = new Model({ schoolId, name, ...extra });
  await doc.save();
  return doc;
}

// 4. findOrCreateStudent - Scoped by schoolId
async function findOrCreateStudent(row, schoolId, classId) {
  if (!row.student_id) return null;
  let student = await Student.findOne({ schoolId, student_id: row.student_id });
  if (student) return student;
  student = new Student({
    schoolId,
    student_id: row.student_id,
    name: row.student_name,
    class: classId || null
  });
  await student.save();
  return student;
}

// 5. buildReportData - Scoped by schoolId
async function buildReportData(student, classObj, sessionObj, termObj, results, sessionSettings, schoolId) {
  const data = [];
  for (const r of results) {
    const total = calculateResultTotal(r);
    const { grade, remark } = getGradeAndRemark(total);
    let subjectPos = '-';
    if (r.subject && r.subject.name) {
      if (r.subject_position) {
        subjectPos = r.subject_position;
      } else {
        const posMap = await computeAndPersistSubjectPositions({
          schoolId,
          classId: classObj._id,
          sessionId: sessionObj._id,
          termId: termObj._id,
          subjectId: r.subject._id
        });
        subjectPos = posMap[r._id.toString()]?.position || '-';
        await Result.findOneAndUpdate(
          { _id: r._id, schoolId },
          {
            subject_position: subjectPos,
            subject_position_num: posMap[r._id.toString()]?.numeric || 0
          }
        );
      }
    }
    data.push({
      subject: r.subject?.name || '',
      ca1_score: r.ca1_score || 0,
      ca2_score: r.ca2_score || 0,
      midterm_score: r.midterm_score || 0,
      exam_score: r.exam_score || 0,
      total: total,
      grade: grade,
      remarks: remark,
      position: subjectPos
    });
  }
  const classSize = await Result.distinct('student', {
    schoolId,
    class: classObj._id,
    session: sessionObj._id,
    term: termObj._id,
    status: 'Published'
  }).then(students => students.length);

  let skillsReport = { 
    skills: { 
      punctuality: '-', obedience: '-', honesty: '-', cleanliness: '-', initiative: '-', cooperation: '-',
      attentiveness: '-', neatness: '-', politeness: '-', selfControl: '-', handling: '-', drawing: '-',
      handwriting: '-', speaking: '-', fluency: '-'
    }, 
    attendance: { schoolOpened: '-', timesPresent: '-', timesAbsent: '-', rate: 0 }, 
    comment: "" 
  };

  if (Array.isArray(student.skillsReports)) {
    const found = student.skillsReports.find(r =>
      r.session?.toLowerCase() === sessionObj.name.toLowerCase() &&
      r.term?.toLowerCase() === termObj.name.toLowerCase()
    );
    if (found) {
      if (found.skills?.affective && typeof found.skills.affective === 'object') {
        skillsReport.skills = {
          ...skillsReport.skills,
          punctuality: found.skills.affective.punctuality || '-',
          attentiveness: found.skills.affective.attentiveness || '-',
          honesty: found.skills.affective.honesty || '-',
          neatness: found.skills.affective.neatness || '-',
          politeness: found.skills.affective.politeness || '-',
          selfControl: found.skills.affective.selfControl || '-'
        };
      }
      if (found.skills?.psychomotor && typeof found.skills.psychomotor === 'object') {
        skillsReport.skills = {
          ...skillsReport.skills,
          handling: found.skills.psychomotor.handling || '-',
          drawing: found.skills.psychomotor.drawing || '-',
          handwriting: found.skills.psychomotor.handwriting || '-',
          speaking: found.skills.psychomotor.speaking || '-',
          fluency: found.skills.psychomotor.fluency || '-'
        };
      }
      if (found.attendance && typeof found.attendance === 'object') {
        skillsReport.attendance = {
          schoolOpened: found.attendance.schoolOpened || '-',
          timesPresent: found.attendance.timesPresent || '-',
          timesAbsent: found.attendance.timesAbsent || '-',
          rate: found.attendance.rate || 0
        };
      }
      if (found.comment) {
        skillsReport.comment = found.comment;
      }
    }
  }

  const principalComment = skillsReport.comment || "";
  const attendance = skillsReport.attendance || { schoolOpened: '-', timesPresent: '-', timesAbsent: '-', rate: 0 };
  const classId = classObj._id.toString();
  const formMasterId = sessionSettings?.classAssignments?.[classId];
  let formMasterName = 'Form Master';
  if (formMasterId) {
    try {
      const formMaster = await Teacher.findOne({ _id: formMasterId, schoolId });
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

  const studentPosition = await computeOverallPosition({
    schoolId,
    studentId: student._id,
    classId: classObj._id,
    sessionId: sessionObj._id,
    termId: termObj._id
  });

  const flattenedSkills = {
    punctuality: skillsReport.skills.punctuality,
    attentiveness: skillsReport.skills.attentiveness,
    honesty: skillsReport.skills.honesty,
    neatness: skillsReport.skills.neatness,
    politeness: skillsReport.skills.politeness,
    selfControl: skillsReport.skills.selfControl,
    handling: skillsReport.skills.handling,
    drawing: skillsReport.skills.drawing,
    handwriting: skillsReport.skills.handwriting,
    speaking: skillsReport.skills.speaking,
    fluency: skillsReport.skills.fluency
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
    studentPosition: studentPosition,
    nextTermDate: null,
    dateIssued: new Date().toISOString(),
    skills: flattenedSkills,
    teacherComment: {
      comment: skillsReport.comment || 'No comment on record',
      teacherName: formMasterName
    },
    principalRemark: {
      remark: principalComment || 'No remark on record',
      principalName: sessionSettings?.principalName || 'Principal'
    }
  };
}

// 6. mergeDuplicateResults - Scoped by schoolId
async function mergeDuplicateResults(schoolId) {
  try {
    console.log(`Starting duplicate merge process for schoolId: ${schoolId}`);
    const matchCriteria = schoolId ? { schoolId: new mongoose.Types.ObjectId(schoolId) } : {};
    
    const duplicateGroups = await Result.aggregate([
      { $match: matchCriteria },
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
        $match: { count: {$gt: 1 } }
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
      await Result.findOneAndUpdate({ _id: primaryResult._id, schoolId }, mergedData);
      for (const other of othersToDelete) {
        await Result.findOneAndDelete({ _id: other._id, schoolId });
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

// 7. GET /dashboard/student/:studentId
router.get('/dashboard/student/:studentId', async (req, res) => {
  try {
    const schoolId = getAuthSchoolId(req);
    if (!schoolId) return res.status(401).json({ error: 'Unauthorized: Missing school context' });

    const { studentId } = req.params;
    const { sessionId, termId } = req.query;
    if (!sessionId || !termId) {
      return res.status(400).json({ 
        error: 'Missing required parameters: sessionId and termId are required',
        message: 'Please provide sessionId and termId as query parameters'
      });
    }
    const query = {
      schoolId,
      student: studentId,
      session: sessionId,
      term: termId,
      status: 'Published'
    };
    const results = await Result.find(query)
      .populate('student')
      .populate('class')
      .populate('session')
      .populate('term')
      .populate('subject');
    if (!results.length) {
      return res.status(404).json({ error: 'No results found for this student in the selected session and term' });
    }
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

// 8. GET /dashboard/all
router.get('/dashboard/all', async (req, res) => {
  try {
    const schoolId = getAuthSchoolId(req);
    if (!schoolId) return res.status(401).json({ error: 'Unauthorized: Missing school context' });

    const query = { schoolId, status: 'Published' };
    if (req.query.session) {
      const sess = await Session.findOne({ schoolId, name: req.query.session });
      if (sess) query.session = sess._id;
    }
    if (req.query.term) {
      const term = await Term.findOne({ schoolId, name: req.query.term });
      if (term) query.term = term._id;
    }
    if (req.query.student_id) {
      const student = await Student.findOne({ schoolId, student_id: req.query.student_id });
      if (student) query.student = student._id;
    }
    if (req.query.class) {
      const klass = await Class.findOne({ schoolId, name: req.query.class });
      if (klass) query.class = klass._id;
    }
    if (req.query.subject) {
      const subject = await Subject.findOne({ schoolId, name: req.query.subject });
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
          classId: result.class?._id,
          sessionId: result.session?._id,
          termId: result.term?._id,
          subjects: [],
          totalScore: 0,
          grade: '',
          remarks: '',
          status: result.status,
          resultIds: [],
          skills: {
            punctuality: '-', obedience: '-', honesty: '-', cleanliness: '-', initiative: '-', cooperation: '-'
          },
          attendance: { present: '-', absent: '-', rate: 0 },
          teacherComment: { comment: 'No comment on record', teacherName: 'Unknown' },
          principalRemark: { remark: 'No remark on record', principalName: 'Unknown' },
          studentPosition: 0,
          classSize: 0
        };
      }
      const total = calculateResultTotal(result);
      const { grade, remark } = getGradeAndRemark(total);
      const subjectPosition = result.subject_position || result.subject_position_num || '-';
      studentMap[key].subjects.push({
        name: result.subject?.name,
        ca1_score: result.ca1_score || 0,
        ca2_score: result.ca2_score || 0,
        midterm_score: result.midterm_score || 0,
        exam_score: result.exam_score || 0,
        total: total,
        grade: grade,
        remarks: remark,
        position: subjectPosition
      });
      studentMap[key].totalScore += total;
      studentMap[key].resultIds.push(result._id.toString());
      if (result.skills && Object.keys(result.skills).length > 0) studentMap[key].skills = result.skills;
      if (result.attendance && Object.keys(result.attendance).length > 0) studentMap[key].attendance = result.attendance;
      if (result.teacherComment && Object.keys(result.teacherComment).length > 0) studentMap[key].teacherComment = result.teacherComment;
      if (result.principalRemark && Object.keys(result.principalRemark).length > 0) studentMap[key].principalRemark = result.principalRemark;
      if (result.studentPosition) studentMap[key].studentPosition = result.studentPosition;
    });
    const transformedResults = Object.values(studentMap).map(student => {
      const numSubjects = student.subjects.length;
      const avgScore = numSubjects > 0 ? student.totalScore / numSubjects : 0;
      const { grade, remark } = getGradeAndRemark(avgScore);
      return {
        id: student.resultIds[0],
        allResultIds: student.resultIds,
        studentId: student.studentId,
        studentName: student.studentName,
        regNo: student.regNo,
        classLevel: student.classLevel,
        academicYear: student.academicYear,
        term: student.term,
        classId: student.classId,
        sessionId: student.sessionId,
        termId: student.termId,
        totalScore: numSubjects > 0 ? (student.totalScore / numSubjects).toFixed(2) : '0.00',
        totalSubjectScore: student.totalScore.toFixed(2),
        numSubjects: numSubjects,
        grade: grade,
        remarks: remark,
        status: student.status,
        skills: student.skills,
        attendance: student.attendance,
        teacherComment: student.teacherComment,
        principalRemark: student.principalRemark,
        studentPosition: student.studentPosition,
        classSize: student.classSize,
        subjects: student.subjects
      };
    });
    res.json(transformedResults);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. GET /check (Public route - Resolves schoolId dynamically via Student)
router.get('/check', async (req, res) => {
  try {
    const { regNo, scratchCard, class: className, session, term } = req.query;
    if (!regNo || !scratchCard || !className || !session || !term)
      return res.status(400).json({ error: 'Missing required parameters.' });

    let student = await Student.findOne({ regNo }) || await Student.findOne({ student_id: regNo });
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const schoolId = student.schoolId;
    if (!schoolId) return res.status(404).json({ error: 'School context for student not found.' });

    const storedCard = (student.scratchCard || 'ABCD').trim().toUpperCase();
    if (scratchCard.trim().toUpperCase() !== storedCard) {
      return res.status(401).json({ error: 'Invalid scratch card' });
    }

    const classObj = await Class.findOne({ schoolId, name: className });
    if (!classObj) return res.status(404).json({ error: 'Result unavailable for selected session and term.' });
    
    const sessionObj = await Session.findOne({ schoolId, name: session });
    if (!sessionObj) return res.status(404).json({ error: 'Result unavailable for selected session and term.' });
    
    const termObj = await Term.findOne({ schoolId, name: term });
    if (!termObj) return res.status(404).json({ error: 'Result unavailable for selected session and term.' });

    const results = await Result.find({
      schoolId,
      student: student._id,
      class: classObj._id,
      session: sessionObj._id,
      term: termObj._id,
      status: 'Published'
    }).populate('subject');

    if (!results.length) return res.status(404).json({ error: 'Result unavailable for selected session and term.' });

    const sessionSettings = await getSessionSettings(schoolId);
    const reportData = await buildReportData(student, classObj, sessionObj, termObj, results, sessionSettings, schoolId);
    res.json(reportData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. GET /student/:studentId/report
router.get('/student/:studentId/report', async (req, res) => {
  try {
    const schoolId = getAuthSchoolId(req);
    if (!schoolId) return res.status(401).json({ error: 'Unauthorized: Missing school context' });

    const { studentId } = req.params;
    const { sessionId, termId, classId } = req.query;
    if (!studentId || !sessionId || !termId) {
      return res.status(400).json({ error: 'Missing required parameters: studentId, sessionId, termId' });
    }
    const student = await Student.findOne({ _id: studentId, schoolId }).populate('class');
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const sessionObj = await Session.findOne({ _id: sessionId, schoolId });
    const termObj = await Term.findOne({ _id: termId, schoolId });
    if (!sessionObj || !termObj) {
      return res.status(404).json({ error: 'Session or Term not found' });
    }

    let classObj = student.class;
    if (classId) {
      classObj = await Class.findOne({ _id: classId, schoolId });
    }
    if (!classObj) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const results = await Result.find({
      schoolId,
      student: student._id,
      class: classObj._id,
      session: sessionObj._id,
      term: termObj._id,
      status: 'Published'
    }).populate('subject');

    if (!results.length) {
      return res.status(404).json({ error: 'No results found for this student' });
    }

    const sessionSettings = await getSessionSettings(schoolId);
    const reportData = await buildReportData(student, classObj, sessionObj, termObj, results, sessionSettings, schoolId);
    res.json(reportData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. POST /upsert
router.post('/upsert', async (req, res) => {
  try {
    const schoolId = getAuthSchoolId(req);
    if (!schoolId) return res.status(401).json({ error: 'Unauthorized: Missing school context' });

    const { session, term, class: className, subject, resultType, results } = req.body;
    if (!results || results.length === 0) {
      return res.status(400).json({ success: false, error: 'No results provided' });
    }
    if (!session || !term || !className || !subject) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: session, term, class, subject' 
      });
    }

    const sessionObj = await findOrCreateByName(Session, session, schoolId);
    const termObj = await findOrCreateByName(Term, term, schoolId);
    const classObj = await findOrCreateByName(Class, className, schoolId);
    const subjectObj = await findOrCreateByName(Subject, subject, schoolId);

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
        const student = await findOrCreateStudent(row, schoolId, classObj._id);
        if (!student) {
          errors.push(`${row.student_name}: Could not find or create student`);
          continue;
        }

        const updateData = {
          schoolId,
          student: student._id,
          session: sessionObj._id,
          term: termObj._id,
          class: classObj._id,
          subject: subjectObj._id,
          grade: row.grade || '',
          remarks: row.remarks || '',
          status: row.status || 'Draft'
        };

        if (resultType) {
          updateData[`${resultType}_score`] = parseFloat(row.score) || 0;
        } else {
          if (row.ca1_score !== undefined) updateData.ca1_score = parseFloat(row.ca1_score) || 0;
          if (row.ca2_score !== undefined) updateData.ca2_score = parseFloat(row.ca2_score) || 0;
          if (row.midterm_score !== undefined) updateData.midterm_score = parseFloat(row.midterm_score) || 0;
          if (row.exam_score !== undefined) updateData.exam_score = parseFloat(row.exam_score) || 0;
        }

        if (row.skills) updateData.skills = row.skills;
        if (row.attendance) updateData.attendance = row.attendance;
        if (row.teacherComment) updateData.teacherComment = row.teacherComment;
        if (row.principalRemark) updateData.principalRemark = row.principalRemark;
        if (row.position) updateData.subject_position = row.position;

        const existingResult = await Result.findOne({
          schoolId,
          student: student._id,
          session: sessionObj._id,
          term: termObj._id,
          class: classObj._id,
          subject: subjectObj._id
        });

        if (existingResult) {
          await Result.findOneAndUpdate({ _id: existingResult._id, schoolId }, updateData, { new: true });
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
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully processed: ${inserted} inserted, ${updated} updated`
    });
  } catch (err) {
    console.error('Upsert error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 12. POST /upload
router.post('/upload', async (req, res) => {
  try {
    const schoolId = getAuthSchoolId(req);
    if (!schoolId) return res.status(401).json({ error: 'Unauthorized: Missing school context' });

    const { session, term, class: className, subject, resultType, results, upsert } = req.body;
    if (!results || results.length === 0) {
      return res.status(400).json({ success: false, error: 'No results provided' });
    }
    if (!session || !term || !className || !subject) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: session, term, class, subject' 
      });
    }

    const sessionObj = await findOrCreateByName(Session, session, schoolId);
    const termObj = await findOrCreateByName(Term, term, schoolId);
    const classObj = await findOrCreateByName(Class, className, schoolId);
    const subjectObj = await findOrCreateByName(Subject, subject, schoolId);

    if (!sessionObj || !termObj || !classObj || !subjectObj) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required references' 
      });
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const insertedResults = [];
    const errors = [];

    for (const row of results) {
      try {
        const studentId = row.student_id;
        if (!studentId) {
          errors.push(`${row.student_name}: Student ID is required`);
          skipped++;
          continue;
        }

        let student = await Student.findOne({ _id: studentId, schoolId }).catch(() => null);
        if (!student) {
          student = await Student.findOne({ student_id: studentId, schoolId });
        }

        if (!student) {
          student = new Student({
            schoolId,
            student_id: studentId,
            name: row.student_name,
            regNo: row.regNo || '',
            class: classObj._id
          });
          await student.save();
        }

        const resultData = {
          schoolId,
          student: student._id,
          session: sessionObj._id,
          term: termObj._id,
          class: classObj._id,
          subject: subjectObj._id,
          grade: row.grade || '',
          remarks: row.remarks || '',
          status: row.status || 'Draft'
        };

        if (resultType && row.exam_score !== undefined) {
          resultData.exam_score = parseFloat(row.exam_score) || 0;
        }
        if (row.ca1_score !== undefined) resultData.ca1_score = parseFloat(row.ca1_score) || 0;
        if (row.ca2_score !== undefined) resultData.ca2_score = parseFloat(row.ca2_score) || 0;
        if (row.midterm_score !== undefined) resultData.midterm_score = parseFloat(row.midterm_score) || 0;
        if (row.skills) resultData.skills = row.skills;
        if (row.attendance) resultData.attendance = row.attendance;
        if (row.teacherComment) resultData.teacherComment = row.teacherComment;
        if (row.principalRemark) resultData.principalRemark = row.principalRemark;
        if (row.studentPosition) resultData.studentPosition = row.studentPosition;
        if (row.position) resultData.subject_position = row.position;

        const existingResult = await Result.findOne({
          schoolId,
          student: student._id,
          session: sessionObj._id,
          term: termObj._id,
          class: classObj._id,
          subject: subjectObj._id
        });

        if (existingResult) {
          if (upsert) {
            const updatedResult = await Result.findOneAndUpdate(
              { _id: existingResult._id, schoolId },
              resultData,
              { new: true }
            );
            updated++;
            insertedResults.push(updatedResult);
          } else {
            skipped++;
          }
        } else {
          const newResult = new Result(resultData);
          await newResult.save();
          inserted++;
          insertedResults.push(newResult);
        }
      } catch (err) {
        errors.push(`${row.student_name || 'Unknown'}: ${err.message}`);
      }
    }

    res.json({ 
      success: true, 
      inserted, 
      updated,
      skipped,
      total: inserted + updated,
      results: insertedResults.length > 0 ? insertedResults : undefined,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully processed: ${inserted} inserted, ${updated} updated, ${skipped} skipped`
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 13. POST /merge-duplicates
router.post('/merge-duplicates', async (req, res) => {
  try {
    const schoolId = getAuthSchoolId(req);
    if (!schoolId) return res.status(401).json({ error: 'Unauthorized: Missing school context' });

    const result = await mergeDuplicateResults(schoolId);
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

// 14. POST /push-cbt
router.post('/push-cbt', async (req, res) => {
  try {
    const schoolId = getAuthSchoolId(req);
    if (!schoolId) return res.status(401).json({ error: 'Unauthorized: Missing school context' });

    const allowedFields = ['ca1_score', 'ca2_score', 'midterm_score', 'exam_score'];
    const { scoreField } = req.body;
    if (!allowedFields.includes(scoreField)) {
      return res.status(400).json({ error: 'Invalid score field selected.' });
    }

    const ResultCBT = require('../models/ResultCBT');
    const cbtResults = await ResultCBT.find({ schoolId }).populate('student exam');
    let inserted = 0, skipped = 0, errors = [];

    for (const r of cbtResults) {
      const exam = r.exam;
      const student = r.student;
      if (!exam || !student) { skipped++; continue; }

      const dup = await Result.findOne({
        schoolId,
        student: student._id,
        class: exam.class,
        subject: exam.subject,
        session: exam.session,
        term: exam.term
      });

      if (dup) { skipped++; continue; }

      let resultData = {
        schoolId,
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
    res.status(500).json({ error: err.message });
  }
});

// 15. GET /
router.get('/', async (req, res) => {
  try {
    const schoolId = getAuthSchoolId(req);
    if (!schoolId) return res.status(401).json({ error: 'Unauthorized: Missing school context' });

    const query = { schoolId };

    if (req.query.session) {
      const sess = await Session.findOne({ schoolId, name: req.query.session });
      if (!sess) return res.status(404).json({ error: "Result unavailable for selected session and term." });
      query.session = sess._id;
    }
    if (req.query.term) {
      const term = await Term.findOne({ schoolId, name: req.query.term });
      if (!term) return res.status(404).json({ error: "Result unavailable for selected session and term." });
      query.term = term._id;
    }
    if (req.query.student_id) {
      const student = await Student.findOne({ schoolId, student_id: req.query.student_id });
      if (student) query.student = student._id;
    }
    if (req.query.class) {
      const klass = await Class.findOne({ schoolId, name: req.query.class });
      if (klass) query.class = klass._id;
    }
    if (req.query.subject) {
      const subject = await Subject.findOne({ schoolId, name: req.query.subject });
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

// 16. GET /:id
router.get('/:id', async (req, res) => {
  try {
    const schoolId = getAuthSchoolId(req);
    if (!schoolId) return res.status(401).json({ error: 'Unauthorized: Missing school context' });

    const result = await Result.findOne({ _id: req.params.id, schoolId })
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

// 17. PUT /:id
router.put('/:id', async (req, res) => {
  try {
    const schoolId = getAuthSchoolId(req);
    if (!schoolId) return res.status(401).json({ error: 'Unauthorized: Missing school context' });

    // Enforce schoolId on updated payload
    delete req.body.schoolId;

    const updated = await Result.findOneAndUpdate(
      { _id: req.params.id, schoolId }, 
      req.body, 
      { new: true }
    )
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

// 18. PATCH /:id
router.patch('/:id', async (req, res) => {
  try {
    const schoolId = getAuthSchoolId(req);
    if (!schoolId) return res.status(401).json({ error: 'Unauthorized: Missing school context' });

    delete req.body.schoolId;

    const updated = await Result.findOneAndUpdate(
      { _id: req.params.id, schoolId }, 
      req.body, 
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: 'Result not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 19. POST /:id/publish
router.post('/:id/publish', async (req, res) => {
  try {
    const schoolId = getAuthSchoolId(req);
    if (!schoolId) return res.status(401).json({ error: 'Unauthorized: Missing school context' });

    const updated = await Result.findOneAndUpdate(
      { _id: req.params.id, schoolId }, 
      { status: 'Published' }, 
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: 'Result not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 20. DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const schoolId = getAuthSchoolId(req);
    if (!schoolId) return res.status(401).json({ error: 'Unauthorized: Missing school context' });

    const deleted = await Result.findOneAndDelete({ _id: req.params.id, schoolId });
    if (!deleted) return res.status(404).json({ error: 'Result not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
