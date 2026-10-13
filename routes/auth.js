const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;

const User = require('../models/User');
const Staff = require('../models/Staff');
const Student = require('../models/Student');
const School = require('../models/School');
const Parent = require('../models/Parent');

cloudinary.config();

// --- Simple AuthSession model (keeps track of issued tokens / sessions) ---
const AuthSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  role: { type: String, required: true },
  token: { type: String, required: true, index: true },
  ip: { type: String },
  userAgent: { type: String },
  createdAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  meta: { type: mongoose.Schema.Types.Mixed }
}, { collection: 'authsessions' });

const AuthSession = mongoose.models.AuthSession || mongoose.model('AuthSession', AuthSessionSchema);

// --- helpers ---
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

// --- LOGIN (existing) but extended to create a session record ---
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
          if (!user.schoolId) {
            return res.status(403).json({
              success: false,
              error: 'This superadmin account is not associated with a school.'
            });
          }

          const token = createToken({
            id: user._id,
            role: user.role,
            email: user.email,
            regNo: user.regNo || null,
            schoolId: user.schoolId
          });

          // create session
          try {
            await AuthSession.create({
              userId: user._id,
              role: user.role,
              token,
              ip: req.ip,
              userAgent: req.get('User-Agent'),
              meta: { loginType: 'user' }
            });
          } catch (e) {
            console.warn('Could not create auth session record', e);
          }

          return res.json({
            success: true,
            token,
            user: buildUserResponse(user)
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

        try {
          await AuthSession.create({
            userId: user._id,
            role: user.role,
            token,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            meta: { loginType: 'user' }
          });
        } catch (e) {
          console.warn('Could not create auth session record', e);
        }

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

        try {
          await AuthSession.create({
            userId: staff._id,
            role,
            token,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            meta: { loginType: 'staff' }
          });
        } catch (e) {
          console.warn('Could not create auth session record', e);
        }

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

        try {
          await AuthSession.create({
            userId: student._id,
            role: 'student',
            token,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            meta: { loginType: 'student' }
          });
        } catch (e) {
          console.warn('Could not create auth session record', e);
        }

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

// --- AUTH MIDDLEWARE (enhanced with session tracking) ---
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'No token provided.'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 1. Check User
    let user = await User.findById(decoded.id);
    if (user) {
      // set token and attach session record (update lastSeenAt)
      req.token = token;

      if (user.role === 'superadmin') {
        req.user = {
          id: user._id,
          name: user.name,
          email: user.email || null,
          regNo: user.regNo || null,
          role: user.role,
          schoolId: user.schoolId || null
        };

        // update/create session entry
        try {
          let session = await AuthSession.findOne({ token });
          if (!session) {
            session = await AuthSession.create({
              userId: user._id,
              role: user.role,
              token,
              ip: req.ip,
              userAgent: req.get('User-Agent'),
              lastSeenAt: new Date()
            });
          } else {
            session.lastSeenAt = new Date();
            await session.save();
          }
          req.session = session;
        } catch (e) {
          console.warn('AuthSession update/create error', e);
        }

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
        user.schoolId.toString() !== decoded.schoolId.toString()
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

      try {
        let session = await AuthSession.findOne({ token });
        if (!session) {
          session = await AuthSession.create({
            userId: user._id,
            role: user.role,
            token,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            lastSeenAt: new Date()
          });
        } else {
          session.lastSeenAt = new Date();
          await session.save();
        }
        req.session = session;
      } catch (e) {
        console.warn('AuthSession update/create error', e);
      }

      return next();
    }

    // 2. Check Parent
    let parent = await Parent.findById(decoded.id);
    if (parent) {
      if (!parent.schoolId) {
        return res.status(403).json({
          success: false,
          error: 'Parent account is not associated with a school.'
        });
      }

      if (
        decoded.schoolId &&
        parent.schoolId.toString() !== decoded.schoolId.toString()
      ) {
        return res.status(401).json({
          success: false,
          error: 'Invalid school context.'
        });
      }

      req.user = {
        id: parent._id,
        name: parent.name,
        email: parent.email || null,
        phone: parent.phone || null,
        role: 'parent',
        schoolId: parent.schoolId
      };

      try {
        let session = await AuthSession.findOne({ token });
        if (!session) {
          session = await AuthSession.create({
            userId: parent._id,
            role: 'parent',
            token,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            lastSeenAt: new Date()
          });
        } else {
          session.lastSeenAt = new Date();
          await session.save();
        }
        req.session = session;
        req.token = token;
      } catch (e) {
        console.warn('AuthSession error', e);
      }

      return next();
    }

    // 3. Check Staff
    let staff = await Staff.findById(decoded.id);
    if (staff) {
      if (!staff.schoolId) {
        return res.status(403).json({
          success: false,
          error: 'Staff account is not associated with a school.'
        });
      }

      if (
        decoded.schoolId &&
        staff.schoolId.toString() !== decoded.schoolId.toString()
      ) {
        return res.status(401).json({
          success: false,
          error: 'Invalid school context.'
        });
      }

      req.user = {
        id: staff._id,
        name: `${staff.first_name || ''} ${staff.last_name || ''}`.trim(),
        email: staff.login_email || staff.email || null,
        role: staff.access_level || 'staff',
        schoolId: staff.schoolId
      };

      try {
        let session = await AuthSession.findOne({ token });
        if (!session) {
          session = await AuthSession.create({
            userId: staff._id,
            role: staff.access_level || 'staff',
            token,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            lastSeenAt: new Date()
          });
        } else {
          session.lastSeenAt = new Date();
          await session.save();
        }
        req.session = session;
        req.token = token;
      } catch (e) {
        console.warn('AuthSession error', e);
      }

      return next();
    }

    // 4. Check Student
    let student = await Student.findById(decoded.id);
    if (student) {
      if (!student.schoolId) {
        return res.status(403).json({
          success: false,
          error: 'Student account is not associated with a school.'
        });
      }

      if (
        decoded.schoolId &&
        student.schoolId.toString() !== decoded.schoolId.toString()
      ) {
        return res.status(401).json({
          success: false,
          error: 'Invalid school context.'
        });
      }

      req.user = {
        id: student._id,
        name: `${student.firstname || ''} ${student.surname || ''}`.trim(),
        email: student.studentEmail || null,
        regNo: student.regNo,
        role: 'student',
        schoolId: student.schoolId
      };

      try {
        let session = await AuthSession.findOne({ token });
        if (!session) {
          session = await AuthSession.create({
            userId: student._id,
            role: 'student',
            token,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            lastSeenAt: new Date()
          });
        } else {
          session.lastSeenAt = new Date();
          await session.save();
        }
        req.session = session;
        req.token = token;
      } catch (e) {
        console.warn('AuthSession error', e);
      }

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

// --- GET /api/auth/me (already present; keep) ---
router.get(
  '/me',
  authMiddleware,
  async (req, res) => {
    try {
      let school = null;

      if (req.user.schoolId) {
        school = await School.findById(
          req.user.schoolId
        ).select(
          '_id schoolId schoolName name subdomain abbreviation motto status logoUrl branding'
        );
      }

      if (!school) {
        return res.status(403).json({
          success: false,
          error: 'Your account is not linked to a valid school.'
        });
      }

      return res.json({
        success: true,

        user: {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          regNo: req.user.regNo,
          role: req.user.role,
          schoolId: req.user.schoolId
        },

        school: {
          _id: school._id,
          schoolId: school.schoolId,
          schoolName: school.schoolName || school.name,
          subdomain: school.subdomain,
          abbreviation: school.abbreviation,
          motto: school.motto,
          status: school.status,
          logoUrl: school.logoUrl,
          branding: school.branding
        }
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

// --- PATCH /api/auth/me
// update profile fields on the appropriate model depending on req.user.role
router.patch('/me', authMiddleware, async (req, res) => {
  try {
    const updates = {};
    const allowed = ['name', 'email', 'phone', 'displayName', 'bio'];
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        updates[k] = req.body[k];
      }
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, error: 'No update fields provided.' });
    }

    const role = req.user.role;
    let updated = null;

    if (role === 'student') {
      // try updating Student fields
      const map = {};
      if (updates.name) {
        // attempt to split into firstname/surname if possible
        const parts = String(updates.name).trim().split(/\s+/);
        map.firstname = parts.shift() || '';
        map.surname = parts.join(' ') || map.firstname;
      }
      if (updates.email) map.studentEmail = updates.email;
      if (updates.phone) map.phone = updates.phone;
      if (updates.bio) map.bio = updates.bio;
      updated = await Student.findByIdAndUpdate(req.user.id, { $set: map }, { new: true }).lean();
    } else if (role === 'parent') {
      const map = {};
      if (updates.name) map.name = updates.name;
      if (updates.email) map.email = updates.email;
      if (updates.phone) map.phone = updates.phone;
      if (updates.bio) map.bio = updates.bio;
      updated = await Parent.findByIdAndUpdate(req.user.id, { $set: map }, { new: true }).lean();
    } else if (role === 'staff') {
      const map = {};
      if (updates.name) {
        // try to split into first/last
        const parts = String(updates.name).trim().split(/\s+/);
        map.first_name = parts.shift() || '';
        map.last_name = parts.join(' ') || map.first_name;
      }
      if (updates.email) {
        map.email = updates.email;
        map.login_email = updates.email; // keep login_email consistent if present
      }
      if (updates.phone) map.phone = updates.phone;
      if (updates.bio) map.bio = updates.bio;
      updated = await Staff.findByIdAndUpdate(req.user.id, { $set: map }, { new: true }).lean();
    } else {
      // default User model (includes superadmin and general users)
      const map = {};
      if (updates.name) map.name = updates.name;
      if (updates.email) map.email = updates.email;
      if (updates.phone) map.phone = updates.phone;
      if (updates.displayName) map.displayName = updates.displayName;
      if (updates.bio) map.bio = updates.bio;
      updated = await User.findByIdAndUpdate(req.user.id, { $set: map }, { new: true }).lean();
    }

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Account not found.' });
    }

    return res.json({ success: true, user: updated });
  } catch (err) {
    console.error('[PATCH /me] error', err);
    return res.status(500).json({ success: false, error: 'Failed to update profile.' });
  }
});

// --- POST /api/auth/me/avatar
// Accepts JSON { photoBase64: 'data:image/..;base64,...' } and uploads to Cloudinary,
// then updates appropriate model with avatarUrl and avatarPublicId
router.post('/me/avatar', authMiddleware, async (req, res) => {
  try {
    const { photoBase64 } = req.body;
    if (!photoBase64 || typeof photoBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'photoBase64 is required (data URL).' });
    }

    // upload to cloudinary
    let result;
    try {
      result = await cloudinary.uploader.upload(photoBase64, {
        folder: 'examguard_avatars',
        resource_type: 'image'
      });
    } catch (uploadErr) {
      console.error('Cloudinary upload error', uploadErr);
      return res.status(500).json({ success: false, error: 'Failed to upload image.' });
    }

    const avatarUrl = result.secure_url;
    const publicId = result.public_id;

    const role = req.user.role;
    let modelUpdated = null;

    if (role === 'student') {
      modelUpdated = await Student.findByIdAndUpdate(req.user.id, { $set: { avatarUrl, avatarPublicId: publicId } }, { new: true }).lean();
    } else if (role === 'parent') {
      modelUpdated = await Parent.findByIdAndUpdate(req.user.id, { $set: { avatarUrl, avatarPublicId: publicId } }, { new: true }).lean();
    } else if (role === 'staff') {
      modelUpdated = await Staff.findByIdAndUpdate(req.user.id, { $set: { avatarUrl, avatarPublicId: publicId } }, { new: true }).lean();
    } else {
      modelUpdated = await User.findByIdAndUpdate(req.user.id, { $set: { avatarUrl, avatarPublicId: publicId } }, { new: true }).lean();
    }

    return res.json({ success: true, url: avatarUrl, publicId, user: modelUpdated });
  } catch (err) {
    console.error('[POST /me/avatar] error', err);
    return res.status(500).json({ success: false, error: 'Failed to upload avatar.' });
  }
});

// --- DELETE /api/auth/me/avatar
// Remove avatar info and delete resource from Cloudinary if public id present
router.delete('/me/avatar', authMiddleware, async (req, res) => {
  try {
    const role = req.user.role;
    let current = null;

    if (role === 'student') current = await Student.findById(req.user.id).lean();
    else if (role === 'parent') current = await Parent.findById(req.user.id).lean();
    else if (role === 'staff') current = await Staff.findById(req.user.id).lean();
    else current = await User.findById(req.user.id).lean();

    const publicId = current?.avatarPublicId;

    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
      } catch (err) {
        console.warn('Cloudinary destroy failed', err);
      }
    }

    // unset fields
    if (role === 'student') {
      await Student.findByIdAndUpdate(req.user.id, { $unset: { avatarUrl: '', avatarPublicId: '' } });
    } else if (role === 'parent') {
      await Parent.findByIdAndUpdate(req.user.id, { $unset: { avatarUrl: '', avatarPublicId: '' } });
    } else if (role === 'staff') {
      await Staff.findByIdAndUpdate(req.user.id, { $unset: { avatarUrl: '', avatarPublicId: '' } });
    } else {
      await User.findByIdAndUpdate(req.user.id, { $unset: { avatarUrl: '', avatarPublicId: '' } });
    }

    return res.json({ success: true, message: 'Avatar removed.' });
  } catch (err) {
    console.error('[DELETE /me/avatar] error', err);
    return res.status(500).json({ success: false, error: 'Failed to remove avatar.' });
  }
});

