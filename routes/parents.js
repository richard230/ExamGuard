const express = require('express');
const router = express.Router();
const Parent = require('../models/Parent');
const Student = require('../models/Student');
const bcrypt = require('bcryptjs');

/**
 * GET all parents (Admin only)
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const parents = await Parent.find(query)
      .select('-password -temporaryPassword')
      .populate('studentIds', 'firstName lastName className')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip(skip);

    const total = await Parent.countDocuments(query);

    res.json({
      data: parents,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
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
      .select('-password -temporaryPassword')
      .populate('studentIds', 'firstName lastName className email');
    
    if (!parent) return res.status(404).json({ error: 'Parent not found' });
    res.json(parent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET logged-in parent profile
 */
router.get('/me/profile', async (req, res) => {
  try {
    const parent = await Parent.findById(req.user.id)
      .select('-password -temporaryPassword')
      .populate('studentIds', 'firstName lastName className');
    
    if (!parent) return res.status(404).json({ error: 'Parent not found' });
    res.json(parent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET parent's assigned students
 */
router.get('/me/students', async (req, res) => {
  try {
    const parent = await Parent.findById(req.user.id).populate('studentIds');
    
    if (!parent) return res.status(404).json({ error: 'Parent not found' });
    
    res.json(parent.studentIds || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * CREATE parent (Admin only)
 */
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, address, occupation, emergencyContactName, emergencyContactPhone, families, studentIds } = req.body;

    // Check if email already exists
    const existingParent = await Parent.findOne({ email: email.toLowerCase() });
    if (existingParent) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Generate temporary password
    const tempPassword = generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const parent = await Parent.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone,
      address,
      occupation,
      emergencyContactName,
      emergencyContactPhone,
      families,
      studentIds: studentIds || [],
      password: hashedPassword,
      temporaryPassword: tempPassword,
      role: 'parent',
      status: 'active'
    });

    // Populate student information in response
    await parent.populate('studentIds', 'firstName lastName className');

    // Don't send password in response
    const responseData = parent.toObject();
    delete responseData.password;
    delete responseData.temporaryPassword;

    res.status(201).json({
      ...responseData,
      temporaryPassword: tempPassword // Send only once during creation
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * UPDATE parent (Admin or self)
 */
router.patch('/:id', async (req, res) => {
  try {
    const { name, phone, address, occupation, emergencyContactName, emergencyContactPhone, families, studentIds, status } = req.body;

    // Check authorization
    if (req.user.id !== req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const updateData = {};
    
    if (name) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (occupation !== undefined) updateData.occupation = occupation;
    if (emergencyContactName !== undefined) updateData.emergencyContactName = emergencyContactName;
    if (emergencyContactPhone !== undefined) updateData.emergencyContactPhone = emergencyContactPhone;
    if (families !== undefined) updateData.families = families;
    if (studentIds !== undefined) updateData.studentIds = studentIds;
    
    // Only admin can change status
    if (status && req.user.role === 'admin') {
      updateData.status = status;
    }

    const parent = await Parent.findByIdAndUpdate(req.params.id, updateData, { new: true })
      .select('-password -temporaryPassword')
      .populate('studentIds', 'firstName lastName className');
    
    if (!parent) return res.status(404).json({ error: 'Parent not found' });
    
    res.json(parent);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * UPDATE parent profile (Self only)
 */
router.patch('/me/profile', async (req, res) => {
  try {
    const { name, phone, address, occupation, emergencyContactName, emergencyContactPhone, profilePhoto } = req.body;

    const updateData = {};
    
    if (name) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (occupation !== undefined) updateData.occupation = occupation;
    if (emergencyContactName !== undefined) updateData.emergencyContactName = emergencyContactName;
    if (emergencyContactPhone !== undefined) updateData.emergencyContactPhone = emergencyContactPhone;
    if (profilePhoto !== undefined) updateData.profilePhoto = profilePhoto;

    const parent = await Parent.findByIdAndUpdate(req.user.id, updateData, { new: true })
      .select('-password -temporaryPassword')
      .populate('studentIds', 'firstName lastName className');
    
    if (!parent) return res.status(404).json({ error: 'Parent not found' });
    
    res.json(parent);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * ASSIGN students to parent
 */
router.post('/:id/assign-students', async (req, res) => {
  try {
    const { studentIds } = req.body;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'Student IDs must be a non-empty array' });
    }

    // Verify all students exist
    const students = await Student.find({ _id: { $in: studentIds } });
    if (students.length !== studentIds.length) {
      return res.status(400).json({ error: 'One or more students not found' });
    }

    const parent = await Parent.findByIdAndUpdate(
      req.params.id,
      { studentIds },
      { new: true }
    ).populate('studentIds', 'firstName lastName className');

    if (!parent) return res.status(404).json({ error: 'Parent not found' });
    
    res.json(parent);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * CHANGE parent password
 */
router.post('/:id/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Check authorization
    if (req.user.id !== req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const parent = await Parent.findById(req.params.id).select('+password');
    
    if (!parent) return res.status(404).json({ error: 'Parent not found' });

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, parent.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    parent.password = hashedPassword;
    parent.temporaryPassword = null;
    await parent.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * RESET parent password (Admin only)
 */
router.post('/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;

    const tempPassword = newPassword || generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const parent = await Parent.findByIdAndUpdate(
      req.params.id,
      { 
        password: hashedPassword,
        temporaryPassword: tempPassword
      },
      { new: true }
    ).select('-password');

    if (!parent) return res.status(404).json({ error: 'Parent not found' });
    
    res.json({
      message: 'Password reset successfully',
      temporaryPassword: tempPassword
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE parent (Admin only)
 */
router.delete('/:id', async (req, res) => {
  try {
    const parent = await Parent.findByIdAndDelete(req.params.id);
    
    if (!parent) return res.status(404).json({ error: 'Parent not found' });
    
    res.json({ message: 'Parent deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET parent by student ID (Find parent(s) of a student)
 */
router.get('/student/:studentId', async (req, res) => {
  try {
    const parents = await Parent.find({ studentIds: req.params.studentId })
      .select('-password -temporaryPassword')
      .populate('studentIds', 'firstName lastName className');
    
    res.json(parents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * UPDATE notification preferences
 */
router.patch('/:id/notifications', async (req, res) => {
  try {
    const { email, sms, inApp } = req.body;

    // Check authorization
    if (req.user.id !== req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const notificationPreferences = {};
    if (email !== undefined) notificationPreferences.email = email;
    if (sms !== undefined) notificationPreferences.sms = sms;
    if (inApp !== undefined) notificationPreferences.inApp = inApp;

    const parent = await Parent.findByIdAndUpdate(
      req.params.id,
      { notificationPreferences },
      { new: true }
    ).select('-password -temporaryPassword');

    if (!parent) return res.status(404).json({ error: 'Parent not found' });
    
    res.json(parent);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Helper function to generate temporary password
 */
function generateTemporaryPassword() {
  const length = 12;
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

module.exports = router;
