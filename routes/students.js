const express = require('express');
const router = express.Router();
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const studentAuthMiddleware = require('../middleware/studentAuth');
const adminAuth = require('../middleware/adminAuth');
const { authenticate, authorize } = require('../middleware/auth');
const Student = require('../models/Student');

// Multer setup for photo uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype.startsWith('image/') ||
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'application/msword' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only images and documents (PDF/DOC/DOCX) are allowed.'));
    }
  }
});

// Utility: generate student_id
function generateStudentId() {
  return 'STU' + Math.floor(100000 + Math.random() * 900000);
}

// Utility: generate 8-character alphanumeric scratch card
function generateScratchCard() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let card = '';
  for (let i = 0; i < 8; i++) {
    card += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return card;
}

// Helper function to format student data with both naming conventions
function formatStudentData(student) {
  const fullName = `${student.firstname || ''} ${student.surname || ''}`.trim();
  
  return {
    _id: student._id,
    student_id: student.student_id,
    // Both naming conventions
    firstName: student.firstname || '',
    firstname: student.firstname || '',
    lastName: student.surname || '',
    surname: student.surname || '',
    name: fullName,
    fullName: fullName,
    // Registration
    regNo: student.regNo,
    admissionNo: student.regNo,
    scratchCard: student.scratchCard,
    // Class info
    className: student.class || '',
    class: student.class || '',
    classArm: student.classArm || '',
    // Personal info
    gender: student.gender || '',
    dob: student.dob || '',
    dateOfBirth: student.dob || '',
    othernames: student.othernames || '',
    nationality: student.nationality || '',
    state: student.state || '',
    lga: student.lga || '',
    address: student.address || '',
    religion: student.religion || '',
    bloodGroup: student.bloodGroup || '',
    genotype: student.genotype || '',
    medical: student.medical || '',
    // Contact info
    email: student.studentEmail || '',
    studentEmail: student.studentEmail || '',
    phone: student.studentPhone || '',
    studentPhone: student.studentPhone || '',
    // Parent info
    parentName: student.parentName || '',
    parentPhone: student.parentPhone || '',
    parentRelationship: student.parentRelationship || '',
    parentEmail: student.parentEmail || '',
    parentAddress: student.parentAddress || '',
    parentOccupation: student.parentOccupation || '',
    // School info
    previousSchool: student.previousSchool || '',
    admissionDate: student.admissionDate || '',
    academicSession: student.academicSession || '',
    // Photo
    photoBase64: student.photoBase64 || '',
    profilePhoto: student.photoBase64 || '',
    // Status
    status: student.status || 'active',
    // Timestamps
    createdAt: student.createdAt,
    updatedAt: student.updatedAt
  };
}

// Joi validation schema for enrollment
const studentSchema = Joi.object({
  surname: Joi.string().required(),
  firstname: Joi.string().required(),
  dob: Joi.string().required(),
  gender: Joi.string().required(),
  scratchCard: Joi.string().length(8).alphanum().allow(''),
  class: Joi.string().required(),
  parentName: Joi.string().required(),
  parentRelationship: Joi.string().required(),
  parentPhone: Joi.string().required(),
  password: Joi.string().min(6).required(),
  othernames: Joi.string().allow(''),
  nationality: Joi.string().allow(''),
  state: Joi.string().allow(''),
  lga: Joi.string().allow(''),
  address: Joi.string().allow(''),
  classArm: Joi.string().allow(''),
  previousSchool: Joi.string().allow(''),
  admissionDate: Joi.string().allow(''),
  academicSession: Joi.string().allow(''),
  parentEmail: Joi.string().allow(''),
  parentAddress: Joi.string().allow(''),
  parentOccupation: Joi.string().allow(''),
  studentEmail: Joi.string().allow(''),
  studentPhone: Joi.string().allow(''),
  religion: Joi.string().allow(''),
  bloodGroup: Joi.string().allow(''),
  genotype: Joi.string().allow(''),
  medical: Joi.string().allow('')
});

