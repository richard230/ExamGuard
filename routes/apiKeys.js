const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');
const { authMiddleware } = require('./auth');
const adminAuth = require('../middleware/adminAuth');

/**
 * GET: List all API keys for a school
 */
router.get('/', authMiddleware, adminAuth, async (req, res) => {
  try {
    const schoolId = req.user.school || req.query.schoolId;
    
    if (!schoolId) {
      return res.status(400).json({ error: 'School ID required' });
    }

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
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET: Single API key details
 */
router.get('/:id', authMiddleware, adminAuth, async (req, res) => {
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
router.post('/', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { name, description, permissions, expiresAt, rateLimit } = req.body;
    const schoolId = req.user.school || req.body.schoolId;

    if (!schoolId || !name) {
      return res.status(400).json({ error: 'School ID and name are required' });
    }

    // Generate new key
    const plainKey = ApiKey.generateKey();
    const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');

    const apiKey = new ApiKey({
      name,
      school: schoolId,
      key: plainKey,
      keyHash,
      description,
      permissions: permissions || ['results.upload', 'results.read'],
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      rateLimit: rateLimit || { requestsPerHour: 1000, requestsPerDay: 10000 },
      createdBy: req.user._id
    });

    await apiKey.save();

    // Return the plaintext key (only shown once)
    res.status(201).json({
      success: true,
      message: 'API key created successfully. Save this key securely, it will not be shown again.',
      data: {
        id: apiKey._id,
        name: apiKey.name,
        key: plainKey, // Only returned on creation
        created_at: apiKey.createdAt,
        expires_at: apiKey.expiresAt
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH: Update API key
 */
router.patch('/:id', authMiddleware, adminAuth, async (req, res) => {
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
 * POST: Rotate API key (revoke old, create new)
 */
router.post('/:id/rotate', authMiddleware, adminAuth, async (req, res) => {
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

    res.json({
      success: true,
      message: 'API key rotated successfully',
      data: {
        id: oldKey._id,
        name: oldKey.name,
        key: plainKey,
        rotated_at: oldKey.lastRotatedAt
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE: Revoke API key
 */
router.delete('/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const apiKey = await ApiKey.findByIdAndDelete(req.params.id);
    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    res.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST: Deactivate key without deletion
 */
router.post('/:id/deactivate', authMiddleware, adminAuth, async (req, res) => {
  try {
    const apiKey = await ApiKey.findByIdAndUpdate(
      req.params.id,
      { status: 'inactive' },
      { new: true }
    );

    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    res.json({
      success: true,
      message: 'API key deactivated',
      data: apiKey
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
