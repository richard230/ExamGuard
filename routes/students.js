const express = require('express');
const router = express.Router();
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const studentAuthMiddleware = require('../middleware/studentAuth');
const adminAuth = require('../middleware/adminAuth');
const Student = require('../models/Student'); // Mongoose model

// Multer setup for photo uploads (limit size to 2MB, accept only images/docs)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
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

// --- Joi validation schema for enrollment ---
const studentSchema = Joi.object({
  surname: Joi.string().required(),
  firstname: Joi.string().required(),
  dob: Joi.string().required(),
  gender: Joi.string().required(),
  scratchCard: Joi.string().length(8).alphanum().required(),
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

// --- Enroll a new student ---
router.post('/', upload.single('photo'), async (req, res) => {
  try {
    if (!req.body.scratchCard || req.body.scratchCard.length !== 8) {
      req.body.scratchCard = generateScratchCard();
    }
    if (req.body.regNo) delete req.body.regNo;

    const { error, value: data } = studentSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const year = new Date().getFullYear();
    // Get highest regNo for this year
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

    // Ensure regNo and student_id are unique
    if (await Student.exists({ regNo })) {
      return res.status(400).json({ error: 'A student with that registration number already exists. Please try again.' });
    }

    // Ensure scratchCard is unique
    let scratchCard = data.scratchCard;
    let tries = 0;
    while (await Student.exists({ scratchCard }) && tries < 5) {
      scratchCard = generateScratchCard();
      tries++;
    }
    if (tries === 5 && await Student.exists({ scratchCard })) {
      return res.status(400).json({ error: 'Could not generate a unique scratch card. Please try again.' });
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
      academic: [],
      attendance: [],
      guardians: [],
      hostel: {},
      transport: {},
      fees: [],
      docs: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await Student.create(studentDoc);
    res.status(201).json({ message: 'Student enrolled successfully!', regNo });
  } catch (error) {
    console.error('[ENROLL ERROR]', error);
    res.status(500).json({ error: error.message || 'Unknown server error.' });
  }
});
// --- Get logged-in student's hostel info ---
router.get('/me/hostel', studentAuthMiddleware, async (req, res) => {
  try {
    const student = req.student;
    res.json(student.hostel || {});
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// PATCH /api/students/:studentId/promote
router.patch('/:studentId/promote', async (req, res) => {
  try {
    const { action } = req.body; // 'promote', 'demote', 'graduate'
    const studentId = req.params.studentId;
    let student = await Student.findOne({ student_id: studentId }) || await Student.findOne({ regNo: studentId });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Classes order - update this list as per your school's structure
    const classesOrder = ["Creche", "Nursery 1", "Nursery 2", "Nursery 3", "Primary 1", "Primary 2","Primary 3", "Primary 4", "Primary 5", "JSS1", "JSS2", "JSS3", "SSS1", "SSS2", "SSS3"];
    let newStatus;

    if (action === 'promote') {
      // Find current class index
      let idx = classesOrder.indexOf(student.class);
      if (idx >= 0 && idx < classesOrder.length - 1) {
        student.class = classesOrder[idx + 1]; // Move to next class
        newStatus = 'Promoted';
      } else if (idx === classesOrder.length - 1) {
        // Last class, promote means graduate
        newStatus = 'Graduated';
      } else {
        return res.status(400).json({ error: 'Cannot promote: class not recognized.' });
      }
    } else if (action === 'demote') {
      let idx = classesOrder.indexOf(student.class);
      if (idx > 0) {
        student.class = classesOrder[idx - 1]; // Move to previous class
        newStatus = 'Pending';
      } else if (idx === 0) {
        // Already at lowest, can't demote further
        newStatus = 'Pending';
      } else {
        return res.status(400).json({ error: 'Cannot demote: class not recognized.' });
      }
    } else if (action === 'graduate') {
      newStatus = 'Graduated';
      // Optionally set class to null or a graduated value
      student.class = "Graduated";
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    student.status = newStatus;
    await student.save();
    res.json({ message: `Student ${action}d successfully!`, status: newStatus, class: student.class });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Optionally for bulk actions
router.patch('/bulk/promote', async (req, res) => {
  try {
    const { studentIds, action } = req.body; // array of ids, action
    if (!Array.isArray(studentIds) || !action) return res.status(400).json({ error: 'studentIds and action required' });

    // Classes order - update this list as per your school's structure
    const classesOrder = ["JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3"];
    let newStatus;

    let bulkUpdates = [];
    for (const studentId of studentIds) {
      let student = await Student.findOne({ student_id: studentId }) || await Student.findOne({ regNo: studentId });
      if (!student) continue;
      if (action === 'promote') {
        let idx = classesOrder.indexOf(student.class);
        if (idx >= 0 && idx < classesOrder.length - 1) {
          student.class = classesOrder[idx + 1];
          newStatus = 'Promoted';
        } else if (idx === classesOrder.length - 1) {
          newStatus = 'Graduated';
        } else {
          continue;
        }
      } else if (action === 'demote') {
        let idx = classesOrder.indexOf(student.class);
        if (idx > 0) {
          student.class = classesOrder[idx - 1];
          newStatus = 'Pending';
        } else if (idx === 0) {
          newStatus = 'Pending';
        } else {
          continue;
        }
      } else if (action === 'graduate') {
        newStatus = 'Graduated';
        student.class = "Graduated";
      } else {
        continue;
      }
      student.status = newStatus;
      await student.save();
      bulkUpdates.push(student.student_id);
    }

    res.json({ message: `Bulk ${action} completed!`, updatedCount: bulkUpdates.length, updated: bulkUpdates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// --- Get students (with filtering, pagination) ---
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
    }

    let students;
    if (directLookup) {
      students = await Student.find(query).limit(1);
    } else {
      const pageSize = parseInt(req.query.pageSize) || 20000;
      const sort = { surname: 1 };
      if (req.query.startAfter) {
        students = await Student.find({ ...query, surname: { $gt: req.query.startAfter } }).sort(sort).limit(pageSize);
      } else {
        students = await Student.find(query).sort(sort).limit(pageSize);
      }
    }

    res.json({
      students: students.map(d => ({
        student_id: d.student_id,
        surname: d.surname,
        firstname: d.firstname,
        othernames: d.othernames || '',
        regNo: d.regNo,
        scratchCard: d.scratchCard,
        class: d.class,
        classArm: d.classArm,
        gender: d.gender,
        dob: d.dob,
        parentName: d.parentName,
        parentPhone: d.parentPhone,
        parentRelationship: d.parentRelationship,
        parentEmail: d.parentEmail,
        parentAddress: d.parentAddress,
        parentOccupation: d.parentOccupation,
        studentEmail: d.studentEmail,
        studentPhone: d.studentPhone,
        nationality: d.nationality,
        state: d.state,
        lga: d.lga,
        previousSchool: d.previousSchool,
        admissionDate: d.admissionDate,
        academicSession: d.academicSession,
        photoBase64: d.photoBase64 || '',
      })),
      lastVisible: students.length ? students[students.length - 1].surname : null
    });
  } catch (error) {
    console.error('[GET STUDENTS ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Get logged-in student profile ---
router.get('/me', studentAuthMiddleware, async (req, res) => {
  const student = req.student;
  const { password, ...safeProfile } = student.toObject ? student.toObject() : student;
  res.json({
    ...safeProfile,
    name: `${student.firstname} ${student.surname}`,
    photo_url: student.photoBase64 || ''
  });
});
// GET /api/alumni - Return only alumni (students with status and class as Graduated)
router.get('/alumni', async (req, res) => {
  try {
    let query = { status: "Pending", class: "Graduated" };
    if (req.query.year) query.graduationYear = req.query.year;
    if (req.query.search) {
      const search = req.query.search.trim();
      query.$or = [
        { surname: { $regex: search, $options: "i" } },
        { firstname: { $regex: search, $options: "i" } },
        { regNo: { $regex: search, $options: "i" } }
      ];
    }
    const alumni = await Student.find(query).sort({ graduationYear: -1, surname: 1 });
    res.json({
      students: alumni.map(stu => ({
        student_id: stu.student_id,
        regNo: stu.regNo,
        firstname: stu.firstname,
        surname: stu.surname,
        name: `${stu.firstname} ${stu.surname}`,
        class: stu.class,
        graduationYear: stu.graduationYear || stu.academicSession,
        achievement: stu.achievement || "",
        remark: stu.remark || "",
        report: stu.report || "",
        photoBase64: stu.photoBase64 || "",
        photo_url: stu.photo_url || "",
        academicSession: stu.academicSession || ""
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// GET /api/alumni - Get only graduated students
router.get('/mni', async (req, res) => {
  try {
    const { search, graduationYear } = req.query;
    let query = { status: "Graduated" };
    if (search) {
      query.$or = [
        { surname: { $regex: search, $options: "i" } },
        { firstname: { $regex: search, $options: "i" } },
        { regNo: { $regex: search, $options: "i" } }
      ];
    }
    if (graduationYear) query.academicSession = graduationYear;

    const students = await Student.find(query).sort({ academicSession: -1, surname: 1 });
    res.json({
      students: students.map(d => ({
        student_id: d.student_id,
        regNo: d.regNo,
        surname: d.surname,
        firstname: d.firstname,
        othernames: d.othernames || '',
        class: d.class,
        academicSession: d.academicSession,
        graduationYear: d.academicSession,
        achievement: d.achievement || '',
        remark: d.remark || '',
        report: d.report || '',
        photoBase64: d.photoBase64 || '',
        photo_url: d.photoBase64 || '',
        status: d.status
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// --- Get a student profile by regNo (admin only) ---
router.get('/:regNo', adminAuth, async (req, res) => {
  try {
    const regNo = req.params.regNo;
    const profile = await Student.findOne({ regNo });
    if (!profile) return res.status(404).json({ error: 'Student not found' });

    const { password, ...safeProfile } = profile.toObject();
    res.json(safeProfile);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Student login ---
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
      user: {
        id: student._id,
        name: `${student.firstname} ${student.surname}`,
        regNo: student.regNo,
        role: 'student',
        class: student.class,
        photo_url: student.photoBase64 || ''
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// --- Update student profile (student only) ---
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

// --- Change password (student only) ---
router.post('/change-password', studentAuthMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword)
    return res.status(400).json({ error: 'Old and new password are required.' });
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

// --- Upload a document for a student (student only) ---
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

// --- Update academic record for a student (admin only) ---
router.post('/:regNo/academic', adminAuth, async (req, res) => {
  try {
    const regNo = req.params.regNo;
    const academicEntry = req.body;
    if (!academicEntry.session || !academicEntry.term || !academicEntry.class || !academicEntry.subject) {
      return res.status(400).json({ error: 'Missing required academic fields.' });
    }

    await Student.updateOne(
      { regNo },
      { $push: { academic: academicEntry }, $set: { updatedAt: new Date() } }
    );

    const student = await Student.findOne({ regNo });
    res.json({ message: 'Academic record updated!', academic: student.academic });
  } catch (err) {
    console.error('[ACADEMIC UPDATE ERROR]', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// --- Add attendance record (admin only) ---
router.post('/:regNo/attendance', adminAuth, async (req, res) => {
  try {
    const regNo = req.params.regNo;
    const attendanceEntry = req.body;
    if (!attendanceEntry.session || !attendanceEntry.term || !attendanceEntry.present || !attendanceEntry.total) {
      return res.status(400).json({ error: 'Missing required attendance fields.' });
    }

    await Student.updateOne(
      { regNo },
      { $push: { attendance: attendanceEntry }, $set: { updatedAt: new Date() } }
    );

    const student = await Student.findOne({ regNo });
    res.json({ message: 'Attendance record updated!', attendance: student.attendance });
  } catch (err) {
    console.error('[ATTENDANCE UPDATE ERROR]', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// --- Add/update guardian info (student only) ---
router.post('/me/guardians', studentAuthMiddleware, async (req, res) => {
  try {
    const student = req.student;
    const guardians = req.body.guardians;
    if (!Array.isArray(guardians)) return res.status(400).json({ error: 'Guardians must be array.' });

    await Student.updateOne({ regNo: student.regNo }, { $set: { guardians: guardians, updatedAt: new Date() } });

    res.json({ message: 'Guardians info updated!' });
  } catch (err) {
    console.error('[GUARDIAN UPDATE ERROR]', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// --- Add/update hostel info (student only) ---
router.post('/me/hostel', studentAuthMiddleware, async (req, res) => {
  try {
    const student = req.student;
    const hostel = req.body.hostel;
    if (typeof hostel !== 'object') return res.status(400).json({ error: 'Hostel must be an object.' });

    await Student.updateOne({ regNo: student.regNo }, { $set: { hostel: hostel, updatedAt: new Date() } });

    res.json({ message: 'Hostel info updated!' });
  } catch (err) {
    console.error('[HOSTEL UPDATE ERROR]', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// --- Add/update transport info (student only) ---
router.post('/me/transport', studentAuthMiddleware, async (req, res) => {
  try {
    const student = req.student;
    const transport = req.body.transport;
    if (typeof transport !== 'object') return res.status(400).json({ error: 'Transport must be an object.' });

    await Student.updateOne({ regNo: student.regNo }, { $set: { transport: transport, updatedAt: new Date() } });

    res.json({ message: 'Transport info updated!' });
  } catch (err) {
    console.error('[TRANSPORT UPDATE ERROR]', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// --- Add/update fees info (admin only) ---
router.post('/:regNo/fees', adminAuth, async (req, res) => {
  try {
    const regNo = req.params.regNo;
    const feeEntry = req.body;
    if (!feeEntry.session || !feeEntry.term || !feeEntry.type || !feeEntry.amount || !feeEntry.status) {
      return res.status(400).json({ error: 'Missing required fee fields.' });
    }

    await Student.updateOne(
      { regNo },
      { $push: { fees: feeEntry }, $set: { updatedAt: new Date() } }
    );

    const student = await Student.findOne({ regNo });
    res.json({ message: 'Fee record updated!', fees: student.fees });
  } catch (err) {
    console.error('[FEES UPDATE ERROR]', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// Add or update skills & reports for a student (admin only)
router.post('/:regNo/skills-report', async (req, res) => {
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
    if (idx >= 0) skillsReports[idx] = reportEntry;
    else skillsReports.push(reportEntry);

    await Student.updateOne({ regNo }, { $set: { skillsReports, updatedAt: new Date() } });

    res.json({ message: 'Skills report saved!', skillsReports });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// Get all skills & reports for a student (admin or student)
router.get('/:regNo/skills-report', async (req, res) => {
  try {
    const regNo = req.params.regNo;
    const student = await Student.findOne({ regNo });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    res.json({ skillsReports: student.skillsReports || [] });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// --- Update student by student_id or regNo (admin only) ---
router.put('/:studentId', upload.single('photo'), async (req, res) => {
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
    res.json({ message: "Student updated successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unknown server error." });
  }
});

// --- DELETE student by student_id or regNo (NO AUTH) ---
router.delete('/:studentId', async (req, res) => {
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
