const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { authMiddleware } = require('./auth');
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

function validId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function getAdminSchoolId(req) {
  const schoolId = req.user?.schoolId;

  if (!schoolId || !mongoose.Types.ObjectId.isValid(schoolId)) {
    throw new Error('Your account is not linked to a valid school.');
  }

  return new mongoose.Types.ObjectId(schoolId);
}

function getSchoolId(req) {
  if (!req.staff || !req.staff.schoolId) throw new Error('Teacher is not linked to a school.');
  if (!validId(req.staff.schoolId)) throw new Error('Invalid school context.');
  return new mongoose.Types.ObjectId(req.staff.schoolId);
}

function teacherAllowed(req, id) {
  return String(req.staff?._id) === String(id);
}

function requireTeacher(req, res, id = null) {
  if (!req.staff || String(req.staff.access_level || '').toLowerCase() !== 'teacher') {
    res.status(403).json({ error: 'Teacher access required.' });
    return false;
  }
  if (id && !teacherAllowed(req, id)) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

function errorResponse(res, error) {
  if (error?.name === 'ValidationError') {
    return res.status(400).json({
      error: Object.values(error.errors || {}).map(e => e.message).join('; ') || error.message
    });
  }
  if (error?.code === 11000) {
    return res.status(400).json({ error: 'Duplicate record.' });
  }
  return res.status(500).json({ error: error?.message || 'Server error.' });
}

function teacherProfile(teacher) {
  return {
    id: teacher._id,
    name: `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim(),
    email: teacher.email,
    phone: teacher.phone,
    designation: teacher.designation,
    department: teacher.department,
    photo_url: teacher.photo || null
  };
}

function classFilter(schoolId, extra = {}) {
  return { schoolId, ...extra };
}

function schoolFilter(schoolId, extra = {}) {
  return { schoolId, ...extra };
}

/* ==========================================================================
   1. ADMIN / SUPERADMIN ROUTES (Uses authMiddleware)
   ========================================================================== */

router.get('/', authMiddleware, async (req, res) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();

    if (!['admin', 'superadmin'].includes(role)) {
      return res.status(403).json({
        error: 'You are not authorized to view teachers.'
      });
    }

    const schoolId = getAdminSchoolId(req);

    const teachers = await Staff.find({
      schoolId,
      access_level: 'Teacher'
    })
      .select('first_name last_name email phone designation department photo')
      .lean();

    res.json(
      teachers.map(teacher => ({
        id: teacher._id,
        first_name: teacher.first_name,
        last_name: teacher.last_name,
        name: `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim(),
        email: teacher.email,
        phone: teacher.phone,
        designation: teacher.designation,
        department: teacher.department,
        photo_url: teacher.photo || null
      }))
    );
  } catch (error) {
    errorResponse(res, error);
  }
});

/* ==========================================================================
   2. TEACHER PORTAL MIDDLEWARE
   All routes declared below this line will be protected by teacherAuth
   ========================================================================== */

router.use(teacherAuth);

/* ==========================================================================
   3. TEACHER PORTAL ROUTES
   ========================================================================== */

router.get('/me', async (req, res) => {
  try {
    if (!requireTeacher(req, res)) return;
    const schoolId = getSchoolId(req);

    const teacher = await Staff.findOne({
      _id: req.staff._id,
      schoolId,
      access_level: 'Teacher'
    }).lean();

    if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });

    const classes = await Class.find(classFilter(schoolId, { teachers: teacher._id }))
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
        teacher: s.teacher
          ? {
              id: s.teacher._id,
              name: `${s.teacher.first_name || ''} ${s.teacher.last_name || ''}`.trim(),
              email: s.teacher.email
            }
          : null
      }))
    }));

    res.json({ ...teacherProfile(teacher), classes: classData });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.patch('/me', async (req, res) => {
  try {
    if (!requireTeacher(req, res)) return;
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
      { _id: req.staff._id, schoolId },
      update,
      { new: true, runValidators: true }
    ).lean();

    if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });

    res.json(teacherProfile(teacher));
  } catch (error) {
    errorResponse(res, error);
  }
});

router.get('/classes', async (req, res) => {
  try {
    if (!requireTeacher(req, res)) return;
    const schoolId = getSchoolId(req);
    const classes = await Class.find(classFilter(schoolId, { teachers: req.staff._id })).lean();

    res.json(classes.map(cls => ({ id: cls._id, name: cls.name, arms: cls.arms })));
  } catch (error) {
    errorResponse(res, error);
  }
});

