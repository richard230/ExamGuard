const express = require('express');
const router = express.Router();
const multer = require('multer');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Staff = require('../models/Staff');
const Class = require('../models/Class');

const storage = multer.memoryStorage();
const upload = multer({ storage });

// ========== HELPER FUNCTIONS ==========

/**
 * Get school ID from request context
 */
function getSchoolId(req) {
  return req.user?.schoolId || req.body?.schoolId || req.query?.schoolId || null;
}

/**
 * Require school context for staff operations
 */
function requireSchool(req, res) {
  const schoolId = getSchoolId(req);
  if (!schoolId) {
    return res.status(403).json({
      error: 'School context required. Missing schoolId.'
    });
  }
  return schoolId;
}

/**
 * Add school filter to query
 */
function addSchoolFilter(req, query = {}) {
  const schoolId = getSchoolId(req);
  if (schoolId) {
    query.schoolId = mongoose.Types.ObjectId.isValid(schoolId)
      ? new mongoose.Types.ObjectId(schoolId)
      : schoolId;
  }
  return query;
}

/**
 * Convert base64 files from form data
 */
function encodeFileToBase64(file) {
  if (!file) return null;
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

/**
 * Prepare staff response object
 */
function formatStaffResponse(staff, includePassword = false) {
  const staffObj = staff.lean ? staff.lean() : staff.toObject();
  
  const response = {
    id: staffObj._id,
    first_name: staffObj.first_name,
    last_name: staffObj.last_name,
    designation: staffObj.designation,
    department: staffObj.department,
    email: staffObj.email || null,
    phone: staffObj.phone || null,
    login_email: staffObj.login_email || null,
    photo_url: staffObj.photo || null,
    id_upload_url: staffObj.id_upload || null,
    schoolId: staffObj.schoolId || null
  };

  if (includePassword) {
    response.login_password = staffObj.login_password;
  }

  return response;
}

// ========== ENDPOINTS ==========

/**
 * GET /api/staff - Return all staff for school (summary)
 */
router.get('/', async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const query = addSchoolFilter(req, {});

    const staffList = await Staff.find(
      query,
      'first_name last_name designation department photo schoolId'
    ).lean();

    const formattedStaff = staffList.map(s => ({
      id: s._id,
      first_name: s.first_name,
      last_name: s.last_name,
      designation: s.designation,
      department: s.department,
      photo_url: s.photo || null,
      schoolId: s.schoolId
    }));

    formattedStaff.sort((a, b) => {
      if (a.last_name === b.last_name) {
        return a.first_name.localeCompare(b.first_name);
      }
      return a.last_name.localeCompare(b.last_name);
    });

    res.json(formattedStaff);
  } catch (error) {
    console.error('[STAFF LIST ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/staff/:id - Return full details for a staff member
 */
router.get('/:id', async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const query = addSchoolFilter(req, { _id: req.params.id });

    const staff = await Staff.findOne(query).lean();
    if (!staff) {
      return res.status(404).json({
        error: 'Staff not found'
      });
    }

    const response = formatStaffResponse(staff);
    res.json(response);
  } catch (error) {
    console.error('[STAFF GET ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/staff - Enroll new staff for school
 */
router.post(
  '/',
  upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'id_upload', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const schoolId = requireSchool(req, res);
      if (!schoolId) return;

      const data = req.body;

      // Validate required fields
      if (!data.first_name || !data.last_name || !data.login_password) {
        return res.status(400).json({
          error: 'first_name, last_name, and login_password are required'
        });
      }

      // Handle photo
      const photo = req.files?.photo?.[0]
        ? encodeFileToBase64(req.files['photo'][0])
        : null;

      // Handle ID upload
      const id_upload = req.files?.id_upload?.[0]
        ? encodeFileToBase64(req.files['id_upload'][0])
        : null;

      // Hash password
      const hashedPassword = await bcrypt.hash(data.login_password, 10);

      // Convert fields
      const date_joined = data.date_joined ? new Date(data.date_joined) : null;
      const dob = data.dob ? new Date(data.dob) : null;
      const experience = data.experience ? Number(data.experience) : null;

      // Normalize schoolId
      const normalizedSchoolId = mongoose.Types.ObjectId.isValid(schoolId)
        ? new mongoose.Types.ObjectId(schoolId)
        : schoolId;

      // Check for duplicate email within school
      if (data.email) {
        const existingEmail = await Staff.findOne({
          email: data.email.toLowerCase().trim(),
          schoolId: normalizedSchoolId
        });
        if (existingEmail) {
          return res.status(400).json({
            error: 'Staff with this email already exists in your school.'
          });
        }
      }

      // Check for duplicate account number within school
      if (data.account_number) {
        const existingAccount = await Staff.findOne({
          account_number: data.account_number,
          schoolId: normalizedSchoolId
        });
        if (existingAccount) {
          return res.status(400).json({
            error: 'Staff with this account number already exists in your school.'
          });
        }
      }

      // Prepare staff document
      const staffDoc = new Staff({
        ...data,
        schoolId: normalizedSchoolId,
        login_password: hashedPassword,
        photo,
        id_upload,
        date_joined: date_joined || undefined,
        dob: dob || undefined,
        experience: experience || undefined,
        email: data.email ? data.email.toLowerCase().trim() : undefined,
        login_email: data.login_email ? data.login_email.toLowerCase().trim() : undefined
      });

      await staffDoc.save();

      console.log(
        `✅ Staff created for school ${normalizedSchoolId}:`,
        staffDoc._id
      );

      res.status(201).json({
        success: true,
        message: 'Staff enrolled successfully!',
        staff: formatStaffResponse(staffDoc)
      });
    } catch (error) {
      console.error('[STAFF ENROLL ERROR]', error);

      if (error.name === 'ValidationError') {
        const msg = Object.values(error.errors)
          .map(e => e.message)
          .join('; ');
        return res.status(400).json({ error: msg });
      }

      if (error.code === 11000) {
        return res.status(400).json({
          error: 'Duplicate email or account number.'
        });
      }

      res.status(500).json({
        error: error.message || 'Unknown server error.'
      });
    }
  }
);

/**
 * PATCH /api/staff/:id - Update staff member
 */
router.patch(
  '/:id',
  upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'id_upload', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const schoolId = requireSchool(req, res);
      if (!schoolId) return;

      const normalizedSchoolId = mongoose.Types.ObjectId.isValid(schoolId)
        ? new mongoose.Types.ObjectId(schoolId)
        : schoolId;

      const query = { _id: req.params.id, schoolId: normalizedSchoolId };

      const staff = await Staff.findOne(query);
      if (!staff) {
        return res.status(404).json({
          error: 'Staff not found'
        });
      }

      const data = req.body;

      // If updating password, hash it
      if (data.login_password) {
        staff.login_password = await bcrypt.hash(data.login_password, 10);
      }

      // Handle photo
      if (req.files?.photo?.[0]) {
        staff.photo = encodeFileToBase64(req.files['photo'][0]);
      }

      // Handle ID upload
      if (req.files?.id_upload?.[0]) {
        staff.id_upload = encodeFileToBase64(req.files['id_upload'][0]);
      }

      // Convert fields
      if (data.date_joined) staff.date_joined = new Date(data.date_joined);
      if (data.dob) staff.dob = new Date(data.dob);
      if (data.experience) staff.experience = Number(data.experience);

      // Normalize email/login_email
      if (data.email) {
        data.email = data.email.toLowerCase().trim();
      }
      if (data.login_email) {
        data.login_email = data.login_email.toLowerCase().trim();
      }

      // Update all other fields except protected ones
      const protectedFields = [
        '_id',
        'id',
        'schoolId',
        'login_password',
        'photo',
        'id_upload',
        'createdAt',
        'updatedAt'
      ];

      for (const key in data) {
        if (protectedFields.includes(key)) continue;
        staff[key] = data[key];
      }

      // Check for duplicate email within school if changed
      if (data.email && data.email !== staff.email) {
        const existingEmail = await Staff.findOne({
          email: data.email,
          schoolId: normalizedSchoolId,
          _id: { $ne: staff._id }
        });
        if (existingEmail) {
          return res.status(400).json({
            error: 'Staff with this email already exists in your school.'
          });
        }
      }

      // Check for duplicate account number within school if changed
      if (data.account_number && data.account_number !== staff.account_number) {
        const existingAccount = await Staff.findOne({
          account_number: data.account_number,
          schoolId: normalizedSchoolId,
          _id: { $ne: staff._id }
        });
        if (existingAccount) {
          return res.status(400).json({
            error: 'Staff with this account number already exists in your school.'
          });
        }
      }

      await staff.save();

      console.log(
        `✅ Staff updated for school ${normalizedSchoolId}:`,
        staff._id
      );

      res.json({
        success: true,
        message: 'Staff updated successfully!',
        staff: formatStaffResponse(staff)
      });
    } catch (error) {
      console.error('[STAFF UPDATE ERROR]', error);

      if (error.name === 'ValidationError') {
        const msg = Object.values(error.errors)
          .map(e => e.message)
          .join('; ');
        return res.status(400).json({ error: msg });
      }

      if (error.code === 11000) {
        return res.status(400).json({
          error: 'Duplicate email or account number.'
        });
      }

      res.status(500).json({
        error: error.message || 'Unknown server error.'
      });
    }
  }
);

/**
 * DELETE /api/staff/:id - Delete staff member
 */
router.delete('/:id', async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const normalizedSchoolId = mongoose.Types.ObjectId.isValid(schoolId)
      ? new mongoose.Types.ObjectId(schoolId)
      : schoolId;

    const query = { _id: req.params.id, schoolId: normalizedSchoolId };

    const staff = await Staff.findOne(query);
    if (!staff) {
      return res.status(404).json({
        error: 'Staff not found'
      });
    }

    // Remove staff from classes
    if (staff.classes && staff.classes.length > 0) {
      await Class.updateMany(
        { _id: { $in: staff.classes } },
        { $pull: { teachers: staff._id } }
      );
    }

    await Staff.deleteOne({ _id: staff._id });

    console.log(
      `✅ Staff deleted for school ${normalizedSchoolId}:`,
      staff._id
    );

    res.json({
      success: true,
      message: 'Staff deleted successfully!'
    });
  } catch (error) {
    console.error('[STAFF DELETE ERROR]', error);
    res.status(500).json({
      error: error.message || 'Unknown server error.'
    });
  }
});

