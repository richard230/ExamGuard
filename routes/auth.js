const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Staff = require('../models/Staff');
const Student = require('../models/Student');
const School = require('../models/School');

function normalize(value) {
  return typeof value === 'string'
    ? value.trim().toLowerCase()
    : '';
}

function normalizeSchoolKey(value) {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

async function resolveSchool(schoolKey) {
  const key = normalizeSchoolKey(schoolKey);
  if (!key) {
    return null;
  }
  let school = null;
  if (mongoose.Types.ObjectId.isValid(key)) {
    school = await School.findById(key).select(
      '_id schoolId name abbreviation motto status branding'
    );
  }
  if (!school) {
    school = await School.findOne({
      schoolId: key
    }).select(
      '_id schoolId name abbreviation motto status branding'
    );
  }
  return school;
}

function getSchoolKeyFromRequest(req) {
  return (
    req.body?.schoolId ||
    req.body?.schoolCode ||
    req.body?.schoolSubdomain ||
    req.query?.schoolId ||
    req.query?.schoolCode ||
    req.headers['x-school-id'] ||
    req.headers['x-school-code'] ||
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
    password
  } = req.body;
  const suppliedSchoolKey = getSchoolKeyFromRequest(req);
  if ((!email && !regNo) || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email/registration number and password are required.'
    });
  }
  try {
    const normalizedEmail = normalize(email);
    const normalizedRegNo = normalize(regNo);
    let school = null;
    if (suppliedSchoolKey) {
      school = await resolveSchool(suppliedSchoolKey);
      if (!school) {
        return res.status(404).json({
          success: false,
          error: 'School not found.'
        });
      }
      if (
        school.status &&
        school.status !== 'active'
      ) {
        return res.status(403).json({
          success: false,
          error: 'This school portal is currently unavailable.'
        });
      }
    }
    const resolvedSchoolId = school
      ? school._id
      : null;
    let user = null;
    if (normalizedEmail) {
      const query = {
        email: normalizedEmail
      };
      if (resolvedSchoolId) {
        query.schoolId = resolvedSchoolId;
      }
      user = await User.findOne(query);
    } else if (normalizedRegNo) {
      const query = {
        regNo: normalizedRegNo
      };
      if (resolvedSchoolId) {
        query.schoolId = resolvedSchoolId;
      }
      user = await User.findOne(query);
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
        if (
          resolvedSchoolId &&
          user.schoolId.toString() !==
            resolvedSchoolId.toString()
        ) {
          return res.status(401).json({
            success: false,
            error: 'Invalid credentials.'
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
      const query1 = {
        login_email: normalizedEmail
      };
      const query2 = {
        email: normalizedEmail
      };
      if (resolvedSchoolId) {
        query1.schoolId = resolvedSchoolId;
        query2.schoolId = resolvedSchoolId;
      }
      staff =
        await Staff.findOne(query1) ||
        await Staff.findOne(query2);
    }
    if (staff) {
      const passwordHash =
        staff.login_password ||
        staff.password;
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
        if (
          resolvedSchoolId &&
          staff.schoolId.toString() !==
            resolvedSchoolId.toString()
        ) {
          return res.status(401).json({
            success: false,
            error: 'Invalid credentials.'
          });
        }
        const role =
          staff.access_level ||
          'staff';
        const token = createToken({
          id: staff._id,
          role,
          email:
            staff.login_email ||
            staff.email,
          schoolId: staff.schoolId
        });
        return res.json({
          success: true,
          token,
          user: {
            id: staff._id,
            name:
              `${staff.first_name || ''} ${staff.last_name || ''}`
                .trim(),
            email:
              staff.login_email ||
              staff.email ||
              null,
            role,
            department:
              staff.department ||
              null,
            designation:
              staff.designation ||
              null,
            schoolId:
              staff.schoolId
          }
        });
      }
    }
    let student = null;
    if (normalizedRegNo) {
      const query = {
        regNo: normalizedRegNo
      };
      if (resolvedSchoolId) {
        query.schoolId = resolvedSchoolId;
      }
      student = await Student.findOne(query);
    } else if (normalizedEmail) {
      const query = {
        studentEmail: normalizedEmail
      };
      if (resolvedSchoolId) {
        query.schoolId = resolvedSchoolId;
      }
      student = await Student.findOne(query);
    }
    if (student) {
      const passwordHash =
        student.password;
      if (
        passwordHash &&
        await bcrypt.compare(
          password,
          passwordHash
        )
      ) {
        if (!student.schoolId) {
          return res.status(403).json({
            success: false,
            error: 'This student account is not associated with a school.'
          });
        }
        if (
          resolvedSchoolId &&
          student.schoolId.toString() !==
            resolvedSchoolId.toString()
        ) {
          return res.status(401).json({
            success: false,
            error: 'Invalid credentials.'
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
            name:
              `${student.firstname || ''} ${student.surname || ''}`
                .trim(),
            email:
              student.studentEmail ||
              null,
            regNo:
              student.regNo,
            role: 'student',
            schoolId:
              student.schoolId
          }
        });
      }
    }
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials.'
    });
  } catch (err) {
    console.error(
      '[LOGIN ERROR]',
      err
    );
    return res.status(500).json({
      success: false,
      error: 'Server error during login.'
    });
  }
});