router.get('/subjects', async (req, res) => {
  try {
    if (!requireTeacher(req, res)) return;
    const { classId } = req.query;
    if (!validId(classId)) return res.status(400).json({ error: 'Valid classId is required.' });

    const schoolId = getSchoolId(req);
    const cls = await Class.findOne(classFilter(schoolId, { _id: classId, teachers: req.staff._id }))
      .populate('subjects.subject')
      .populate('subjects.teacher');

    if (!cls) return res.status(404).json({ error: 'Class not found or not assigned to teacher.' });

    res.json(
      (cls.subjects || [])
        .filter(s => s.teacher && String(s.teacher._id) === String(req.staff._id))
        .map(s => ({ id: s.subject?._id, name: s.subject?.name }))
    );
  } catch (error) {
    errorResponse(res, error);
  }
});

router.get('/students', async (req, res) => {
  try {
    if (!requireTeacher(req, res)) return;
    const { classId } = req.query;
    if (!validId(classId)) return res.status(400).json({ error: 'Valid classId is required.' });

    const schoolId = getSchoolId(req);
    const cls = await Class.findOne(classFilter(schoolId, { _id: classId, teachers: req.staff._id })).lean();
    if (!cls) return res.status(404).json({ error: 'Class not found or not assigned to teacher.' });

    const students = await Student.find(schoolFilter(schoolId, { class: cls.name })).lean();

    res.json(
      students.map(stu => ({
        id: stu._id,
        name: `${stu.firstname || ''} ${stu.surname || ''}`.trim(),
        regNo: stu.regNo,
        email: stu.studentEmail
      }))
    );
  } catch (error) {
    errorResponse(res, error);
  }
});

router.get('/:id/cbt-results', async (req, res) => {
  try {
    if (!requireTeacher(req, res, req.params.id)) return;
    const schoolId = getSchoolId(req);

    const classes = await Class.find(classFilter(schoolId, { teachers: req.staff._id }), '_id').lean();
    const classIds = classes.map(c => c._id);

    const query = {
      schoolId,
      class: req.query.classId ? req.query.classId : { $in: classIds }
    };

    if (req.query.classId && !classIds.some(id => String(id) === String(req.query.classId))) {
      return res.status(403).json({ error: 'Not assigned to this class.' });
    }

    const results = await ResultCBT.find(query)
      .populate('student', 'firstname surname')
      .populate('class', 'name')
      .populate('exam', 'title')
      .sort({ createdAt: -1 });

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
  } catch (error) {
    errorResponse(res, error);
  }
});

router.get('/:id/cbt-results/:resultId', async (req, res) => {
  try {
    if (!requireTeacher(req, res, req.params.id)) return;
    const schoolId = getSchoolId(req);

    const result = await ResultCBT.findOne({ _id: req.params.resultId, schoolId })
      .populate('student', 'firstname surname')
      .populate('class', 'name')
      .populate('exam', 'title');

    if (!result) return res.status(404).json({ error: 'Result not found.' });

    const assigned = await Class.exists(
      classFilter(schoolId, { _id: result.class?._id, teachers: req.staff._id })
    );

    if (!assigned) return res.status(403).json({ error: 'You are not assigned to this class.' });

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
  } catch (error) {
    errorResponse(res, error);
  }
});

