const express = require('express');
const router = express.Router();
const multer = require('multer');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Staff = require('../models/Staff');
const Class = require('../models/Class');

const storage = multer.memoryStorage();
const upload = multer({ storage });

function getSchoolId(req) {
  return req.user?.schoolId || req.body?.schoolId || req.query?.schoolId || null;
}
function requireSchool(req, res) {
  const schoolId = getSchoolId(req);
  if (!schoolId) {
    res.status(403).json({
      error: 'School context required. Missing schoolId.'
    });
    return false;
  }
  return schoolId;
}
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
      if (!data.first_name || !data.last_name || !data.login_password) {
        return res.status(400).json({
          error: 'first_name, last_name, and login_password are required'
        });
      }
      const photo = req.files?.photo?.[0]
        ? encodeFileToBase64(req.files['photo'][0])
        : null;
      const id_upload = req.files?.id_upload?.[0]
        ? encodeFileToBase64(req.files['id_upload'][0])
        : null;
      const hashedPassword = await bcrypt.hash(data.login_password, 10);
      const date_joined = data.date_joined ? new Date(data.date_joined) : null;
      const dob = data.dob ? new Date(data.dob) : null;
      const experience = data.experience ? Number(data.experience) : null;
      const normalizedSchoolId = mongoose.Types.ObjectId.isValid(schoolId)
        ? new mongoose.Types.ObjectId(schoolId)
        : schoolId;
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
      if (data.login_password) {
        staff.login_password = await bcrypt.hash(data.login_password, 10);
      }
      if (req.files?.photo?.[0]) {
        staff.photo = encodeFileToBase64(req.files['photo'][0]);
      }
      if (req.files?.id_upload?.[0]) {
        staff.id_upload = encodeFileToBase64(req.files['id_upload'][0]);
      }
      if (data.date_joined) staff.date_joined = new Date(data.date_joined);
      if (data.dob) staff.dob = new Date(data.dob);
      if (data.experience) staff.experience = Number(data.experience);
      if (data.email) {
        data.email = data.email.toLowerCase().trim();
      }
      if (data.login_email) {
        data.login_email = data.login_email.toLowerCase().trim();
      }
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
    const staff = await Staff.findOne({
      _id: req.params.id,
      schoolId: normalizedSchoolId
    });
    if (!staff) {
      return res.status(404).json({
        error: 'Staff not found'
      });
    }
    const classes = await Class.find({
      _id: { $in: classIds },
      schoolId: normalizedSchoolId
    });
    if (classes.length !== classIds.length) {
      return res.status(400).json({
        error: 'One or more classes not found in your school or do not exist.'
      });
    }
    staff.classes = classIds;
    await staff.save();
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