// --- GET /api/auth/sessions
router.get('/sessions', authMiddleware, async (req, res) => {
  try {
    const sessions = await AuthSession.find({ userId: req.user.id }).sort({ lastSeenAt: -1 }).lean();
    // mask tokens for client
    const safe = sessions.map(s => ({
      id: s._id,
      userId: s.userId,
      role: s.role,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      current: req.token && s.token === req.token
    }));
    return res.json({ success: true, sessions: safe });
  } catch (err) {
    console.error('[GET /auth/sessions] error', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch sessions.' });
  }
});

// --- DELETE /api/auth/sessions/:id  (revoke a particular session)
router.delete('/sessions/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid session id.' });
    }

    const session = await AuthSession.findById(id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found.' });
    }

    // only owner or superadmin can revoke
    if (session.userId.toString() !== req.user.id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Not allowed to revoke this session.' });
    }

    await session.remove();
    return res.json({ success: true, message: 'Session revoked.' });
  } catch (err) {
    console.error('[DELETE /auth/sessions/:id] error', err);
    return res.status(500).json({ success: false, error: 'Failed to revoke session.' });
  }
});

// --- DELETE /api/auth/sessions  (revoke other sessions)
// Removes all sessions for the user except the one with the current token
router.delete('/sessions', authMiddleware, async (req, res) => {
  try {
    const filter = { userId: req.user.id };
    if (req.token) {
      // keep current token
      await AuthSession.deleteMany({ userId: req.user.id, token: { $ne: req.token } });
    } else {
      // no token context — remove all (use with care)
      await AuthSession.deleteMany({ userId: req.user.id });
    }
    return res.json({ success: true, message: 'Other sessions revoked.' });
  } catch (err) {
    console.error('[DELETE /auth/sessions] error', err);
    return res.status(500).json({ success: false, error: 'Failed to revoke sessions.' });
  }
});

