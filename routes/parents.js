// routes/parents.js

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Parent = require('../models/Parent');
const Student = require('../models/Student');

/**
 * Utility: Generate temporary password
 */
function generateTemporaryPassword() {
  const length = 12;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Utility: Resolve student_id → ObjectId
 */
async function resolveStudentObjectIds(studentIds) {
  if (!Array.isArray(studentIds) || studentIds.length === 0) return [];

  const students = await Student.find({
    student_id: { $in: studentIds }
  }).select('_id');

  return students.map(s => s._id);
}

/**
 * POST /parents/login
 * Parent login endpoint
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // ✅ IMPORTANT: Use .select('+password') to retrieve the hashed password
    const parent = await Parent.findOne({ email: email.toLowerCase() }).select('+password');

    if (!parent) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // ✅ Check if parent has a password set
    if (!parent.password) {
      return res.status(401).json({ 
        error: 'Account not activated. Please contact the school to set your password.' 
      });
    }

    // ✅ Compare passwords using bcrypt
    let isPasswordValid = false;
    try {
      isPasswordValid = await bcrypt.compare(password, parent.password);
    } catch (compareErr) {
      console.error('Bcrypt comparison error:', compareErr);
      return res.status(500).json({ error: 'Authentication system error' });
    }

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // ✅ Update last login
    parent.lastLogin = new Date();
    await parent.save();

    // ✅ Generate JWT token
    const token = jwt.sign(
      { _id: parent._id, email: parent.email, role: 'parent' },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    // ✅ Return safe parent data
    res.json({
      success: true,
      token,
      parent: {
        _id: parent._id,
        name: parent.name,
        email: parent.email,
        phone: parent.phone,
        address: parent.address,
        role: 'parent'
      }
    });

  } catch (error) {
    console.error('Parent login error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

/**
 * GET /parents/me - Get current logged-in parent with complete dashboard data
 */
router.get('/me', async (req, res) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // ✅ Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const parent = await Parent.findById(decoded._id)
      .populate({
        path: 'studentIds',
        select: `
          _id
          student_id
          firstname
          surname
          othernames
          class
          classArm
          regNo
          dob
          gender
          photoBase64
          academic
          attendance
          fees
          parentName
          parentEmail
          studentEmail
          studentPhone
        `,
      })
      .select('-password -temporaryPassword');

    if (!parent) {
      return res.status(404).json({ error: 'Parent not found' });
    }

    // ✅ Enhance response with computed data
    const parentData = parent.toObject();
    
    // Process students and add computed fields
    parentData.students = (parentData.studentIds || []).map(student => ({
      _id: student._id,
      student_id: student.student_id,
      name: `${student.firstname} ${student.surname}${student.othernames ? ' ' + student.othernames : ''}`.trim(),
      firstname: student.firstname,
      surname: student.surname,
      class: student.class,
      classArm: student.classArm,
      regNo: student.regNo,
      dob: student.dob,
      gender: student.gender,
      photoBase64: student.photoBase64,
      email: student.studentEmail || student.parentEmail,
      phone: student.studentPhone,
      
      // Academic Stats
      academicStats: {
        totalRecords: (student.academic || []).length,
        latestGrade: student.academic && student.academic.length > 0 
          ? student.academic[student.academic.length - 1].grade 
          : null,
        averageScore: calculateAverageScore(student.academic),
        subjects: extractSubjects(student.academic),
        byTerm: groupByTerm(student.academic)
      },
      
      // Attendance Stats
      attendanceStats: {
        totalRecords: (student.attendance || []).length,
        latestAttendance: student.attendance && student.attendance.length > 0
          ? student.attendance[student.attendance.length - 1]
          : null,
        averageAttendancePercentage: calculateAverageAttendance(student.attendance),
        byTerm: groupAttendanceByTerm(student.attendance)
      },
      
      // Fees Stats
      feesStats: {
        total: (student.fees || []).length,
        pending: (student.fees || []).filter(f => f.status === 'pending').length,
        paid: (student.fees || []).filter(f => f.status === 'paid').length,
        outstanding: calculateOutstandingFees(student.fees),
        byTerm: groupFeesByTerm(student.fees)
      }
    }));

    // Dashboard summary (aggregate across all children)
    parentData.dashboardSummary = {
      totalChildren: parentData.students.length,
      averageAttendance: calculateGlobalAttendance(parentData.students),
      averageGrade: calculateGlobalAverageGrade(parentData.students),
      pendingFeesTotal: parentData.students.reduce((sum, s) => sum + (s.feesStats?.outstanding || 0), 0),
      allStudentsPending: parentData.students.reduce((sum, s) => sum + (s.feesStats?.pending || 0), 0)
    };

    // Remove the old studentIds array
    delete parentData.studentIds;

    res.json(parentData);

  } catch (error) {
    console.error('Error getting parent:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /parents/me/students/:studentId/grades
 * Get detailed grades for a specific student
 */
router.get('/me/students/:studentId/grades', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const parent = await Parent.findById(decoded._id);
    if (!parent) {
      return res.status(404).json({ error: 'Parent not found' });
    }

    // Verify parent has access to this student
    if (!parent.studentIds.includes(req.params.studentId)) {
      return res.status(403).json({ error: 'Access denied to this student' });
    }

    const student = await Student.findById(req.params.studentId).select('academic firstname surname');
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const { term } = req.query; // Optional term filter

    let academicData = student.academic || [];

    // Filter by term if provided
    if (term) {
      academicData = academicData.filter(record => record.term === term);
    }

    // Group by subject and include all details
    const subjectGrades = {};
    academicData.forEach(record => {
      if (!subjectGrades[record.subject]) {
        subjectGrades[record.subject] = [];
      }
      subjectGrades[record.subject].push({
        session: record.session,
        term: record.term,
        score: record.score,
        grade: record.grade,
        remarks: record.remarks,
        date: record.date,
        class: record.class
      });
    });

    // Calculate statistics
    const stats = {
      totalSubjects: Object.keys(subjectGrades).length,
      averageScore: academicData.length > 0 
        ? (academicData.reduce((sum, r) => sum + (r.score || 0), 0) / academicData.length).toFixed(2)
        : 0,
      highestScore: academicData.length > 0 
        ? Math.max(...academicData.map(r => r.score || 0))
        : 0,
      lowestScore: academicData.length > 0 
        ? Math.min(...academicData.map(r => r.score || 0))
        : 0,
      gradeDistribution: {
        a: academicData.filter(r => r.grade === 'A').length,
        b: academicData.filter(r => r.grade === 'B').length,
        c: academicData.filter(r => r.grade === 'C').length,
        d: academicData.filter(r => r.grade === 'D').length,
        e: academicData.filter(r => r.grade === 'E').length,
        f: academicData.filter(r => r.grade === 'F').length
      }
    };

    res.json({
      student: {
        _id: student._id,
        name: `${student.firstname} ${student.surname}`,
        firstname: student.firstname,
        surname: student.surname
      },
      term: term || 'all',
      stats,
      subjectGrades,
      records: academicData,
      recordCount: academicData.length
    });

  } catch (error) {
    console.error('Error getting student grades:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /parents/me/students/:studentId/attendance
 * Get attendance records for a specific student
 */
router.get('/me/students/:studentId/attendance', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const parent = await Parent.findById(decoded._id);
    if (!parent) {
      return res.status(404).json({ error: 'Parent not found' });
    }

    if (!parent.studentIds.includes(req.params.studentId)) {
      return res.status(403).json({ error: 'Access denied to this student' });
    }

    const student = await Student.findById(req.params.studentId).select('attendance firstname surname');
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const attendanceData = student.attendance || [];

    // Group by term
    const byTerm = {};
    attendanceData.forEach(record => {
      if (!byTerm[record.term]) {
        byTerm[record.term] = [];
      }
      byTerm[record.term].push({
        session: record.session,
        term: record.term,
        present: record.present,
        total: record.total,
        percentage: record.total > 0 ? ((record.present / record.total) * 100).toFixed(2) : 0,
        date: record.date
      });
    });

    // Calculate overall statistics
    let totalPresent = 0, totalDays = 0;
    attendanceData.forEach(r => {
      totalPresent += r.present || 0;
      totalDays += r.total || 0;
    });

    res.json({
      student: {
        _id: student._id,
        name: `${student.firstname} ${student.surname}`,
        firstname: student.firstname,
        surname: student.surname
      },
      stats: {
        totalDays,
        totalPresent,
        overallPercentage: totalDays > 0 ? ((totalPresent / totalDays) * 100).toFixed(2) : 0,
        recordCount: attendanceData.length
      },
      byTerm,
      records: attendanceData
    });

  } catch (error) {
    console.error('Error getting student attendance:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /parents/me/students/:studentId/fees
 * Get fees information for a specific student
 */
router.get('/me/students/:studentId/fees', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const parent = await Parent.findById(decoded._id);
    if (!parent) {
      return res.status(404).json({ error: 'Parent not found' });
    }

    if (!parent.studentIds.includes(req.params.studentId)) {
      return res.status(403).json({ error: 'Access denied to this student' });
    }

    const student = await Student.findById(req.params.studentId).select('fees firstname surname');
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const feesData = student.fees || [];

    // Group by term and status
    const byTerm = {};
    let totalOutstanding = 0;

    feesData.forEach(record => {
      if (!byTerm[record.term]) {
        byTerm[record.term] = {
          paid: [],
          pending: [],
          total: 0,
          outstanding: 0
        };
      }

      const feeRecord = {
        session: record.session,
        term: record.term,
        type: record.type,
        amount: record.amount,
        status: record.status,
        date: record.date
      };

      if (record.status === 'paid') {
        byTerm[record.term].paid.push(feeRecord);
      } else if (record.status === 'pending') {
        byTerm[record.term].pending.push(feeRecord);
        totalOutstanding += record.amount || 0;
      }

      byTerm[record.term].total += record.amount || 0;
    });

    // Calculate stats
    const stats = {
      totalFees: feesData.reduce((sum, f) => sum + (f.amount || 0), 0),
      totalPaid: feesData.filter(f => f.status === 'paid').reduce((sum, f) => sum + (f.amount || 0), 0),
      totalOutstanding: totalOutstanding,
      pendingCount: feesData.filter(f => f.status === 'pending').length,
      paidCount: feesData.filter(f => f.status === 'paid').length
    };

    res.json({
      student: {
        _id: student._id,
        name: `${student.firstname} ${student.surname}`,
        firstname: student.firstname,
        surname: student.surname
      },
      stats,
      byTerm,
      records: feesData
    });

  } catch (error) {
    console.error('Error getting student fees:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Helper Functions =====

function calculateAverageScore(academic) {
  if (!academic || academic.length === 0) return 0;
  const total = academic.reduce((sum, record) => sum + (record.score || 0), 0);
  return (total / academic.length).toFixed(2);
}

function calculateAverageAttendance(attendance) {
  if (!attendance || attendance.length === 0) return 0;
  let totalPresent = 0, totalDays = 0;
  attendance.forEach(record => {
    totalPresent += record.present || 0;
    totalDays += record.total || 0;
  });
  return totalDays > 0 ? ((totalPresent / totalDays) * 100).toFixed(2) : 0;
}

function calculateOutstandingFees(fees) {
  if (!fees || fees.length === 0) return 0;
  return fees
    .filter(f => f.status === 'pending')
    .reduce((sum, f) => sum + (f.amount || 0), 0);
}

function extractSubjects(academic) {
  if (!academic) return [];
  const subjects = new Set();
  academic.forEach(record => {
    if (record.subject) subjects.add(record.subject);
  });
  return Array.from(subjects);
}

function groupByTerm(academic) {
  if (!academic) return {};
  const grouped = {};
  academic.forEach(record => {
    if (!grouped[record.term]) {
      grouped[record.term] = [];
    }
    grouped[record.term].push({
      subject: record.subject,
      score: record.score,
      grade: record.grade,
      remarks: record.remarks,
      class: record.class
    });
  });
  return grouped;
}

function groupAttendanceByTerm(attendance) {
  if (!attendance) return {};
  const grouped = {};
  attendance.forEach(record => {
    if (!grouped[record.term]) {
      grouped[record.term] = [];
    }
    const percentage = record.total > 0 ? ((record.present / record.total) * 100).toFixed(2) : 0;
    grouped[record.term].push({
      present: record.present,
      total: record.total,
      percentage,
      session: record.session
    });
  });
  return grouped;
}

function groupFeesByTerm(fees) {
  if (!fees) return {};
  const grouped = {};
  fees.forEach(record => {
    if (!grouped[record.term]) {
      grouped[record.term] = {
        paid: 0,
        pending: 0,
        total: 0
      };
    }
    grouped[record.term].total += record.amount || 0;
    if (record.status === 'paid') {
      grouped[record.term].paid += record.amount || 0;
    } else if (record.status === 'pending') {
      grouped[record.term].pending += record.amount || 0;
    }
  });
  return grouped;
}

function calculateGlobalAttendance(students) {
  if (!students || students.length === 0) return 0;
  const totalPercentages = students.map(s => parseFloat(s.attendanceStats?.averageAttendancePercentage) || 0);
  return (totalPercentages.reduce((a, b) => a + b, 0) / students.length).toFixed(2);
}

function calculateGlobalAverageGrade(students) {
  if (!students || students.length === 0) return 0;
  const totalScores = students.map(s => parseFloat(s.academicStats?.averageScore) || 0);
  return (totalScores.reduce((a, b) => a + b, 0) / students.length).toFixed(2);
}

/**
 * POST /parents/resend-credentials/:id
 * Resend login credentials to parent (admin only)
 */
router.post('/resend-credentials/:id', async (req, res) => {
  try {
    const parent = await Parent.findById(req.params.id).select('+temporaryPassword');

    if (!parent) {
      return res.status(404).json({ error: 'Parent not found' });
    }

    const credentials = {
      email: parent.email,
      password: parent.temporaryPassword || 'Not available',
      loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login.html`
    };

    res.json({
      success: true,
      message: 'Credentials retrieved',
      credentials
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /parents/change-password
 * Change parent password after first login
 */
router.post('/:id/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }

    const parent = await Parent.findById(req.params.id).select('+password');

    if (!parent) {
      return res.status(404).json({ error: 'Parent not found' });
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, parent.password);

    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    parent.password = hashedPassword;
    parent.temporaryPassword = null; // Clear temporary password flag
    await parent.save();

    res.json({ success: true, message: 'Password changed successfully' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /parents/:id/reset-password
 * Reset parent password (admin only)
 */
router.post('/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'New password required' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const parent = await Parent.findByIdAndUpdate(
      req.params.id,
      { 
        password: hashedPassword,
        temporaryPassword: newPassword  // ✅ Store plain for admin display
      },
      { new: true }
    ).select('+temporaryPassword');

    if (!parent) {
      return res.status(404).json({ error: 'Parent not found' });
    }

    res.json({ 
      success: true, 
      message: 'Password reset successful',
      temporaryPassword: newPassword,  // ✅ Return for admin
      parent
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET all parents
 */
router.get('/', async (req, res) => {
  try {
    console.log("🔥 GET /parents HIT");

    const parents = await Parent.find({ status: 'active' })
      .populate({
        path: 'studentIds',
        select: 'firstname surname class regNo student_id',
      })
      .select('-password -temporaryPassword');

    console.log("🔥 RESULT:", JSON.stringify(parents, null, 2));

    res.json(parents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET parent by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const parent = await Parent.findById(req.params.id)
      .populate({
        path: 'studentIds',
        select: 'firstname surname class regNo student_id',
      })
      .select('-password -temporaryPassword');

    if (!parent) return res.status(404).json({ error: 'Parent not found' });

    res.json(parent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * CREATE parent
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      occupation,
      emergencyContactName,
      emergencyContactPhone,
      families,
      studentIds
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const existingParent = await Parent.findOne({ email: email.toLowerCase() });
    if (existingParent) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const temporaryPassword = generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    // ✅ Resolve student_ids → ObjectIds
    const resolvedStudentIds = await resolveStudentObjectIds(studentIds);

    const parentData = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone ? phone.trim() : '',
      address: address ? address.trim() : '',
      occupation: occupation ? occupation.trim() : '',
      emergencyContactName: emergencyContactName ? emergencyContactName.trim() : '',
      emergencyContactPhone: emergencyContactPhone ? emergencyContactPhone.trim() : '',
      families: Array.isArray(families) ? families.filter(f => f && f.trim()) : [],
      studentIds: resolvedStudentIds,
      password: hashedPassword,
      temporaryPassword,  // ✅ Store plain password for admin display
      role: 'parent',
      status: 'active'
    };

    const parent = await Parent.create(parentData);

    await parent.populate({
      path: 'studentIds',
      select: 'firstname surname class regNo student_id',
    });

    const parentResponse = parent.toObject();
    delete parentResponse.password;

    res.status(201).json({
      ...parentResponse,
      temporaryPassword  // ✅ Show to admin
    });

  } catch (error) {
    console.error('Error creating parent:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * UPDATE parent
 */
router.patch('/:id', async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      occupation,
      emergencyContactName,
      emergencyContactPhone,
      families,
      studentIds
    } = req.body;

    const updateData = {};

    if (name) updateData.name = name.trim();
    if (email) updateData.email = email.toLowerCase().trim();
    if (phone !== undefined) updateData.phone = phone ? phone.trim() : '';
    if (address !== undefined) updateData.address = address ? address.trim() : '';
    if (occupation !== undefined) updateData.occupation = occupation ? occupation.trim() : '';
    if (emergencyContactName !== undefined) updateData.emergencyContactName = emergencyContactName ? emergencyContactName.trim() : '';
    if (emergencyContactPhone !== undefined) updateData.emergencyContactPhone = emergencyContactPhone ? emergencyContactPhone.trim() : '';
    if (families) updateData.families = Array.isArray(families) ? families.filter(f => f && f.trim()) : [];

    // ✅ Resolve student_ids if provided
    if (studentIds) {
      updateData.studentIds = await resolveStudentObjectIds(studentIds);
    }

    if (req.body.password) {
      return res.status(400).json({ error: 'Use reset-password endpoint' });
    }

    // ✅ Check email uniqueness
    if (email) {
      const parent = await Parent.findById(req.params.id);
      if (parent && parent.email !== email.toLowerCase()) {
        const existingEmail = await Parent.findOne({ email: email.toLowerCase() });
        if (existingEmail) {
          return res.status(400).json({ error: 'Email already registered' });
        }
      }
    }

    updateData.updatedAt = new Date();

    const updatedParent = await Parent.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate({
      path: 'studentIds',
      select: 'firstname surname class regNo student_id',
    }).select('-password -temporaryPassword');

    if (!updatedParent) return res.status(404).json({ error: 'Parent not found' });

    res.json(updatedParent);

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * PATCH /parents/:id/update-profile
 * Update parent profile (self-service)
 */
router.patch('/:id/update-profile', async (req, res) => {
  try {
    const { phone, address, occupation, emergencyContactName, emergencyContactPhone } = req.body;

    const updateData = {};
    if (phone) updateData.phone = phone.trim();
    if (address) updateData.address = address.trim();
    if (occupation) updateData.occupation = occupation.trim();
    if (emergencyContactName) updateData.emergencyContactName = emergencyContactName.trim();
    if (emergencyContactPhone) updateData.emergencyContactPhone = emergencyContactPhone.trim();

    const parent = await Parent.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password -temporaryPassword');

    if (!parent) return res.status(404).json({ error: 'Parent not found' });

    res.json({ success: true, parent });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE parent
 */
router.delete('/:id', async (req, res) => {
  try {
    const parent = await Parent.findByIdAndDelete(req.params.id);
    if (!parent) return res.status(404).json({ error: 'Parent not found' });

    if (parent.studentIds.length > 0) {
      await Student.updateMany(
        { _id: { $in: parent.studentIds } },
        { $set: { parentId: null } }
      );
    }

    res.json({ message: 'Parent deleted successfully!' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