async function authMiddleware(req, res, next) {
  const authHeader =
    req.headers.authorization;
  if (
    !authHeader ||
    !authHeader.startsWith('Bearer ')
  ) {
    return res.status(401).json({
      success: false,
      error: 'No token provided.'
    });
  }
  const token =
    authHeader.split(' ')[1];
  try {
    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );
    let user =
      await User.findById(decoded.id);
    if (user) {
      if (user.role === 'superadmin') {
        req.user = {
          id: user._id,
          name: user.name,
          email: user.email || null,
          regNo: user.regNo || null,
          role: user.role,
          schoolId: null
        };
        return next();
      }
      if (!user.schoolId) {
        return res.status(403).json({
          success: false,
          error: 'Account is not associated with a school.'
        });
      }
      if (
        decoded.schoolId &&
        user.schoolId.toString() !==
          decoded.schoolId.toString()
      ) {
        return res.status(401).json({
          success: false,
          error: 'Invalid school context.'
        });
      }
      req.user = {
        id: user._id,
        name: user.name,
        email: user.email || null,
        regNo: user.regNo || null,
        role: user.role,
        schoolId: user.schoolId
      };
      return next();
    }
    let staff =
      await Staff.findById(decoded.id);
    if (staff) {
      if (!staff.schoolId) {
        return res.status(403).json({
          success: false,
          error: 'Staff account is not associated with a school.'
        });
      }
      if (
        decoded.schoolId &&
        staff.schoolId.toString() !==
          decoded.schoolId.toString()
      ) {
        return res.status(401).json({
          success: false,
          error: 'Invalid school context.'
        });
      }
      req.user = {
        id: staff._id,
        name:
          `${staff.first_name || ''} ${staff.last_name || ''}`
            .trim(),
        email:
          staff.login_email ||
          staff.email ||
          null,
        role:
          staff.access_level ||
          'staff',
        department:
          staff.department ||
          null,
        designation:
          staff.designation ||
          null,
        schoolId:
          staff.schoolId
      };
      return next();
    }
    let student =
      await Student.findById(decoded.id);
    if (student) {
      if (!student.schoolId) {
        return res.status(403).json({
          success: false,
          error: 'Student account is not associated with a school.'
        });
      }
      if (
        decoded.schoolId &&
        student.schoolId.toString() !==
          decoded.schoolId.toString()
      ) {
        return res.status(401).json({
          success: false,
          error: 'Invalid school context.'
        });
      }
      req.user = {
        id: student._id,
        name:
          `${student.firstname || ''} ${student.surname || ''}`
            .trim(),
        email:
          student.studentEmail ||
          null,
        regNo:
          student.regNo,
        role: 'student',
        schoolId:
          student.schoolId
      };
      return next();
    }
    return res.status(401).json({
      success: false,
      error: 'User not found.'
    });
  } catch (err) {
    console.error(
      '[AUTH ERROR]',
      err
    );
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token.'
    });
  }
}

router.get(
  '/me',
  authMiddleware,
  async (req, res) => {
    try {
      let school = null;

      if (req.user.schoolId) {
        // First try to find by MongoDB ObjectId
        school = await School.findById(
          req.user.schoolId
        ).select(
          '_id schoolId schoolName subdomain abbreviation motto status logoUrl branding'
        );
        
        // If not found by ObjectId, try by schoolId field
        if (!school) {
          school = await School.findOne({
            schoolId: req.user.schoolId
          }).select(
            '_id schoolId schoolName subdomain abbreviation motto status logoUrl branding'
          );
        }
      }

      // A school-scoped account must have a valid school
      if (req.user.role === 'superadmin' && !school) {
        return res.status(403).json({
          success: false,
          error: 'Your account is not linked to a valid school.'
        });
      }

      return res.json({
        success: true,

        user: {
          id: req.user._id,
          name: req.user.name,
          email: req.user.email,
          regNo: req.user.regNo,
          role: req.user.role,

          // MongoDB School ObjectId.
          // Keep this for backend/API tenant identification.
          schoolId: req.user.schoolId
        },

        school: school
          ? {
              _id: school._id,
              schoolId: school.schoolId,
              schoolName: school.schoolName,
              subdomain: school.subdomain,
              abbreviation: school.abbreviation,
              motto: school.motto,
              status: school.status,
              logoUrl: school.logoUrl,
              branding: school.branding
            }
          : null
      });

    } catch (err) {
      console.error(
        '[AUTH ME ERROR]',
        err
      );

      return res.status(500).json({
        success: false,
        error:
          'Unable to retrieve account information.'
      });
    }
  }
);
module.exports = {
  router,
  authMiddleware
};
