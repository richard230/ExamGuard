const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Staff = require('../models/Staff');
const Student = require('../models/Student');
const School = require('../models/School');

function normalize(value) {
  return typeof value === 'string'
    ? value.trim().toLowerCase()
    : '';
}

function getSchoolIdFromRequest(req) {
  return (
    req.body?.schoolId ||
    req.query?.schoolId ||
    req.headers['x-school-id'] ||
    null
  );
}

function createToken(payload) {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    {
      expiresIn: '7d'
    }
  );
}

function buildUserResponse(user, extra = {}) {
  return {
    id: user._id,
    name: user.name,
    email: user.email || null,
    regNo: user.regNo || null,
    role: user.role,
    schoolId: user.schoolId || null,
    ...extra
  };
}

router.post('/login', async (req, res) => {
  const {
    email,
    regNo,
    password,
    schoolId
  } = req.body;
  if ((!email && !regNo) || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email/registration number and password are required.'
    });
  }
  try {
    const normalizedEmail = normalize(email);
    const normalizedRegNo = normalize(regNo);
    let resolvedSchoolId = schoolId || null;
    if (resolvedSchoolId) {
      const school = await School.findById(resolvedSchoolId).select(
        '_id status'
      );
      if (!school) {
        return res.status(404).json({
          success: false,
          error: 'School not found.'
        });
      }
      if (school.status && school.status !== 'active') {
        return res.status(403).json({
          success: false,
          error: 'This school portal is currently unavailable.'
        });
      }
    }
    let user = null;
    if (normalizedEmail) {
      user = await User.findOne({
        email: normalizedEmail,
        ...(resolvedSchoolId
          ? { schoolId: resolvedSchoolId }
          : {})
      });
    } else if (normalizedRegNo) {
      user = await User.findOne({
        regNo: normalizedRegNo,
        ...(resolvedSchoolId
          ? { schoolId: resolvedSchoolId }
          : {})
      });
    }
    if (user) {
      const passwordValid = await bcrypt.compare(
        password,
        user.password
      );
      if (passwordValid) {
        if (user.role === 'superadmin') {
          const token = createToken({
            id: user._id,
            role: user.role,
            email: user.email,
            regNo: user.regNo || null,
            schoolId: null
          });
          return res.json({
            success: true,
            token,
            user: buildUserResponse(user, {
              schoolId: null
            })
          });
        }
        if (!user.schoolId) {
          return res.status(403).json({
            success: false,
            error: 'This account is not associated with a school.'
          });
        }
        const token = createToken({
          id: user._id,
          role: user.role,
          email: user.email,
          regNo: user.regNo || null,
          schoolId: user.schoolId
        });
        return res.json({
          success: true,
          token,
          user: buildUserResponse(user)
        });
      }
    }
    let staff = null;
    if (normalizedEmail) {
      staff =
        await Staff.findOne({
          login_email: normalizedEmail,
          ...(resolvedSchoolId
            ? { schoolId: resolvedSchoolId }
            : {})
        }) ||
        await Staff.findOne({
          email: normalizedEmail,
          ...(resolvedSchoolId
            ? { schoolId: resolvedSchoolId }
            : {})
        });
    }
    if (staff) {
      const passwordHash =
        staff.login_password || staff.password;
      if (
        passwordHash &&
        await bcrypt.compare(password, passwordHash)
      ) {
        if (!staff.schoolId) {
          return res.status(403).json({
            success: false,
            error: 'This staff account is not associated with a school.'
          });
        }
        const role = staff.access_level || 'staff';
        const token = createToken({
          id: staff._id,
          role,
          email: staff.login_email || staff.email,
          schoolId: staff.schoolId
        });
        return res.json({
          success: true,
          token,
          user: {
            id: staff._id,
            name: `${staff.first_name || ''} ${staff.last_name || ''}`.trim(),
            email: staff.login_email || staff.email || null,
            role,
            department: staff.department || null,
            designation: staff.designation || null,
            schoolId: staff.schoolId
          }
        });
      }
    }
    let student = null;
    if (normalizedRegNo) {
      student = await Student.findOne({
        regNo: normalizedRegNo,
        ...(resolvedSchoolId
          ? { schoolId: resolvedSchoolId }
          : {})
      });
    } else if (normalizedEmail) {
      student = await Student.findOne({
        studentEmail: normalizedEmail,
        ...(resolvedSchoolId
          ? { schoolId: resolvedSchoolId }
          : {})
      });
    }
    if (student) {
      const passwordHash = student.password;
      if (
        passwordHash &&
        await bcrypt.compare(password, passwordHash)
      ) {
        if (!student.schoolId) {
          return res.status(403).json({
            success: false,
            error: 'This student account is not associated with a school.'
          });
        }
        const token = createToken({
          id: student._id,
          role: 'student',
          regNo: student.regNo,
          schoolId: student.schoolId
        });
        return res.json({
          success: true,
          token,
          user: {
            id: student._id,
            name: `${student.firstname || ''} ${student.surname || ''}`.trim(),
            email: student.studentEmail || null,
            regNo: student.regNo,
            role: 'student',
            schoolId: student.schoolId
          }
        });
      }
    }
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials.'
    });
  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    return res.status(500).json({
      success: false,
      error: 'Server error during login.'
    });
  }
});

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (
    !authHeader ||
    !authHeader.startsWith('Bearer ')
  ) {
    return res.status(401).json({
      success: false,
      error: 'No token provided.'
    });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );
    let user = await User.findById(decoded.id);
    if (user) {
      req.user = {
        id: user._id,
        name: user.name,
        email: user.email || null,
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
        name: `${staff.first_name || ''} ${staff.last_name || ''}`.trim(),
        email: staff.login_email || staff.email || null,
        role: staff.access_level || 'staff',
        department: staff.department || null,
        designation: staff.designation || null,
        schoolId: staff.schoolId || null
      };
      return next();
    }
    let student = await Student.findById(decoded.id);
    if (student) {
      req.user = {
        id: student._id,
        name: `${student.firstname || ''} ${student.surname || ''}`.trim(),
        email: student.studentEmail || null,
        regNo: student.regNo,
        role: 'student',
        schoolId: student.schoolId || null
      };
      return next();
    }
    return res.status(401).json({
      success: false,
      error: 'User not found.'
    });
  } catch (err) {
    console.error('[AUTH ERROR]', err);
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token.'
    });
  }
}

router.get('/me', authMiddleware, async (req, res) => {
  try {
    let school = null;
    if (req.user.schoolId) {
      school = await School.findById(
        req.user.schoolId
      ).select(
        '_id name abbreviation motto status branding'
      );
    }
    return res.json({
      success: true,
      user: req.user,
      school
    });
  } catch (err) {
    console.error('[AUTH ME ERROR]', err);
    return res.status(500).json({
      success: false,
      error: 'Unable to retrieve account information.'
    });
  }
});

module.exports = {
  router,
  authMiddleware
};