router.get('/:id/assignments', async (req, res) => {
  try {
    if (!requireTeacher(req, res, req.params.id)) return;
    const schoolId = getSchoolId(req);

    const assignments = await Assignment.find(schoolFilter(schoolId, { teacher: req.params.id }))
      .populate({ path: 'class', select: 'name' })
      .sort({ dueDate: 1 });

    res.json({ assignments });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post('/:id/assignments', async (req, res) => {
  try {
    if (!requireTeacher(req, res, req.params.id)) return;
    const schoolId = getSchoolId(req);
    const { class: classId, subject, title, description, dueDate, cbt } = req.body;

    if (!validId(classId)) return res.status(400).json({ error: 'Valid class is required.' });

    const cls = await Class.findOne(classFilter(schoolId, { _id: classId, teachers: req.staff._id }));
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
  } catch (error) {
    errorResponse(res, error);
  }
});

router.patch('/:id/assignments/:assignmentId', async (req, res) => {
  try {
    if (!requireTeacher(req, res, req.params.id)) return;
    const schoolId = getSchoolId(req);
    const update = { ...req.body };
    delete update.schoolId;
    delete update.teacher;

    if (update.class) {
      if (!validId(update.class)) return res.status(400).json({ error: 'Valid class is required.' });
      const cls = await Class.findOne(classFilter(schoolId, { _id: update.class, teachers: req.staff._id }));
      if (!cls) return res.status(403).json({ error: 'You are not assigned to this class.' });
    }

    const assignment = await Assignment.findOneAndUpdate(
      schoolFilter(schoolId, { _id: req.params.assignmentId, teacher: req.staff._id }),
      update,
      { new: true, runValidators: true }
    ).populate({ path: 'class', select: 'name' });

    if (!assignment) return res.status(404).json({ error: 'Assignment not found or not owned by teacher.' });

    res.json({ success: true, assignment });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.delete('/:id/assignments/:assignmentId', async (req, res) => {
  try {
    if (!requireTeacher(req, res, req.params.id)) return;
    const schoolId = getSchoolId(req);

    const assignment = await Assignment.findOneAndDelete(
      schoolFilter(schoolId, { _id: req.params.assignmentId, teacher: req.staff._id })
    );

    if (!assignment) return res.status(404).json({ error: 'Assignment not found or not owned by teacher.' });

    res.json({ success: true });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.get('/:id/notifications', async (req, res) => {
  try {
    if (!requireTeacher(req, res, req.params.id)) return;
    const schoolId = getSchoolId(req);

    const notifications = await Notification.find(
      schoolFilter(schoolId, { teacher: req.staff._id })
    ).sort({ date: -1 });

    res.json({ notifications });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.delete('/:id/notifications/:notificationId', async (req, res) => {
  try {
    if (!requireTeacher(req, res, req.params.id)) return;
    const schoolId = getSchoolId(req);

    const notification = await Notification.findOneAndDelete(
      schoolFilter(schoolId, { _id: req.params.notificationId, teacher: req.staff._id })
    );

    if (!notification) return res.status(404).json({ error: 'Notification not found or not owned by teacher.' });

    res.json({ success: true });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.get('/:id/draft-results', async (req, res) => {
  try {
    if (!requireTeacher(req, res, req.params.id)) return;
    const schoolId = getSchoolId(req);

    const draftResults = await DraftResult.find(
      schoolFilter(schoolId, { teacher: req.staff._id })
    );

    res.json({ draftResults });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post('/:id/draft-results', async (req, res) => {
  try {
    if (!requireTeacher(req, res, req.params.id)) return;
    const schoolId = getSchoolId(req);
    const input = { ...req.body };
    delete input.schoolId;
    delete input.teacher;

    if (input.class && !validId(input.class)) return res.status(400).json({ error: 'Invalid class.' });
    if (input.studentId && !validId(input.studentId)) return res.status(400).json({ error: 'Invalid student.' });

    const query = {
      schoolId,
      teacher: req.staff._id,
      student: input.studentId,
      class: input.classId,
      term: input.term
    };

    let draft = await DraftResult.findOne(query);

    if (!draft) {
      draft = new DraftResult({
        ...input,
        schoolId,
        teacher: req.staff._id,
        student: input.studentId,
        class: input.classId
      });
    } else {
      Object.assign(draft, input);
    }

    draft.updated = new Date();
    await draft.save();

    res.json({ draftResult: draft });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post('/classes/:classId/subjects', async (req, res) => {
  try {
    if (!requireTeacher(req, res)) return;
    const schoolId = getSchoolId(req);
    const { classId } = req.params;
    const { subjectName } = req.body;

    if (!validId(classId)) return res.status(400).json({ error: 'Valid classId is required.' });
    if (!subjectName || !String(subjectName).trim()) {
      return res.status(400).json({ error: 'subjectName is required.' });
    }

    const cls = await Class.findOne(classFilter(schoolId, { _id: classId, teachers: req.staff._id }));
    if (!cls) return res.status(403).json({ error: 'Class not found or not assigned to teacher.' });

    let subject = await Subject.findOne(schoolFilter(schoolId, { name: String(subjectName).trim() }));
    if (!subject) {
      subject = await Subject.create({ name: String(subjectName).trim(), schoolId });
    }

    const exists = (cls.subjects || []).some(
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
      subject: added
        ? {
            id: added.subject._id,
            name: added.subject.name,
            teacher: added.teacher
              ? {
                  id: added.teacher._id,
                  name: `${added.teacher.first_name || ''} ${added.teacher.last_name || ''}`.trim(),
                  email: added.teacher.email
                }
              : null
          }
        : null
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post('/:id/cbt', async (req, res) => {
  try {
    if (!requireTeacher(req, res, req.params.id)) return;
    const schoolId = getSchoolId(req);
    const { class: classId, subject, title, duration, questions } = req.body;

    if (!validId(classId)) return res.status(400).json({ error: 'Valid class is required.' });

    const cls = await Class.findOne(classFilter(schoolId, { _id: classId, teachers: req.staff._id }));
    if (!cls) return res.status(403).json({ error: 'You are not assigned to this class.' });

    const cbt = new CBT({
      schoolId,
      teacher: req.staff._id,
      class: classId,
      subject,
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
  } catch (error) {
    errorResponse(res, error);
  }
});

router.get('/:id/cbt', async (req, res) => {
  try {
    if (!requireTeacher(req, res, req.params.id)) return;
    const schoolId = getSchoolId(req);

    const cbts = await CBT.find(schoolFilter(schoolId, { teacher: req.staff._id }))
      .populate('class', 'name')
      .populate('subject', 'name');

    res.json({ cbts });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.get('/cbt/:cbtId', async (req, res) => {
  try {
    if (!requireTeacher(req, res)) return;
    const schoolId = getSchoolId(req);

    const cbt = await CBT.findOne(schoolFilter(schoolId, { _id: req.params.cbtId, teacher: req.staff._id }))
      .populate('class', 'name')
      .populate('subject', 'name');

    if (!cbt) return res.status(404).json({ error: 'CBT not found.' });

    res.json({ cbt });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.get('/:id/cbt/:cbtId', async (req, res) => {
  try {
    if (!requireTeacher(req, res, req.params.id)) return;
    const schoolId = getSchoolId(req);

    const cbt = await CBT.findOne(schoolFilter(schoolId, { _id: req.params.cbtId, teacher: req.staff._id }))
      .populate('class', 'name')
      .populate('subject', 'name');

    if (!cbt) return res.status(404).json({ error: 'CBT not found or not owned by teacher.' });

    res.json({ cbt });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.patch('/:id/cbt/:cbtId', async (req, res) => {
  try {
    if (!requireTeacher(req, res, req.params.id)) return;
    const schoolId = getSchoolId(req);
    const update = { ...req.body };
    delete update.schoolId;
    delete update.teacher;

    if (update.class) {
      if (!validId(update.class)) return res.status(400).json({ error: 'Valid class is required.' });
      const cls = await Class.findOne(classFilter(schoolId, { _id: update.class, teachers: req.staff._id }));
      if (!cls) return res.status(403).json({ error: 'You are not assigned to this class.' });
    }

    const cbt = await CBT.findOneAndUpdate(
      schoolFilter(schoolId, { _id: req.params.cbtId, teacher: req.staff._id }),
      update,
      { new: true, runValidators: true }
    ).populate([
      { path: 'class', select: 'name' },
      { path: 'subject', select: 'name' }
    ]);

    if (!cbt) return res.status(404).json({ error: 'CBT not found or not owned by teacher.' });

    res.json({ success: true, cbt });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.delete('/:id/cbt/:cbtId', async (req, res) => {
  try {
    if (!requireTeacher(req, res, req.params.id)) return;
    const schoolId = getSchoolId(req);

    const cbt = await CBT.findOneAndDelete(
      schoolFilter(schoolId, { _id: req.params.cbtId, teacher: req.staff._id })
    );

    if (!cbt) return res.status(404).json({ error: 'CBT not found or not owned by teacher.' });

    res.json({ success: true });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post('/:id/cbt/push', async (req, res) => {
  try {
    if (!requireTeacher(req, res, req.params.id)) return;
    const schoolId = getSchoolId(req);
    const { cbtIds } = req.body;

    if (!Array.isArray(cbtIds) || !cbtIds.length) {
      return res.status(400).json({ error: 'cbtIds array is required.' });
    }
    if (cbtIds.some(id => !validId(id))) {
      return res.status(400).json({ error: 'One or more CBT IDs are invalid.' });
    }

    const cbts = await CBT.find(
      schoolFilter(schoolId, { _id: { $in: cbtIds }, teacher: req.staff._id })
    );

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
  } catch (error) {
    errorResponse(res, error);
  }
});

module.exports = router;
