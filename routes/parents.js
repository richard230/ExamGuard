// routes/parents.js

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
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
 * GET all parents
 */
router.get('/', async (req, res) => {
  try {
    const parents = await Parent.find({ status: 'active' })
      .populate({
        path: 'studentIds',
        select: 'firstname surname class regNo student_id',
      })
      .sort({ name: 1 });

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
      });

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

    // 🔥 FIX: resolve student_ids → ObjectIds
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
      temporaryPassword,
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
    delete parentResponse.temporaryPassword;

    res.status(201).json({
      ...parentResponse,
      temporaryPassword
    });

  } catch (error) {
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

    // 🔥 FIX: resolve here too
    if (studentIds) {
      updateData.studentIds = await resolveStudentObjectIds(studentIds);
    }

    if (req.body.password) {
      return res.status(400).json({ error: 'Use reset-password endpoint' });
    }

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
    });

    if (!updatedParent) return res.status(404).json({ error: 'Parent not found' });

    const parentResponse = updatedParent.toObject();
    delete parentResponse.password;
    delete parentResponse.temporaryPassword;

    res.json(parentResponse);

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

/**
 * RESET PASSWORD
 */
router.post('/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const parent = await Parent.findByIdAndUpdate(
      req.params.id,
      { password: hashedPassword },
      { new: true }
    );

    res.json({ message: 'Password reset successful' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
