const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');
const { authMiddleware } = require('./auth');

/**
 * GET: List all API keys
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Accept schoolId from query or use a default for demo
    let schoolId = req.query.schoolId || req.body.schoolId || 'examguard-international-school';

    const keys = await ApiKey.find({ school: schoolId })
      .select('-keyHash')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: keys.length,
      data: keys
    });
  } catch (err) {
    console.error('Get API keys error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET: Single API key details
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const key = await ApiKey.findById(req.params.id)
      .select('-keyHash -key')
      .populate('createdBy', 'name email');

    if (!key) {
      return res.status(404).json({ error: 'API key not found' });
    }

    res.json({
      success: true,
      data: key
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST: Create new API key
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { 
      name, 
      description, 
      permissions, 
      expiresAt, 
      rateLimit, 
      schoolId 
    } = req.body;

    // Use provided schoolId or default
    const finalSchoolId = schoolId || 'examguard-international-school';

    if (!name) {
      return res.status(400).json({ error: 'Key name is required' });
    }

    if (!permissions || permissions.length === 0) {
      return res.status(400).json({ error: 'At least one permission is required' });
    }

    // Generate new key
    const plainKey = ApiKey.generateKey();
    const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');

    const apiKey = new ApiKey({
      name,
      school: finalSchoolId,
      key: plainKey,
      keyHash,
      description: description || '',
      permissions,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      rateLimit: rateLimit || { requestsPerHour: 1000, requestsPerDay: 10000 },
      createdBy: req.user._id,
      status: 'active'
    });

    await apiKey.save();

    console.log('API Key created:', {
      id: apiKey._id,
      name: apiKey.name,
      school: apiKey.school,
      createdBy: req.user._id
    });

    // Return the plaintext key (only shown once)
    res.status(201).json({
      success: true,
      message: 'API key created successfully. Save this key securely, it will not be shown again.',
      data: {
        _id: apiKey._id,
        name: apiKey.name,
        key: plainKey, // Only returned on creation
        created_at: apiKey.createdAt,
        expires_at: apiKey.expiresAt,
        permissions: apiKey.permissions,
        rateLimit: apiKey.rateLimit,
        status: apiKey.status,
        usage: apiKey.usage
      }
    });
  } catch (err) {
    console.error('Create API key error:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message,
      details: err.toString()
    });
  }
});

/**
 * PATCH: Update API key
 */
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, description, status, permissions, rateLimit } = req.body;

    const apiKey = await ApiKey.findById(req.params.id);
    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    if (name) apiKey.name = name;
    if (description !== undefined) apiKey.description = description;
    if (status) apiKey.status = status;
    if (permissions) apiKey.permissions = permissions;
    if (rateLimit) {
      apiKey.rateLimit = { ...apiKey.rateLimit, ...rateLimit };
    }

    await apiKey.save();

    res.json({
      success: true,
      message: 'API key updated successfully',
      data: apiKey
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST: Rotate API key
 */
router.post('/:id/rotate', authMiddleware, async (req, res) => {
  try {
    const oldKey = await ApiKey.findById(req.params.id);
    if (!oldKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    // Generate new key
    const plainKey = ApiKey.generateKey();
    const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');

    oldKey.key = plainKey;
    oldKey.keyHash = keyHash;
    oldKey.lastRotatedAt = new Date();

    await oldKey.save();

    console.log('API Key rotated:', {
      id: oldKey._id,
      name: oldKey.name,
      rotatedAt: oldKey.lastRotatedAt
    });

    res.json({
      success: true,
      message: 'API key rotated successfully',
      data: {
        _id: oldKey._id,
        name: oldKey.name,
        key: plainKey,
        rotated_at: oldKey.lastRotatedAt,
        permissions: oldKey.permissions,
        rateLimit: oldKey.rateLimit,
        status: oldKey.status,
        usage: oldKey.usage
      }
    });
  } catch (err) {
    console.error('Rotate API key error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE: Delete API key
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const apiKey = await ApiKey.findByIdAndDelete(req.params.id);
    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    console.log('API Key deleted:', {
      id: apiKey._id,
      name: apiKey.name
    });

    res.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST: Deactivate API key
 */
router.post('/:id/deactivate', authMiddleware, async (req, res) => {
  try {
    const apiKey = await ApiKey.findById(req.params.id);
    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    apiKey.status = 'inactive';
    await apiKey.save();

    console.log('API Key deactivated:', {
      id: apiKey._id,
      name: apiKey.name
    });

    res.json({
      success: true,
      message: 'API key deactivated',
      data: apiKey
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST: Reactivate API key
 */
router.post('/:id/activate', authMiddleware, async (req, res) => {
  try {
    const apiKey = await ApiKey.findById(req.params.id);
    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    apiKey.status = 'active';
    await apiKey.save();

    res.json({
      success: true,
      message: 'API key activated',
      data: apiKey
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