// Joi validation schema for updates
const updateSchema = Joi.object({
  surname: Joi.string(),
  firstname: Joi.string(),
  othernames: Joi.string().allow(''),
  dob: Joi.string(),
  gender: Joi.string(),
  nationality: Joi.string().allow(''),
  state: Joi.string().allow(''),
  lga: Joi.string().allow(''),
  address: Joi.string().allow(''),
  class: Joi.string(),
  classArm: Joi.string().allow(''),
  studentEmail: Joi.string().allow(''),
  studentPhone: Joi.string().allow(''),
  religion: Joi.string().allow(''),
  bloodGroup: Joi.string().allow(''),
  genotype: Joi.string().allow(''),
  medical: Joi.string().allow('')
});

/**
 * POST /api/students
 * Enroll a new student
 */
router.post('/', upload.single('photo'), async (req, res) => {
  try {
    if (!req.body.scratchCard || req.body.scratchCard.length !== 8) {
      req.body.scratchCard = generateScratchCard();
    }
    if (req.body.regNo) delete req.body.regNo;

    const { error, value: data } = studentSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const year = new Date().getFullYear();
    const lastStudent = await Student.findOne({ regNo: { $regex: `^${year}/` } })
      .sort({ regNo: -1 })
      .exec();

    let nextSerial = 1;
    if (lastStudent && lastStudent.regNo) {
      const parts = lastStudent.regNo.split('/');
      if (parts.length === 2) {
        nextSerial = parseInt(parts[1], 10) + 1;
      }
    }
    const regNo = `${year}/${String(nextSerial).padStart(4, '0')}`;

    if (await Student.exists({ regNo })) {
      return res.status(400).json({ error: 'A student with that registration number already exists.' });
    }

    let scratchCard = data.scratchCard;
    let tries = 0;
    while (await Student.exists({ scratchCard }) && tries < 5) {
      scratchCard = generateScratchCard();
      tries++;
    }
    if (tries === 5 && await Student.exists({ scratchCard })) {
      return res.status(400).json({ error: 'Could not generate a unique scratch card.' });
    }

    let student_id = data.student_id || generateStudentId();
    if (await Student.exists({ student_id })) {
      return res.status(400).json({ error: 'A student with that student ID already exists.' });
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const admissionDate = data.admissionDate ? new Date(data.admissionDate) : undefined;

    let photoBase64 = '';
    if (req.file) {
      photoBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    const studentDoc = {
      student_id,
      surname: data.surname,
      firstname: data.firstname,
      othernames: data.othernames || '',
      dob: data.dob,
      gender: data.gender,
      nationality: data.nationality || '',
      state: data.state || '',
      lga: data.lga || '',
      address: data.address || '',
      photoBase64: photoBase64,
      regNo,
      scratchCard,
      class: data.class,
      classArm: data.classArm || '',
      previousSchool: data.previousSchool || '',
      admissionDate: admissionDate || null,
      academicSession: data.academicSession || '',
      parentName: data.parentName,
      parentRelationship: data.parentRelationship,
      parentPhone: data.parentPhone,
      parentEmail: data.parentEmail || '',
      parentAddress: data.parentAddress || '',
      parentOccupation: data.parentOccupation || '',
      studentEmail: data.studentEmail || '',
      studentPhone: data.studentPhone || '',
      religion: data.religion || '',
      bloodGroup: data.bloodGroup || '',
      genotype: data.genotype || '',
      medical: data.medical || '',
      password: hashedPassword,
      status: 'active',
      academic: [],
      attendance: [],
      guardians: [],
      hostel: {},
      transport: {},
      fees: [],
      docs: [],
      skillsReports: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const createdStudent = await Student.create(studentDoc);
    res.status(201).json({
      message: 'Student enrolled successfully!',
      regNo,
      student: formatStudentData(createdStudent)
    });
  } catch (error) {
    console.error('[ENROLL ERROR]', error);
    res.status(500).json({ error: error.message || 'Unknown server error.' });
  }
});

/**
 * GET /api/students
 * Get students with filtering and pagination
 */
router.get('/', async (req, res) => {
  try {
    let query = {};
    let directLookup = false;

    if (req.query.student_id) {
      query.student_id = String(req.query.student_id);
      directLookup = true;
    } else if (req.query.regNo) {
      query.regNo = String(req.query.regNo);
      directLookup = true;
    } else {
      if (req.query.class) query.class = req.query.class;
      if (req.query.classArm) query.classArm = req.query.classArm;
      if (req.query.academicSession) query.academicSession = req.query.academicSession;
      if (req.query.search) {
        const search = req.query.search.trim();
        query.$or = [
          { firstname: { $regex: search, $options: 'i' } },
          { surname: { $regex: search, $options: 'i' } },
          { regNo: { $regex: search, $options: 'i' } },
          { studentEmail: { $regex: search, $options: 'i' } }
        ];
      }
    }

    let students;
    if (directLookup) {
      students = await Student.find(query).limit(1);
    } else {
      const pageSize = parseInt(req.query.pageSize) || 100;
      const page = parseInt(req.query.page) || 1;
      const skip = (page - 1) * pageSize;
      const sort = { surname: 1, firstname: 1 };

      students = await Student.find(query)
        .sort(sort)
        .skip(skip)
        .limit(pageSize);
    }

    const total = await Student.countDocuments(query);

    res.json({
      data: students.map(formatStudentData),
      total,
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 100
    });
  } catch (error) {
    console.error('[GET STUDENTS ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/students/:id
 * Get student by ID
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    let student = await Student.findById(req.params.id);
    
    if (!student) {
      student = await Student.findOne({ 
        $or: [
          { student_id: req.params.id },
          { regNo: req.params.id }
        ]
      });
    }

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json(formatStudentData(student));
  } catch (error) {
    console.error('[GET STUDENT ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/students/:id/grades
 * Get student grades
 */
router.get('/:id/grades', authenticate, async (req, res) => {
  try {
    let student = await Student.findById(req.params.id);
    
    if (!student) {
      student = await Student.findOne({
        $or: [
          { student_id: req.params.id },
          { regNo: req.params.id }
        ]
      });
    }

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json(student.academic || []);
  } catch (error) {
    console.error('[GET GRADES ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/students/:id/attendance
 * Get student attendance
 */
router.get('/:id/attendance', authenticate, async (req, res) => {
  try {
    let student = await Student.findById(req.params.id);
    
    if (!student) {
      student = await Student.findOne({
        $or: [
          { student_id: req.params.id },
          { regNo: req.params.id }
        ]
      });
    }

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const attendance = student.attendance || [];
    
    // Calculate summary
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalLate = 0;

    attendance.forEach(record => {
      totalPresent += record.present || 0;
      totalAbsent += record.absent || 0;
      totalLate += record.late || 0;
    });

    res.json({
      present: totalPresent,
      absent: totalAbsent,
      late: totalLate,
      records: attendance
    });
  } catch (error) {
    console.error('[GET ATTENDANCE ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/students/:id/fees
 * Get student fees
 */
router.get('/:id/fees', authenticate, async (req, res) => {
  try {
    let student = await Student.findById(req.params.id);
    
    if (!student) {
      student = await Student.findOne({
        $or: [
          { student_id: req.params.id },
          { regNo: req.params.id }
        ]
      });
    }

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json(student.fees || []);
  } catch (error) {
    console.error('[GET FEES ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/students/me/profile
 * Get logged-in student profile
 */
router.get('/me/profile', studentAuthMiddleware, async (req, res) => {
  try {
    const student = req.student;
    res.json(formatStudentData(student));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/students/me/hostel
 * Get logged-in student's hostel info
 */
router.get('/me/hostel', studentAuthMiddleware, async (req, res) => {
  try {
    const student = req.student;
    res.json(student.hostel || {});
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

/**
 * GET /api/students/alumni
 * Get all alumni (graduated students)
 */
router.get('/alumni/list', async (req, res) => {
  try {
    let query = { status: "Graduated", class: "Graduated" };
    
    if (req.query.year) {
      query.academicSession = req.query.year;
    }
    
    if (req.query.search) {
      const search = req.query.search.trim();
      query.$or = [
        { surname: { $regex: search, $options: "i" } },
        { firstname: { $regex: search, $options: "i" } },
        { regNo: { $regex: search, $options: "i" } }
      ];
    }

    const students = await Student.find(query).sort({ academicSession: -1, surname: 1 });

    res.json({
      data: students.map(formatStudentData),
      total: students.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/students/:studentId/promote
 * Promote or demote student
 */
router.patch('/:studentId/promote', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { action } = req.body;
    const studentId = req.params.studentId;
    
    let student = await Student.findOne({ student_id: studentId });
    if (!student) {
      student = await Student.findOne({ regNo: studentId });
    }
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const classesOrder = ["Creche", "Nursery 1", "Nursery 2", "Nursery 3", "Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "JSS1", "JSS2", "JSS3", "SSS1", "SSS2", "SSS3"];
    let newStatus;

    if (action === 'promote') {
      let idx = classesOrder.indexOf(student.class);
      if (idx >= 0 && idx < classesOrder.length - 1) {
        student.class = classesOrder[idx + 1];
        newStatus = 'Promoted';
      } else if (idx === classesOrder.length - 1) {
        student.status = 'Graduated';
        student.class = "Graduated";
        newStatus = 'Graduated';
      } else {
        return res.status(400).json({ error: 'Cannot promote: class not recognized.' });
      }
    } else if (action === 'demote') {
      let idx = classesOrder.indexOf(student.class);
      if (idx > 0) {
        student.class = classesOrder[idx - 1];
        newStatus = 'Demoted';
      } else {
        return res.status(400).json({ error: 'Cannot demote: student already in lowest class.' });
      }
    } else if (action === 'graduate') {
      student.status = 'Graduated';
      student.class = "Graduated";
      newStatus = 'Graduated';
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    await student.save();
    res.json({
      message: `Student ${action}d successfully!`,
      status: newStatus,
      class: student.class,
      student: formatStudentData(student)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/students/bulk/promote
 * Bulk promote or demote students
 */
router.patch('/bulk/promote', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { studentIds, action } = req.body;
    
    if (!Array.isArray(studentIds) || !action) {
      return res.status(400).json({ error: 'studentIds and action required' });
    }

    const classesOrder = ["Creche", "Nursery 1", "Nursery 2", "Nursery 3", "Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "JSS1", "JSS2", "JSS3", "SSS1", "SSS2", "SSS3"];
    let bulkUpdates = [];

    for (const studentId of studentIds) {
      let student = await Student.findOne({ student_id: studentId });
      if (!student) {
        student = await Student.findOne({ regNo: studentId });
      }
      if (!student) continue;

      let newStatus;

      if (action === 'promote') {
        let idx = classesOrder.indexOf(student.class);
        if (idx >= 0 && idx < classesOrder.length - 1) {
          student.class = classesOrder[idx + 1];
          newStatus = 'Promoted';
        } else if (idx === classesOrder.length - 1) {
          student.status = 'Graduated';
          student.class = "Graduated";
          newStatus = 'Graduated';
        } else {
          continue;
        }
      } else if (action === 'demote') {
        let idx = classesOrder.indexOf(student.class);
        if (idx > 0) {
          student.class = classesOrder[idx - 1];
          newStatus = 'Demoted';
        } else {
          continue;
        }
      } else if (action === 'graduate') {
        student.status = 'Graduated';
        student.class = "Graduated";
        newStatus = 'Graduated';
      } else {
        continue;
      }

      student.status = newStatus;
      await student.save();
      bulkUpdates.push(student.student_id);
    }

    res.json({
      message: `Bulk ${action} completed!`,
      updatedCount: bulkUpdates.length,
      updated: bulkUpdates
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/students/:regNo/academic
 * Add academic record for a student
 */
router.post('/:regNo/academic', authenticate, authorize(['admin', 'teacher']), async (req, res) => {
  try {
    const regNo = req.params.regNo;
    const academicEntry = req.body;
    
    if (!academicEntry.subject || !academicEntry.ca1 === undefined || academicEntry.ca2 === undefined || academicEntry.exam === undefined) {
      return res.status(400).json({ error: 'Subject, CA1, CA2, and Exam scores are required.' });
    }

    await Student.updateOne(
      { regNo },
      { $push: { academic: academicEntry }, $set: { updatedAt: new Date() } }
    );

    const student = await Student.findOne({ regNo });
    res.json({
      message: 'Academic record updated!',
      academic: student.academic
    });
  } catch (err) {
    console.error('[ACADEMIC UPDATE ERROR]', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

/**
 * POST /api/students/:regNo/attendance
 * Add attendance record
 */
router.post('/:regNo/attendance', authenticate, authorize(['admin', 'teacher']), async (req, res) => {
  try {
    const regNo = req.params.regNo;
    const attendanceEntry = req.body;
    
    if (attendanceEntry.present === undefined || attendanceEntry.absent === undefined || attendanceEntry.late === undefined) {
      return res.status(400).json({ error: 'Present, absent, and late counts are required.' });
    }

    await Student.updateOne(
      { regNo },
      { $push: { attendance: attendanceEntry }, $set: { updatedAt: new Date() } }
    );

    const student = await Student.findOne({ regNo });
    res.json({
      message: 'Attendance record updated!',
      attendance: student.attendance
    });
  } catch (err) {
    console.error('[ATTENDANCE UPDATE ERROR]', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

/**
 * POST /api/students/:regNo/fees
 * Add fee record
 */
router.post('/:regNo/fees', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const regNo = req.params.regNo;
    const feeEntry = req.body;
    
    if (!feeEntry.description || feeEntry.amount === undefined) {
      return res.status(400).json({ error: 'Description and amount are required.' });
    }

    const feeData = {
      description: feeEntry.description,
      amount: feeEntry.amount,
      amountPaid: feeEntry.amountPaid || 0,
      status: feeEntry.status || 'unpaid',
      dueDate: feeEntry.dueDate || new Date(),
      createdAt: new Date()
    };

    await Student.updateOne(
      { regNo },
      { $push: { fees: feeData }, $set: { updatedAt: new Date() } }
    );

    const student = await Student.findOne({ regNo });
    res.json({
      message: 'Fee record updated!',
      fees: student.fees
    });
  } catch (err) {
    console.error('[FEES UPDATE ERROR]', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

/**
 * POST /api/students/:regNo/skills-report
 * Add or update skills report
 */
router.post('/:regNo/skills-report', authenticate, authorize(['admin', 'teacher']), async (req, res) => {
  try {
    const regNo = req.params.regNo;
    const { session, term, skills, attendance, comment } = req.body;
    
    if (!session || !term || !skills) {
      return res.status(400).json({ error: 'session, term, and skills are required.' });
    }

    const student = await Student.findOne({ regNo });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const reportEntry = {
      session,
      term,
      skills,
      attendance,
      comment,
      updatedAt: new Date()
    };

    let skillsReports = student.skillsReports || [];
    const idx = skillsReports.findIndex(r => r.session === session && r.term === term);
    if (idx >= 0) {
      skillsReports[idx] = reportEntry;
    } else {
      skillsReports.push(reportEntry);
    }

    await Student.updateOne({ regNo }, { $set: { skillsReports, updatedAt: new Date() } });

    res.json({
      message: 'Skills report saved!',
      skillsReports
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

/**
 * GET /api/students/:regNo/skills-report
 * Get skills report for a student
 */
router.get('/:regNo/skills-report', authenticate, async (req, res) => {
  try {
    const regNo = req.params.regNo;
    const student = await Student.findOne({ regNo });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    res.json({ skillsReports: student.skillsReports || [] });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

/**
 * POST /api/students/me/guardians
 * Add or update guardian info (student only)
 */
router.post('/me/guardians', studentAuthMiddleware, async (req, res) => {
  try {
    const student = req.student;
    const guardians = req.body.guardians;
    
    if (!Array.isArray(guardians)) {
      return res.status(400).json({ error: 'Guardians must be array.' });
    }

    await Student.updateOne({ regNo: student.regNo }, { $set: { guardians: guardians, updatedAt: new Date() } });

    res.json({ message: 'Guardians info updated!' });
  } catch (err) {
    console.error('[GUARDIAN UPDATE ERROR]', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

/**
 * POST /api/students/me/hostel
 * Add or update hostel info (student only)
 */
router.post('/me/hostel', studentAuthMiddleware, async (req, res) => {
  try {
    const student = req.student;
    const hostel = req.body.hostel;
    
    if (typeof hostel !== 'object') {
      return res.status(400).json({ error: 'Hostel must be an object.' });
    }

    await Student.updateOne({ regNo: student.regNo }, { $set: { hostel: hostel, updatedAt: new Date() } });

    res.json({ message: 'Hostel info updated!' });
  } catch (err) {
    console.error('[HOSTEL UPDATE ERROR]', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

/**
 * POST /api/students/me/transport
 * Add or update transport info (student only)
 */
router.post('/me/transport', studentAuthMiddleware, async (req, res) => {
  try {
    const student = req.student;
    const transport = req.body.transport;
    
    if (typeof transport !== 'object') {
      return res.status(400).json({ error: 'Transport must be an object.' });
    }

    await Student.updateOne({ regNo: student.regNo }, { $set: { transport: transport, updatedAt: new Date() } });

    res.json({ message: 'Transport info updated!' });
  } catch (err) {
    console.error('[TRANSPORT UPDATE ERROR]', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

/**
 * POST /api/students/me/docs
 * Upload a document (student only)
 */
router.post('/me/docs', studentAuthMiddleware, upload.single('document'), async (req, res) => {
  try {
    const student = req.student;
    if (!req.file) return res.status(400).json({ error: 'No document uploaded.' });

    const docBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const docMeta = {
      label: req.body.label || req.file.originalname,
      value: req.file.originalname,
      base64: docBase64,
      uploadedAt: new Date()
    };

    await Student.updateOne(
      { regNo: student.regNo },
      { $push: { docs: docMeta }, $set: { updatedAt: new Date() } }
    );

    res.json({ message: 'Document uploaded successfully!', doc: docMeta });
  } catch (err) {
    console.error('[UPLOAD DOC ERROR]', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

/**
 * POST /api/students/login
 * Student login
 */
router.post('/login', async (req, res) => {
  const { regNo, studentEmail, password } = req.body;
  if ((!regNo && !studentEmail) || !password) {
    return res.status(400).json({ error: 'Registration number or email and password are required.' });
  }
  try {
    const query = regNo ? { regNo } : { studentEmail };
    const student = await Student.findOne(query);
    if (!student) return res.status(401).json({ error: 'Invalid credentials.' });

    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials.' });

    const token = jwt.sign(
      { id: student._id, regNo: student.regNo, role: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: formatStudentData(student)
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

/**
 * PUT /api/students/me
 * Update student profile (student only)
 */
router.put('/me', studentAuthMiddleware, upload.single('photo'), async (req, res) => {
  try {
    const { error, value: data } = updateSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const student = req.student;
    let updates = { ...data };

    if (req.file) {
      updates.photoBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    updates.updatedAt = new Date();

    await Student.updateOne({ regNo: student.regNo }, { $set: updates });

    res.json({ message: 'Profile updated successfully!' });
  } catch (err) {
    console.error('[UPDATE PROFILE ERROR]', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

/**
 * POST /api/students/me/change-password
 * Change password (student only)
 */
router.post('/me/change-password', studentAuthMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Old and new password are required.' });
  }
  try {
    const student = req.student;
    const isMatch = await bcrypt.compare(oldPassword, student.password);
    if (!isMatch) return res.status(400).json({ error: 'Old password incorrect.' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await Student.updateOne({ regNo: student.regNo }, { $set: { password: hashed, updatedAt: new Date() } });
    
    res.json({ message: 'Password changed successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

/**
 * PUT /api/students/:studentId
 * Update student profile (admin only)
 */
router.put('/:studentId', authenticate, authorize(['admin']), upload.single('photo'), async (req, res) => {
  try {
    const { studentId } = req.params;
    
    let student = await Student.findOne({ student_id: studentId });
    if (!student) {
      student = await Student.findOne({ regNo: studentId });
    }
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const allowedFields = [
      "surname", "firstname", "othernames", "dob", "gender", "nationality", "state", "lga", "address",
      "class", "classArm", "previousSchool", "admissionDate", "academicSession",
      "parentName", "parentRelationship", "parentPhone", "parentEmail", "parentAddress", "parentOccupation",
      "studentEmail", "studentPhone", "religion", "bloodGroup", "genotype", "medical"
    ];
    
    const updates = {};
    for (const key of allowedFields) {
      if (key in req.body) updates[key] = req.body[key];
    }

    if (req.file) {
      updates.photoBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }
    
    updates.updatedAt = new Date();

    await Student.updateOne({ _id: student._id }, { $set: updates });
    const updatedStudent = await Student.findById(student._id);
    
    res.json({
      message: "Student updated successfully!",
      student: formatStudentData(updatedStudent)
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unknown server error." });
  }
});

/**
 * DELETE /api/students/:studentId
 * Delete student (admin only)
 */
router.delete('/:studentId', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { studentId } = req.params;
    
    let student = await Student.findOne({ student_id: studentId });
    if (!student) {
      student = await Student.findOne({ regNo: studentId });
    }
    if (!student) return res.status(404).json({ error: 'Student not found' });
    
    await Student.deleteOne({ _id: student._id });
    res.json({ message: "Student deleted successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unknown server error." });
  }
});

module.exports = router;
