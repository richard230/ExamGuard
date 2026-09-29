const express = require('express');
const router = express.Router();
const multer = require('multer');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Staff = require('../models/Staff');
const Class = require('../models/Class');
const { authMiddleware } = require('../middleware/auth');

const storage = multer.memoryStorage();
const upload = multer({ storage });

// All staff routes are authenticated and strictly tenant-scoped.
router.use(authMiddleware);

function getAuthenticatedSchoolId(req, res) {
  const schoolId = req.user?.schoolId;
  if (!schoolId) {
    res.status(403).json({ success: false, error: 'Your account is not associated with a school.' });
    return null;
  }
  return schoolId;
}

/**
 * GET /api/staff - Return all staff for the authenticated school (summary)
 */
router.get('/', async (req, res) => {
  try {
    const schoolId = getAuthenticatedSchoolId(req, res);
    if (!schoolId) return;

    const staffList = await Staff.find(
      { schoolId },
      'first_name last_name designation department photo schoolId'
    ).lean();

    const formattedStaff = staffList.map(s => ({
      id: s._id,
      first_name: s.first_name,
      last_name: s.last_name,
      designation: s.designation,
      department: s.department,
      photo_url: s.photo || null
    }));

    formattedStaff.sort((a, b) => {
      if (a.last_name === b.last_name) {
        return a.first_name.localeCompare(b.first_name);
      }
      return a.last_name.localeCompare(b.last_name);
    });

    res.json(formattedStaff);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * FILTERED ENDPOINTS for each special staff section
 */
const departments = [
  { route: 'bursary', dep: 'Bursary' },
  { route: 'registrar', dep: 'Registrar' },
  { route: 'general', dep: 'General' },
  { route: 'librarian', dep: 'Library' },
  { route: 'hostel', dep: 'Hostel' },
  { route: 'transport', dep: 'Transport' }
];

departments.forEach(({ route, dep }) => {
  // GET /api/staff/bursary etc.
  router.get(`/${route}`, async (req, res) => {
    try {
      const schoolId = getAuthenticatedSchoolId(req, res);
      if (!schoolId) return;

      const staffList = await Staff.find(
        { schoolId, department: new RegExp('^' + dep + '$', 'i') },
        'first_name last_name designation department photo schoolId'
      ).lean();

      const formattedStaff = staffList.map(s => ({
        id: s._id,
        first_name: s.first_name,
        last_name: s.last_name,
        designation: s.designation,
        department: s.department,
        photo_url: s.photo || null
      }));

      formattedStaff.sort((a, b) => {
        if (a.last_name === b.last_name) {
          return a.first_name.localeCompare(b.first_name);
        }
        return a.last_name.localeCompare(b.last_name);
      });

      res.json(formattedStaff);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/staff/bursary/:id
  router.patch(
    `/${route}/:id`,
    upload.fields([
      { name: 'photo', maxCount: 1 },
      { name: 'id_upload', maxCount: 1 }
    ]),
    async (req, res) => {
      req.body = req.body || {};
      req.body.department = dep; // enforce correct department
      return updateStaffById(req, res);
    }
  );

  // DELETE /api/staff/bursary/:id
  router.delete(`/${route}/:id`, async (req, res) => {
    return deleteStaffById(req, res);
  });
});

/**
 * PATCH /api/staff/:id/classes - Assign classes to teacher
 */
router.patch('/:id/classes', async (req, res) => {
  const schoolId = getAuthenticatedSchoolId(req, res);
  if (!schoolId) return;

  const staffId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(staffId)) {
    return res.status(400).json({ error: 'Invalid staff ID format.' });
  }

  const { classIds } = req.body;
  if (!Array.isArray(classIds)) {
    return res.status(400).json({ error: 'classIds must be an array' });
  }

  try {
    const staff = await Staff.findOne({ _id: staffId, schoolId });
    if (!staff) {
      return res.status(404).json({ error: 'Staff not found in your school.' });
    }

    const uniqueClassIds = [...new Set(classIds)];
    const validClasses = await Class.find({ _id: { $in: uniqueClassIds }, schoolId }).select('_id').lean();

    if (validClasses.length !== uniqueClassIds.length) {
      return res.status(403).json({ error: 'One or more selected classes do not belong to your school.' });
    }

    const validClassIds = validClasses.map(c => c._id);
    staff.classes = validClassIds;
    await staff.save();

    // Pull teacher from all classes first to keep relationship in sync
    await Class.updateMany(
      { schoolId, teachers: staffId },
      { $pull: { teachers: staffId } }
    );

    // Push teacher into newly assigned classes
    if (validClassIds.length > 0) {
      await Class.updateMany(
        { _id: { $in: validClassIds }, schoolId },
        { $addToSet: { teachers: staffId } }
      );
    }

    res.json({ message: 'Classes assigned to teacher!', staff });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/staff/:id - Return full details for a staff member
 */
router.get('/:id', async (req, res) => {
  try {
    const schoolId = getAuthenticatedSchoolId(req, res);
    if (!schoolId) return;

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid staff ID format.' });
    }

    const staff = await Staff.findOne({ _id: req.params.id, schoolId }).lean();
    if (!staff) return res.status(404).json({ error: 'Staff not found' });

    staff.photo_url = staff.photo || null;
    staff.id_upload_url = staff.id_upload || null;
    delete staff.photo;
    delete staff.id_upload;
    delete staff.login_password;

    res.json({ id: staff._id, ...staff });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/staff - Enroll new staff into the authenticated school
 */
router.post(
  '/',
  upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'id_upload', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const schoolId = getAuthenticatedSchoolId(req, res);
      if (!schoolId) return;

      const data = { ...req.body };
      delete data.schoolId;
      data.schoolId = schoolId;

      if (!data.login_password) {
        return res.status(400).json({ error: 'login_password is required.' });
      }

      let photo;
      if (req.files?.['photo']?.[0]) {
        const file = req.files['photo'][0];
        photo = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      }

      let id_upload;
      if (req.files?.['id_upload']?.[0]) {
        const file = req.files['id_upload'][0];
        id_upload = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      }

      const hashedPassword = await bcrypt.hash(data.login_password, 10);

      const date_joined = data.date_joined ? new Date(data.date_joined) : undefined;
      const dob = data.dob ? new Date(data.dob) : undefined;
      const experience =
        data.experience !== undefined && data.experience !== null && data.experience !== ''
          ? Number(data.experience)
          : undefined;

      // Ensure data.email exists before querying to avoid matching arbitrary records
      if (data.email && (await Staff.findOne({ schoolId, email: data.email }))) {
        return res.status(400).json({ error: 'Duplicate email.' });
      }

      if (data.account_number && (await Staff.findOne({ schoolId, account_number: data.account_number }))) {
        return res.status(400).json({ error: 'Duplicate account number.' });
      }

      const staffDoc = new Staff({
        ...data,
        login_password: hashedPassword,
        photo,
        id_upload,
        date_joined,
        dob,
        experience
      });

      await staffDoc.save();
      res.status(201).json({ message: 'Staff enrolled successfully!' });
    } catch (error) {
      console.error('[STAFF ENROLL ERROR]', error);
      if (error.name === 'ValidationError') {
        let msg = error.message;
        if (error.errors) {
          msg = Object.values(error.errors).map(e => e.message).join('; ');
        }
        return res.status(400).json({ error: msg });
      }
      if (error.code === 11000) {
        return res.status(400).json({ error: 'Duplicate email or account number.' });
      }
      res.status(500).json({ error: error.message || 'Unknown server error.' });
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
  updateStaffById
);

/**
 * DELETE /api/staff/:id - Delete staff member
 */
router.delete('/:id', deleteStaffById);

// --- Helper functions for PATCH/DELETE ---

async function updateStaffById(req, res) {
  try {
    const schoolId = getAuthenticatedSchoolId(req, res);
    if (!schoolId) return;

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid staff ID format.' });
    }

    const staff = await Staff.findOne({ _id: id, schoolId });
    if (!staff) {
      return res.status(404).json({ error: 'Staff not found in your school.' });
    }

    const data = { ...req.body };
    delete data.schoolId;

    if (data.login_password) {
      staff.login_password = await bcrypt.hash(data.login_password, 10);
    }

    if (req.files?.['photo']?.[0]) {
      const file = req.files['photo'][0];
      staff.photo = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    }

    if (req.files?.['id_upload']?.[0]) {
      const file = req.files['id_upload'][0];
      staff.id_upload = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    }

    if (data.date_joined) staff.date_joined = new Date(data.date_joined);
    if (data.dob) staff.dob = new Date(data.dob);
    if (data.experience !== undefined && data.experience !== null && data.experience !== '') {
      staff.experience = Number(data.experience);
    }

    const protectedFields = ['_id', 'id', 'login_password', 'photo', 'id_upload', 'createdAt', 'updatedAt'];
    for (const key in data) {
      if (protectedFields.includes(key)) continue;
      staff[key] = data[key];
    }

    if (data.email && data.email !== staff.email) {
      if (await Staff.findOne({ schoolId, email: data.email, _id: { $ne: staff._id } })) {
        return res.status(400).json({ error: 'Duplicate email.' });
      }
    }

    if (data.account_number && data.account_number !== staff.account_number) {
      if (await Staff.findOne({ schoolId, account_number: data.account_number, _id: { $ne: staff._id } })) {
        return res.status(400).json({ error: 'Duplicate account number.' });
      }
    }

    await staff.save();
    res.json({ message: 'Staff updated successfully!' });
  } catch (error) {
    console.error('[STAFF UPDATE ERROR]', error);
    if (error.name === 'ValidationError') {
      let msg = error.message;
      if (error.errors) {
        msg = Object.values(error.errors).map(e => e.message).join('; ');
      }
      return res.status(400).json({ error: msg });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Duplicate email or account number.' });
    }
    res.status(500).json({ error: error.message || 'Unknown server error.' });
  }
}

async function deleteStaffById(req, res) {
  try {
    const schoolId = getAuthenticatedSchoolId(req, res);
    if (!schoolId) return;

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid staff ID format.' });
    }

    const staff = await Staff.findOne({ _id: id, schoolId });
    if (!staff) {
      return res.status(404).json({ error: 'Staff not found in your school.' });
    }

    await Staff.deleteOne({ _id: id, schoolId });
    res.json({ message: 'Staff deleted successfully!' });
  } catch (error) {
    console.error('[STAFF DELETE ERROR]', error);
    res.status(500).json({ error: error.message || 'Unknown server error.' });
  }
}

module.exports = router;
