const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const Staff = require('../models/Staff');
const Assignment = require('../models/Assignment');
const Notification = require('../models/Notification');
const DraftResult = require('../models/DraftResult');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const Student = require('../models/Student');
const ResultCBT = require('../models/ResultCBT');
const CBT = require('../models/CBTExam');

const teacherAuth = require('../middleware/teacherAuth');

function getSchoolId(req) {
  const schoolId = req.staff?.schoolId;
  if (!schoolId || !mongoose.Types.ObjectId.isValid(schoolId)) {
    throw new Error('Authenticated teacher is not linked to a valid school.');
  }
  return new mongoose.Types.ObjectId(schoolId);
}

function isTeacher(req) {
  return req.staff && req.staff.access_level === 'Teacher';
}

function isSelf(req) {
  return String(req.params.id) === String(req.staff?._id);
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function teacherRequired(req, res) {
  if (!isTeacher(req)) {
    res.status(403).json({ error: 'Teacher access required.' });
    return false;
  }
  return true;
}

function selfRequired(req, res) {
  if (!isSelf(req)) {
    res.status(403).json({ error: 'Forbidden.' });
    return false;
  }
  return true;
}

function formatTeacher(teacher) {
  return {
    id: teacher._id,
    first_name: teacher.first_name,
    last_name: teacher.last_name,
    name: `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim(),
    email: teacher.email,
    phone: teacher.phone,
    designation: teacher.designation,
    department: teacher.department,
    photo_url: teacher.photo || null
  };
}

function formatClass(cls) {
  return {
    id: cls._id,
    name: cls.name,
    arms: cls.arms
  };
}

router.get('/me', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res)) return;
    const schoolId = getSchoolId(req);

    const teacher = await Staff.findOne({
      _id: req.staff._id,
      schoolId,
      access_level: 'Teacher'
    }).lean();

    if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });

    const classes = await Class.find({ schoolId, teachers: teacher._id })
      .populate({ path: 'subjects.subject', model: 'Subject' })
      .populate({ path: 'subjects.teacher', model: 'Staff', select: 'first_name last_name email' })
      .lean();

    const classData = classes.map(cls => ({
      id: cls._id,
      name: cls.name,
      arms: cls.arms,
      subjects: (cls.subjects || []).map(s => ({
        id: s.subject?._id || null,
        name: s.subject?.name || null,
        teacher: s.teacher ? {
          id: s.teacher._id,
          name: `${s.teacher.first_name || ''} ${s.teacher.last_name || ''}`.trim(),
          email: s.teacher.email
        } : null
      }))
    }));

    res.json({
      ...formatTeacher(teacher),
      classes: classData
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/me', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res)) return;
    const schoolId = getSchoolId(req);

    const allowed = ['first_name', 'last_name', 'email', 'phone', 'designation', 'department'];
    const update = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    if (req.body.login_password) {
      update.login_password = await bcrypt.hash(req.body.login_password, 10);
    }

    const teacher = await Staff.findOneAndUpdate(
      { _id: req.staff._id, schoolId, access_level: 'Teacher' },
      update,
      { new: true, runValidators: true }
    ).lean();

    if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });

    res.json(formatTeacher(teacher));
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Email already exists for this school.' });
    res.status(500).json({ error: err.message });
  }
});

router.get('/classes', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res)) return;
    const schoolId = getSchoolId(req);

    const classes = await Class.find({ schoolId, teachers: req.staff._id }).lean();
    res.json(classes.map(formatClass));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/subjects', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res)) return;
    const { classId } = req.query;

    if (!classId || !isValidObjectId(classId)) {
      return res.status(400).json({ error: 'Valid classId is required.' });
    }

    const schoolId = getSchoolId(req);
    const cls = await Class.findOne({ _id: classId, schoolId, teachers: req.staff._id })
      .populate('subjects.subject')
      .populate('subjects.teacher')
      .lean();

    if (!cls) return res.json([]);

    res.json(
      (cls.subjects || [])
        .filter(s => s.teacher && String(s.teacher._id) === String(req.staff._id))
        .map(s => ({ id: s.subject?._id, name: s.subject?.name }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/students', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res)) return;
    const { classId } = req.query;

    if (!classId || !isValidObjectId(classId)) {
      return res.status(400).json({ error: 'Valid classId is required.' });
    }

    const schoolId = getSchoolId(req);
    const cls = await Class.findOne({ _id: classId, schoolId, teachers: req.staff._id }).lean();

    if (!cls) return res.status(403).json({ error: 'You are not assigned to this class.' });

    const students = await Student.find({ schoolId, class: cls.name }).lean();
    res.json(students.map(stu => ({
      id: stu._id,
      name: `${stu.firstname || ''} ${stu.surname || ''}`.trim(),
      regNo: stu.regNo,
      email: stu.studentEmail
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', teacherAuth, async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const teachers = await Staff.find({ schoolId, access_level: 'Teacher' }).lean();
    res.json(teachers.map(formatTeacher));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/cbt-results', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res) || !selfRequired(req, res)) return;
    const schoolId = getSchoolId(req);

    const classes = await Class.find({ schoolId, teachers: req.staff._id }).select('_id').lean();
    const classIds = classes.map(c => c._id);

    if (req.query.classId && !classIds.some(id => String(id) === String(req.query.classId))) {
      return res.status(403).json({ error: 'Not assigned to this class.' });
    }

    const query = { schoolId, class: req.query.classId || { $in: classIds } };
    const results = await ResultCBT.find(query)
      .populate('student', 'firstname surname')
      .populate('class', 'name')
      .populate('exam', 'title')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      results: results.map(r => ({
        _id: r._id,
        studentName: r.student ? `${r.student.firstname || ''} ${r.student.surname || ''}`.trim() : '',
        classId: r.class?._id || '',
        className: r.class?.name || '',
        examTitle: r.exam?.title || '',
        score: r.score,
        total: r.total,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        answers: r.answers
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/cbt-results/:resultId', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res) || !selfRequired(req, res)) return;
    const schoolId = getSchoolId(req);

    const classes = await Class.find({ schoolId, teachers: req.staff._id }).select('_id').lean();
    const result = await ResultCBT.findOne({
      _id: req.params.resultId,
      schoolId,
      class: { $in: classes.map(c => c._id) }
    })
      .populate('student', 'firstname surname')
      .populate('class', 'name')
      .populate('exam', 'title')
      .lean();

    if (!result) return res.status(404).json({ error: 'Result not found.' });

    res.json({
      _id: result._id,
      studentName: result.student ? `${result.student.firstname || ''} ${result.student.surname || ''}`.trim() : '',
      className: result.class?.name || '',
      examTitle: result.exam?.title || '',
      score: result.score,
      total: result.total,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      answers: result.answers
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/assignments', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res) || !selfRequired(req, res)) return;
    const schoolId = getSchoolId(req);

    const assignments = await Assignment.find({ schoolId, teacher: req.staff._id })
      .populate({ path: 'class', select: 'name' })
      .sort({ dueDate: 1 })
      .lean();

    res.json({ assignments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/assignments', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res) || !selfRequired(req, res)) return;
    const schoolId = getSchoolId(req);
    const { class: classId, subject, title, description, dueDate, cbt } = req.body;

    if (!isValidObjectId(classId)) return res.status(400).json({ error: 'Valid class is required.' });

    const cls = await Class.findOne({ _id: classId, schoolId, teachers: req.staff._id }).lean();
    if (!cls) return res.status(403).json({ error: 'You are not assigned to this class.' });

    const assignment = new Assignment({
      schoolId,
      teacher: req.staff._id,
      class: classId,
      subject,
      title,
      description,
      dueDate,
      cbt
    });

    await assignment.save();
    await assignment.populate({ path: 'class', select: 'name' });

    res.status(201).json({ assignment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/assignments/:assignmentId', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res) || !selfRequired(req, res)) return;
    const schoolId = getSchoolId(req);
    const update = { ...req.body };

    delete update.schoolId;
    delete update.teacher;

    if (update.class) {
      if (!isValidObjectId(update.class)) return res.status(400).json({ error: 'Invalid class.' });
      const cls = await Class.findOne({ _id: update.class, schoolId, teachers: req.staff._id }).lean();
      if (!cls) return res.status(403).json({ error: 'You are not assigned to this class.' });
    }

    const assignment = await Assignment.findOneAndUpdate(
      { _id: req.params.assignmentId, schoolId, teacher: req.staff._id },
      update,
      { new: true, runValidators: true }
    ).populate({ path: 'class', select: 'name' });

    if (!assignment) return res.status(404).json({ error: 'Assignment not found or not owned by teacher.' });

    res.json({ success: true, assignment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/assignments/:assignmentId', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res) || !selfRequired(req, res)) return;
    const schoolId = getSchoolId(req);

    const assignment = await Assignment.findOneAndDelete({
      _id: req.params.assignmentId,
      schoolId,
      teacher: req.staff._id
    });

    if (!assignment) return res.status(404).json({ error: 'Assignment not found or not owned by teacher.' });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/notifications', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res) || !selfRequired(req, res)) return;
    const schoolId = getSchoolId(req);

    const notifications = await Notification.find({ schoolId, teacher: req.staff._id })
      .sort({ date: -1 })
      .lean();

    res.json({ notifications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/notifications/:notificationId', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res) || !selfRequired(req, res)) return;
    const schoolId = getSchoolId(req);

    const notification = await Notification.findOneAndDelete({
      _id: req.params.notificationId,
      schoolId,
      teacher: req.staff._id
    });

    if (!notification) return res.status(404).json({ error: 'Notification not found or not owned by teacher.' });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/draft-results', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res) || !selfRequired(req, res)) return;
    const schoolId = getSchoolId(req);

    const draftResults = await DraftResult.find({ schoolId, teacher: req.staff._id }).lean();

    res.json({ draftResults });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/draft-results', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res) || !selfRequired(req, res)) return;
    const schoolId = getSchoolId(req);
    const input = { ...req.body };

    delete input.schoolId;
    delete input.teacher;

    if (!isValidObjectId(input.studentId) || !isValidObjectId(input.classId)) {
      return res.status(400).json({ error: 'Valid studentId and classId are required.' });
    }

    const cls = await Class.findOne({ _id: input.classId, schoolId, teachers: req.staff._id }).lean();
    if (!cls) return res.status(403).json({ error: 'You are not assigned to this class.' });

    const student = await Student.findOne({ _id: input.studentId, schoolId });
    if (!student) return res.status(404).json({ error: 'Student not found in this school.' });

    let draft = await DraftResult.findOne({
      schoolId,
      teacher: req.staff._id,
      student: input.studentId,
      class: input.classId,
      term: input.term
    });

    if (!draft) {
      draft = new DraftResult({ ...input, schoolId, teacher: req.staff._id });
    } else {
      Object.assign(draft, input);
    }

    draft.updated = new Date();
    await draft.save();

    res.json({ draftResult: draft });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/classes/:classId/subjects', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res)) return;
    const schoolId = getSchoolId(req);
    const { classId } = req.params;
    const { subjectName } = req.body;

    if (!isValidObjectId(classId) || !subjectName?.trim()) {
      return res.status(400).json({ error: 'Valid classId and subjectName are required.' });
    }

    const cls = await Class.findOne({ _id: classId, schoolId, teachers: req.staff._id });
    if (!cls) return res.status(403).json({ error: 'You are not assigned to this class.' });

    let subject = await Subject.findOne({ schoolId, name: subjectName.trim() });
    if (!subject) {
      subject = await Subject.create({ schoolId, name: subjectName.trim() });
    }

    const exists = cls.subjects.some(
      s => String(s.subject) === String(subject._id) && String(s.teacher) === String(req.staff._id)
    );

    if (!exists) {
      cls.subjects.push({ subject: subject._id, teacher: req.staff._id });
      await cls.save();
    }

    await cls.populate([
      { path: 'subjects.subject', model: 'Subject' },
      { path: 'subjects.teacher', model: 'Staff', select: 'first_name last_name email' }
    ]);

    const added = cls.subjects.find(
      s => s.subject && String(s.subject._id) === String(subject._id) && s.teacher && String(s.teacher._id) === String(req.staff._id)
    );

    res.json({
      success: true,
      subject: added ? {
        id: added.subject._id,
        name: added.subject.name,
        teacher: added.teacher ? {
          id: added.teacher._id,
          name: `${added.teacher.first_name || ''} ${added.teacher.last_name || ''}`.trim(),
          email: added.teacher.email
        } : null
      } : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/cbt', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res) || !selfRequired(req, res)) return;
    const schoolId = getSchoolId(req);
    const { class: classId, subject, title, duration, questions } = req.body;

    if (!isValidObjectId(classId)) return res.status(400).json({ error: 'Valid class is required.' });

    const cls = await Class.findOne({ _id: classId, schoolId, teachers: req.staff._id }).lean();
    if (!cls) return res.status(403).json({ error: 'You are not assigned to this class.' });

    let subjectId = subject;
    if (subject && isValidObjectId(subject)) {
      const subjectDoc = await Subject.findOne({ _id: subject, schoolId });
      if (!subjectDoc) return res.status(404).json({ error: 'Subject not found in this school.' });
      subjectId = subjectDoc._id;
    }

    const cbt = new CBT({
      schoolId,
      teacher: req.staff._id,
      class: classId,
      subject: subjectId,
      title,
      duration,
      questions
    });

    await cbt.save();
    await cbt.populate([
      { path: 'class', select: 'name' },
      { path: 'subject', select: 'name' }
    ]);

    res.status(201).json({ cbt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/cbt', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res) || !selfRequired(req, res)) return;
    const schoolId = getSchoolId(req);

    const cbts = await CBT.find({ schoolId, teacher: req.staff._id })
      .populate('class', 'name')
      .populate('subject', 'name')
      .lean();

    res.json({ cbts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cbt/:cbtId', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res)) return;
    const schoolId = getSchoolId(req);

    const cbt = await CBT.findOne({ _id: req.params.cbtId, schoolId, teacher: req.staff._id })
      .populate('class', 'name')
      .populate('subject', 'name')
      .lean();

    if (!cbt) return res.status(404).json({ error: 'CBT not found.' });

    res.json({ cbt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/cbt/:cbtId', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res) || !selfRequired(req, res)) return;
    const schoolId = getSchoolId(req);

    const cbt = await CBT.findOne({ _id: req.params.cbtId, schoolId, teacher: req.staff._id })
      .populate('class', 'name')
      .populate('subject', 'name')
      .lean();

    if (!cbt) return res.status(404).json({ error: 'CBT not found or not owned by teacher.' });

    res.json({ cbt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/cbt/:cbtId', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res) || !selfRequired(req, res)) return;
    const schoolId = getSchoolId(req);
    const update = { ...req.body };

    delete update.schoolId;
    delete update.teacher;

    if (update.class) {
      if (!isValidObjectId(update.class)) return res.status(400).json({ error: 'Invalid class.' });
      const cls = await Class.findOne({ _id: update.class, schoolId, teachers: req.staff._id }).lean();
      if (!cls) return res.status(403).json({ error: 'You are not assigned to this class.' });
    }

    if (update.subject && isValidObjectId(update.subject)) {
      const subject = await Subject.findOne({ _id: update.subject, schoolId }).lean();
      if (!subject) return res.status(404).json({ error: 'Subject not found in this school.' });
    }

    const cbt = await CBT.findOneAndUpdate(
      { _id: req.params.cbtId, schoolId, teacher: req.staff._id },
      update,
      { new: true, runValidators: true }
    ).populate([
      { path: 'class', select: 'name' },
      { path: 'subject', select: 'name' }
    ]);

    if (!cbt) return res.status(404).json({ error: 'CBT not found or not owned by teacher.' });

    res.json({ success: true, cbt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/cbt/:cbtId', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res) || !selfRequired(req, res)) return;
    const schoolId = getSchoolId(req);

    const cbt = await CBT.findOneAndDelete({ _id: req.params.cbtId, schoolId, teacher: req.staff._id });

    if (!cbt) return res.status(404).json({ error: 'CBT not found or not owned by teacher.' });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/cbt/push', teacherAuth, async (req, res) => {
  try {
    if (!teacherRequired(req, res) || !selfRequired(req, res)) return;
    const schoolId = getSchoolId(req);
    const { cbtIds } = req.body;

    if (!Array.isArray(cbtIds) || !cbtIds.length) {
      return res.status(400).json({ error: 'cbtIds array is required.' });
    }

    const cbts = await CBT.find({ _id: { $in: cbtIds }, schoolId, teacher: req.staff._id }).lean();

    if (!cbts.length) return res.status(404).json({ error: 'No CBTs found.' });

    const pushed = [];
    for (const cbt of cbts) {
      const exam = new Exam({
        schoolId,
        teacher: req.staff._id,
        title: cbt.title,
        class: cbt.class,
        subject: cbt.subject,
        duration: cbt.duration,
        questions: cbt.questions
      });
      await exam.save();
      pushed.push(exam._id);
    }

    res.json({ success: true, pushed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