/**
 * PATCH /api/staff/:id/classes - Assign classes to staff
 */
router.patch('/:id/classes', async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const { classIds } = req.body;

    if (!Array.isArray(classIds)) {
      return res.status(400).json({
        error: 'classIds must be an array'
      });
    }

    const normalizedSchoolId = mongoose.Types.ObjectId.isValid(schoolId)
      ? new mongoose.Types.ObjectId(schoolId)
      : schoolId;

    // Find staff
    const staff = await Staff.findOne({
      _id: req.params.id,
      schoolId: normalizedSchoolId
    });

    if (!staff) {
      return res.status(404).json({
        error: 'Staff not found'
      });
    }

    // Validate that all classes belong to the same school
    const classes = await Class.find({
      _id: { $in: classIds },
      schoolId: normalizedSchoolId
    });

    if (classes.length !== classIds.length) {
      return res.status(400).json({
        error: 'One or more classes not found in your school or do not exist.'
      });
    }

    // Update staff's assigned classes
    staff.classes = classIds;
    await staff.save();

    // Update Class model to link to teacher as well
    await Class.updateMany(
      { _id: { $in: classIds }, schoolId: normalizedSchoolId },
      { $addToSet: { teachers: staff._id } }
    );

    console.log(
      `✅ Classes assigned to staff ${staff._id} for school ${normalizedSchoolId}`
    );

    res.json({
      success: true,
      message: 'Classes assigned to staff!',
      staff: formatStaffResponse(staff)
    });
  } catch (error) {
    console.error('[STAFF ASSIGN CLASSES ERROR]', error);
    res.status(500).json({
      error: error.message || 'Unknown server error.'
    });
  }
});

/**
 * GET /api/staff/department/:dept - Get all staff in a department for school
 */
router.get('/department/:dept', async (req, res) => {
  try {
    const schoolId = requireSchool(req, res);
    if (!schoolId) return;

    const query = addSchoolFilter(req, {
      department: new RegExp('^' + req.params.dept + '$', 'i')
    });

    const staffList = await Staff.find(
      query,
      'first_name last_name designation department photo schoolId'
    ).lean();

    const formattedStaff = staffList.map(s => ({
      id: s._id,
      first_name: s.first_name,
      last_name: s.last_name,
      designation: s.designation,
      department: s.department,
      photo_url: s.photo || null,
      schoolId: s.schoolId
    }));

    formattedStaff.sort((a, b) => {
      if (a.last_name === b.last_name) {
        return a.first_name.localeCompare(b.first_name);
      }
      return a.last_name.localeCompare(b.last_name);
    });

    res.json(formattedStaff);
  } catch (error) {
    console.error('[STAFF DEPARTMENT LIST ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
