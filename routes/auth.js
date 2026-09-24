const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Staff = require('../models/Staff');
const Student = require('../models/Student');

router.post('/login', async (req, res) => {
  const { email, regNo, password } = req.body;
  if ((!email && !regNo) || !password) {
    return res.status(400).json({
      error: 'Email/registration number and password are required.'
    });
  }
  try {
    let user = null;
    if (email) {
      user = await User.findOne({ email });
    } else if (regNo) {
      user = await User.findOne({ regNo });
    }
    if (user && await bcrypt.compare(password, user.password)) {
      const token = jwt.sign(
        {
          id: user._id,
          role: user.role,
          email: user.email,
          regNo: user.regNo || null,
          schoolId: user.schoolId || null
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      return res.json({
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          regNo: user.regNo || null,
          role: user.role,
          schoolId: user.schoolId || null
        }
      });
    }
    let staff = null;
    if (email) {
      staff = await Staff.findOne({ login_email: email }) || await Staff.findOne({ email });
    }
    if (staff && await bcrypt.compare(password, staff.login_password)) {
      const token = jwt.sign(
        {
          id: staff._id,
          role: staff.access_level || 'staff',
          email: staff.login_email || staff.email,
          schoolId: staff.schoolId || null
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      return res.json({
        token,
        user: {
          id: staff._id,
          name: `${staff.first_name} ${staff.last_name}`,
          email: staff.login_email || staff.email,
          role: staff.access_level || 'staff',
          department: staff.department,
          designation: staff.designation,
          schoolId: staff.schoolId || null
        }
      });
    }
    let student = null;
    if (regNo) {
      student = await Student.findOne({ regNo });
    } else if (email) {
      student = await Student.findOne({ studentEmail: email });
    }
    if (student && await bcrypt.compare(password, student.password)) {
      const token = jwt.sign(
        {
          id: student._id,
          role: 'student',
          regNo: student.regNo,
          schoolId: student.schoolId || null
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      return res.json({
        token,
        user: {
          id: student._id,
          name: `${student.firstname} ${student.surname}`,
          regNo: student.regNo,
          role: 'student',
          schoolId: student.schoolId || null
        }
      });
    }
    return res.status(401).json({
      error: 'Invalid credentials.'
    });
  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    res.status(500).json({
      error: 'Server error.'
    });
  }
});

async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'No token provided.'
    });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    let user = await User.findById(decoded.id);
    if (user) {
      req.user = {
        id: user._id,
        name: user.name,
        email: user.email,
        regNo: user.regNo || null,
        role: user.role,
        schoolId: user.schoolId || null
      };
      return next();
    }
    let staff = await Staff.findById(decoded.id);
    if (staff) {
      req.user = {
        id: staff._id,
        name: `${staff.first_name} ${staff.last_name}`,
        email: staff.login_email || staff.email,
        role: staff.access_level || 'staff',
        department: staff.department,
        designation: staff.designation,
        schoolId: staff.schoolId || null
      };
      return next();
    }
    let student = await Student.findById(decoded.id);
    if (student) {
      req.user = {
        id: student._id,
        name: `${student.firstname} ${student.surname}`,
        regNo: student.regNo,
        role: 'student',
        schoolId: student.schoolId || null
      };
      return next();
    }
    return res.status(401).json({
      error: 'User not found.'
    });
  } catch (err) {
    console.error('[AUTH ERROR]', err);
    return res.status(401).json({
      error: 'Invalid or expired token.'
    });
  }
}

router.get('/me', authMiddleware, (req, res) => {
  res.json(req.user);
});

module.exports = {
  router,
  authMiddleware
};