// --- POST /api/auth/change-password
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'currentPassword and newPassword are required.' });
    }

    const role = req.user.role;
    let account = null;
    let passwordField = 'password'; // default

    if (role === 'staff') {
      account = await Staff.findById(req.user.id);
      passwordField = account && account.login_password ? 'login_password' : 'password';
    } else if (role === 'student') {
      account = await Student.findById(req.user.id);
    } else if (role === 'parent') {
      account = await Parent.findById(req.user.id);
    } else {
      account = await User.findById(req.user.id);
    }

    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found.' });
    }

    const storedHash = account[passwordField] || account.password;
    if (!storedHash) {
      return res.status(400).json({ success: false, error: 'No password set for this account.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, storedHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect.' });
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    // set on the account model
    if (role === 'staff') {
      // keep both fields in sync if both present
      const update = { };
      if (account.login_password !== undefined) update.login_password = newHash;
      update.password = newHash;
      await Staff.findByIdAndUpdate(req.user.id, { $set: update });
    } else if (role === 'student') {
      await Student.findByIdAndUpdate(req.user.id, { $set: { password: newHash } });
    } else if (role === 'parent') {
      await Parent.findByIdAndUpdate(req.user.id, { $set: { password: newHash } });
    } else {
      await User.findByIdAndUpdate(req.user.id, { $set: { password: newHash } });
    }

    // Optionally revoke other sessions (uncomment if desired)
    // await AuthSession.deleteMany({ userId: req.user.id, token: { $ne: req.token } });

    return res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('[POST /auth/change-password] error', err);
    return res.status(500).json({ success: false, error: 'Failed to change password.' });
  }
});

module.exports = {
  router,
  authMiddleware
};
