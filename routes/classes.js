const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Class = require('../models/Class');
const Subject = require('../models/Subject');
const Student = require('../models/Student');
const Staff = require('../models/Staff');
const { authMiddleware } = require('./auth');
const teacherAuth = require('../middleware/teacherAuth');

function validId(value) {
    return mongoose.Types.ObjectId.isValid(value);
}

function getAdminSchoolId(req) {
    const schoolId = req.user?.schoolId;

    if (!schoolId || !validId(schoolId)) {
        throw new Error('Your account is not linked to a valid school.');
    }

    return new mongoose.Types.ObjectId(schoolId);
}

function getTeacherSchoolId(req) {
    const schoolId = req.staff?.schoolId;

    if (!schoolId || !validId(schoolId)) {
        throw new Error('Teacher is not linked to a valid school.');
    }

    return new mongoose.Types.ObjectId(schoolId);
}

function requireAdmin(req, res) {
    const role = String(req.user?.role || '').toLowerCase();

    if (!['admin', 'superadmin'].includes(role)) {
        res.status(403).json({
            error: 'Admin access required.'
        });
        return false;
    }

    return true;
}

function normalizeName(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ');
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function populateClass(cls) {
    await cls.populate([
        {
            path: 'subjects.subject',
            model: 'Subject'
        },
        {
            path: 'subjects.teacher',
            model: 'Staff',
            select: 'first_name last_name email access_level schoolId'
        },
        {
            path: 'teachers',
            model: 'Staff',
            select: 'first_name last_name email access_level schoolId'
        },
        {
            path: 'students',
            model: 'Student'
        }
    ]);

    return cls;
}

function formatSubjectAssignment(item) {
    const subject = item?.subject?._id
        ? item.subject
        : item?.subject;

    const teacher = item?.teacher?._id
        ? item.teacher
        : item?.teacher;

    return {
        _id: subject?._id || subject,
        id: subject?._id || subject,
        name: subject?.name || '',
        teacher: teacher
            ? {
                _id: teacher._id || teacher,
                id: teacher._id || teacher,
                name: `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim(),
                email: teacher.email || ''
            }
            : null
    };
}

function formatClass(cls) {
    return {
        _id: cls._id,
        id: cls._id,
        name: cls.name,
        schoolId: cls.schoolId,
        arms: Array.isArray(cls.arms) ? cls.arms : [],
        teachers: Array.isArray(cls.teachers) ? cls.teachers : [],
        subjects: (cls.subjects || []).map(formatSubjectAssignment),
        students: cls.students || []
    };
}


/* =========================================================
   GET /api/classes
   Get classes belonging ONLY to the logged-in school
========================================================= */

router.get('/', authMiddleware, async (req, res) => {
    try {
        const schoolId = getAdminSchoolId(req);
        const teacherId = req.query.teacher_id;

        const query = {
            schoolId
        };

        if (teacherId) {
            if (!validId(teacherId)) {
                return res.status(400).json({
                    error: 'Invalid teacher ID.'
                });
            }

            query.teachers = teacherId;
        }

        const classes = await Class.find(query)
            .sort({ name: 1 });

        await Promise.all(classes.map(populateClass));

        res.json(classes.map(formatClass));

    } catch (err) {
        console.error('Error fetching classes:', err);

        res.status(500).json({
            error: err.message
        });
    }
});


/* =========================================================
   GET /api/classes/all
   Get ALL classes for the logged-in school
========================================================= */

router.get('/all', authMiddleware, async (req, res) => {
    try {
        if (!requireAdmin(req, res)) return;

        const schoolId = getAdminSchoolId(req);

        const classes = await Class.find({
            schoolId
        }).sort({
            name: 1
        });

        await Promise.all(classes.map(populateClass));

        res.json(
            classes.map(cls => ({
                ...formatClass(cls),
                studentCount: Array.isArray(cls.students)
                    ? cls.students.length
                    : 0
            }))
        );

    } catch (err) {
        console.error('Error fetching all classes:', err);

        res.status(500).json({
            error: err.message
        });
    }
});


/* =========================================================
   GET /api/classes/:classId/students
========================================================= */

router.get('/:classId/students', authMiddleware, async (req, res) => {
    try {
        const schoolId = getAdminSchoolId(req);
        const { classId } = req.params;

        if (!validId(classId)) {
            return res.status(400).json({
                error: 'Invalid class ID format.',
                received: classId
            });
        }

        const cls = await Class.findOne({
            _id: classId,
            schoolId
        }).select('_id name schoolId');

        if (!cls) {
            return res.status(404).json({
                error: 'Class not found.'
            });
        }

        const students = await Student.find({
            class: classId,
            schoolId
        }).sort({
            first_name: 1,
            last_name: 1
        });

        res.json(
            students.map(student => ({
                _id: student._id,
                id: student._id,
                name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
                firstName: student.first_name,
                lastName: student.last_name,
                regNo: student.regNo || student.registration_number || 'N/A',
                email: student.email || '',
                class: student.class,
                className: cls.name,
                schoolId: student.schoolId
            }))
        );

    } catch (err) {
        console.error('Error fetching class students:', err);

        res.status(500).json({
            error: err.message,
            type: err.name,
            classId: req.params.classId
        });
    }
});


/* =========================================================
   GET /api/classes/:classId/details
========================================================= */

router.get('/:classId/details', authMiddleware, async (req, res) => {
    try {
        const schoolId = getAdminSchoolId(req);
        const { classId } = req.params;

        if (!validId(classId)) {
            return res.status(400).json({
                error: 'Invalid class ID format.'
            });
        }

        const cls = await Class.findOne({
            _id: classId,
            schoolId
        });

        if (!cls) {
            return res.status(404).json({
                error: 'Class not found.'
            });
        }

        await populateClass(cls);

        res.json(formatClass(cls));

    } catch (err) {
        console.error('Error fetching class:', err);

        res.status(500).json({
            error: err.message
        });
    }
});


/* =========================================================
   POST /api/classes
   Create class inside current school
========================================================= */

router.post('/', authMiddleware, async (req, res) => {
    try {
        if (!requireAdmin(req, res)) return;

        const schoolId = getAdminSchoolId(req);
        const name = normalizeName(req.body.name);

        if (!name) {
            return res.status(400).json({
                error: 'Class name required.'
            });
        }

        const existing = await Class.findOne({
            schoolId,
            name: new RegExp(`^${escapeRegex(name)}$`, 'i')
        });

        if (existing) {
            return res.status(409).json({
                error: 'Class already exists in this school.'
            });
        }

        const newClass = new Class({
            name,
            schoolId,
            arms: [],
            subjects: [],
            teachers: [],
            students: []
        });

        await newClass.save();

        res.status(201).json({
            _id: newClass._id,
            id: newClass._id,
            name: newClass.name,
            schoolId: newClass.schoolId,
            arms: [],
            subjects: [],
            teachers: [],
            students: []
        });

    } catch (err) {
        console.error('Error creating class:', err);

        res.status(500).json({
            error: err.message
        });
    }
});


/* =========================================================
   POST /api/classes/:id/teachers
========================================================= */

router.post('/:id/teachers', authMiddleware, async (req, res) => {
    try {
        if (!requireAdmin(req, res)) return;

        const schoolId = getAdminSchoolId(req);
        const { id } = req.params;
        const { teacherId } = req.body;

        if (!validId(id)) {
            return res.status(400).json({
                error: 'Invalid class ID.'
            });
        }

        if (!teacherId || !validId(teacherId)) {
            return res.status(400).json({
                error: 'Valid teacher ID required.'
            });
        }

        const cls = await Class.findOne({
            _id: id,
            schoolId
        });

        if (!cls) {
            return res.status(404).json({
                error: 'Class not found.'
            });
        }

        const teacher = await Staff.findOne({
            _id: teacherId,
            schoolId,
            access_level: 'Teacher'
        });

        if (!teacher) {
            return res.status(404).json({
                error: 'Teacher not found in this school.'
            });
        }

        if (!cls.teachers.some(id => String(id) === String(teacherId))) {
            cls.teachers.push(teacherId);
            await cls.save();
        }

        await populateClass(cls);

        res.json(formatClass(cls));

    } catch (err) {
        console.error('Error adding teacher:', err);

        res.status(500).json({
            error: err.message
        });
    }
});


/* =========================================================
   POST /api/classes/:id/arms
========================================================= */

router.post('/:id/arms', authMiddleware, async (req, res) => {
    try {
        if (!requireAdmin(req, res)) return;

        const schoolId = getAdminSchoolId(req);
        const { id } = req.params;
        const { arms } = req.body;

        if (!validId(id)) {
            return res.status(400).json({
                error: 'Invalid class ID.'
            });
        }

        if (!Array.isArray(arms)) {
            return res.status(400).json({
                error: 'Arms array required.'
            });
        }

        const cleanArms = arms
            .map(normalizeName)
            .filter(Boolean);

        const updated = await Class.findOneAndUpdate(
            {
                _id: id,
                schoolId
            },
            {
                $set: {
                    arms: cleanArms
                }
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!updated) {
            return res.status(404).json({
                error: 'Class not found.'
            });
        }

        await populateClass(updated);

        res.json(formatClass(updated));

    } catch (err) {
        console.error('Error updating arms:', err);

        res.status(500).json({
            error: err.message
        });
    }
});


/* =========================================================
   POST /api/classes/:id/subjects
   Create/find school subject and assign it to class
========================================================= */

router.post('/:id/subjects', authMiddleware, async (req, res) => {
    try {
        if (!requireAdmin(req, res)) return;

        const schoolId = getAdminSchoolId(req);
        const { id } = req.params;
        const subjectName = normalizeName(req.body.subjectName);

        if (!validId(id)) {
            return res.status(400).json({
                error: 'Invalid class ID.'
            });
        }

        if (!subjectName) {
            return res.status(400).json({
                error: 'Subject name required.'
            });
        }

        const cls = await Class.findOne({
            _id: id,
            schoolId
        });

        if (!cls) {
            return res.status(404).json({
                error: 'Class not found.'
            });
        }

        let subject = await Subject.findOne({
            schoolId,
            name: new RegExp(`^${escapeRegex(subjectName)}$`, 'i')
        });

        if (!subject) {
            subject = await Subject.create({
                name: subjectName,
                schoolId
            });
        }

        const alreadyAssigned = (cls.subjects || []).some(item => {
            const subjectId =
                item?.subject?._id ||
                item?.subject ||
                item?._id ||
                item;

            return String(subjectId) === String(subject._id);
        });

        if (!alreadyAssigned) {
            cls.subjects.push({
                subject: subject._id
            });

            await cls.save();
        }

        await populateClass(cls);

        res.json({
            success: true,
            ...formatClass(cls)
        });

    } catch (err) {
        console.error('Error adding subject:', err);

        if (err.code === 11000) {
            return res.status(409).json({
                error: 'A subject with this name already exists in this school.'
            });
        }

        res.status(500).json({
            error: err.message
        });
    }
});


/* =========================================================
   POST /api/classes/:classId/subjects/teacher
   Teacher assigns a subject to the class
========================================================= */

router.post('/:classId/subjects/teacher', teacherAuth, async (req, res) => {
    try {
        const { classId } = req.params;
        const subjectName = normalizeName(req.body.subjectName);
        const schoolId = getTeacherSchoolId(req);

        if (!validId(classId)) {
            return res.status(400).json({
                error: 'Invalid class ID.'
            });
        }

        if (!subjectName) {
            return res.status(400).json({
                error: 'Subject name required.'
            });
        }

        const teacher = await Staff.findOne({
            _id: req.staff._id,
            schoolId,
            access_level: 'Teacher'
        });

        if (!teacher) {
            return res.status(403).json({
                error: 'Teacher not found in this school.'
            });
        }

        const cls = await Class.findOne({
            _id: classId,
            schoolId
        });

        if (!cls) {
            return res.status(404).json({
                error: 'Class not found in this school.'
            });
        }

        let subject = await Subject.findOne({
            schoolId,
            name: new RegExp(`^${escapeRegex(subjectName)}$`, 'i')
        });

        if (!subject) {
            subject = await Subject.create({
                name: subjectName,
                schoolId
            });
        }

        const existingAssignment = (cls.subjects || []).find(item => {
            const subjectId =
                item?.subject?._id ||
                item?.subject ||
                item?._id ||
                item;

            const assignedTeacherId =
                item?.teacher?._id ||
                item?.teacher;

            return (
                String(subjectId) === String(subject._id) &&
                assignedTeacherId &&
                String(assignedTeacherId) === String(teacher._id)
            );
        });

        if (!existingAssignment) {
            const existingSubjectEntry = (cls.subjects || []).find(item => {
                const subjectId =
                    item?.subject?._id ||
                    item?.subject ||
                    item?._id ||
                    item;

                return String(subjectId) === String(subject._id);
            });

            if (existingSubjectEntry) {
                existingSubjectEntry.teacher = teacher._id;
            } else {
                cls.subjects.push({
                    subject: subject._id,
                    teacher: teacher._id
                });
            }

            await cls.save();
        }

        await populateClass(cls);

        const added = (cls.subjects || []).find(item => {
            const subjectId =
                item?.subject?._id ||
                item?.subject;

            const teacherId =
                item?.teacher?._id ||
                item?.teacher;

            return (
                String(subjectId) === String(subject._id) &&
                teacherId &&
                String(teacherId) === String(teacher._id)
            );
        });

        res.json({
            success: true,
            subject: added?.subject
                ? {
                    _id: added.subject._id,
                    id: added.subject._id,
                    name: added.subject.name,
                    teacher: added.teacher
                        ? {
                            _id: added.teacher._id,
                            id: added.teacher._id,
                            name: `${added.teacher.first_name || ''} ${added.teacher.last_name || ''}`.trim(),
                            email: added.teacher.email || ''
                        }
                        : null
                }
                : null
        });

    } catch (err) {
        console.error('Error adding subject as teacher:', err);

        if (err.code === 11000) {
            return res.status(409).json({
                error: 'A subject with this name already exists in this school.'
            });
        }

        res.status(500).json({
            error: err.message
        });
    }
});


/* =========================================================
   GET /api/classes/debug/all
========================================================= */

router.get('/debug/all', authMiddleware, async (req, res) => {
    try {
        if (!requireAdmin(req, res)) return;

        const schoolId = getAdminSchoolId(req);

        const classes = await Class.find({
            schoolId
        })
            .select('_id name schoolId')
            .sort({ name: 1 });

        res.json({
            count: classes.length,
            classes
        });

    } catch (err) {
        console.error('Error fetching debug classes:', err);

        res.status(500).json({
            error: err.message
        });
    }
});


module.exports = router;
