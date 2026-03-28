const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const Parent = require('../models/Parent');

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
 * GET all parents
 */
router.get('/', async (req, res) => {
  try {
    const parents = await Parent.find()
      .populate('studentIds', 'firstname surname class regNo')
      .sort({ name: 1 });
    res.json(parents);
  } catch (error) {
    console.error('Error fetching parents:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET parent by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const parent = await Parent.findById(req.params.id)
      .populate('studentIds', 'firstname surname class regNo');
    if (!parent) return res.status(404).json({ error: 'Parent not found' });
    res.json(parent);
  } catch (error) {
    console.error('Error fetching parent:', error);
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

    // Validation
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    if (!studentIds || studentIds.length === 0) {
      return res.status(400).json({ error: 'At least one student must be assigned' });
    }

    // Check if email already exists
    const existingParent = await Parent.findOne({ email: email.toLowerCase() });
    if (existingParent) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Generate temporary password
    const temporaryPassword = generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    const parentData = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone ? phone.trim() : '',
      address: address ? address.trim() : '',
      occupation: occupation ? occupation.trim() : '',
      emergencyContactName: emergencyContactName ? emergencyContactName.trim() : '',
      emergencyContactPhone: emergencyContactPhone ? emergencyContactPhone.trim() : '',
      families: Array.isArray(families) ? families.filter(f => f.trim()) : [],
      studentIds: Array.isArray(studentIds) ? studentIds : [studentIds],
      password: hashedPassword,
      temporaryPassword: temporaryPassword,
      role: 'parent',
      status: 'active'
    };

    const parent = await Parent.create(parentData);

    // Return parent data without sensitive fields
    const parentResponse = parent.toObject();
    delete parentResponse.password;
    delete parentResponse.temporaryPassword;

    res.status(201).json({
      ...parentResponse,
      temporaryPassword: temporaryPassword // Only return on creation for sharing with parent
    });
  } catch (error) {
    console.error('Error creating parent:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Email already registered' });
    }
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

    // Build update object
    const updateData = {};

    if (name) updateData.name = name.trim();
    if (email) updateData.email = email.toLowerCase().trim();
    if (phone !== undefined) updateData.phone = phone ? phone.trim() : '';
    if (address !== undefined) updateData.address = address ? address.trim() : '';
    if (occupation !== undefined) updateData.occupation = occupation ? occupation.trim() : '';
    if (emergencyContactName !== undefined) updateData.emergencyContactName = emergencyContactName ? emergencyContactName.trim() : '';
    if (emergencyContactPhone !== undefined) updateData.emergencyContactPhone = emergencyContactPhone ? emergencyContactPhone.trim() : '';
    if (families) updateData.families = Array.isArray(families) ? families.filter(f => f.trim()) : [];
    if (studentIds) updateData.studentIds = Array.isArray(studentIds) ? studentIds : [studentIds];

    // Prevent direct password updates via PATCH
    if (req.body.password) {
      return res.status(400).json({ error: 'Use reset-password endpoint to change password' });
    }

    // Check if email is unique (if changing)
    if (email) {
      const parent = await Parent.findById(req.params.id);
      if (parent && parent.email !== email.toLowerCase()) {
        const existingEmail = await Parent.findOne({ email: email.toLowerCase() });
        if (existingEmail) {
          return res.status(400).json({ error: 'Email already registered' });
        }
      }
    }

    const updatedParent = await Parent.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    ).populate('studentIds', 'firstname surname class regNo');

    if (!updatedParent) return res.status(404).json({ error: 'Parent not found' });

    const parentResponse = updatedParent.toObject();
    delete parentResponse.password;
    delete parentResponse.temporaryPassword;

    res.json(parentResponse);
  } catch (error) {
    console.error('Error updating parent:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Email already registered' });
    }
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
    res.json({ message: 'Parent deleted successfully!' });
  } catch (error) {
    console.error('Error deleting parent:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * RESET parent password
 */
router.post('/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const parent = await Parent.findByIdAndUpdate(
      req.params.id,
      {
        password: hashedPassword,
        temporaryPassword: newPassword
      },
      { new: true }
    );

    if (!parent) return res.status(404).json({ error: 'Parent not found' });

    const parentResponse = parent.toObject();
    delete parentResponse.password;
    delete parentResponse.temporaryPassword;

    res.json({
      message: 'Password reset successfully',
      ...parentResponse
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
