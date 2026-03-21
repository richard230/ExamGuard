const express = require('express');
const router = express.Router();
const School = require('../models/School');
const { authMiddleware } = require('./auth');
const adminAuth = require('../middleware/adminAuth');
const crypto = require('crypto');

// Validation middleware
const validateSchool = (req, res, next) => {
  const { name, abbreviation, email, location } = req.body;

  if (!name || !abbreviation || !email || !location) {
    return res.status(400).json({
      error: 'Missing required fields: name, abbreviation, email, location'
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (abbreviation.length < 2 || abbreviation.length > 5) {
    return res.status(400).json({
      error: 'Abbreviation must be 2-5 characters'
    });
  }

  next();
};

// ===== PUBLIC ENDPOINTS =====

/**
 * GET /api/schools
 * Fetch all active schools (public - limited info)
 */
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const schools = await School.find({ status: 'active' })
      .select('schoolId name abbreviation location type status')
      .limit(limit)
      .skip(skip)
      .sort({ createdAt: -1 });

    const total = await School.countDocuments({ status: 'active' });

    res.json({
      success: true,
      data: schools,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Error fetching schools:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/schools/search/:query
 * Search schools by name, abbreviation, or location
 */
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const schools = await School.find({
      $text: { $search: query },
      status: 'active'
    })
      .select('schoolId name abbreviation location type')
      .limit(10)
      .sort({ score: { $meta: 'textScore' } });

    res.json({
      success: true,
      data: schools,
      count: schools.length
    });
  } catch (err) {
    console.error('Error searching schools:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/schools/:schoolId
 * Get school by ID (public - limited info)
 */
router.get('/:schoolId', async (req, res) => {
  try {
    const school = await School.findOne({
      schoolId: req.params.schoolId,
      status: 'active'
    }).select('schoolId name abbreviation email phone location principal type');

    if (!school) {
      return res.status(404).json({ error: 'School not found' });
    }

    res.json({
      success: true,
      data: school
    });
  } catch (err) {
    console.error('Error fetching school:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== AUTHENTICATED ENDPOINTS =====

/**
 * POST /api/schools
 * Create a new school (Admin only)
 */
router.post('/', authMiddleware, adminAuth, validateSchool, async (req, res) => {
  try {
    const {
      name,
      abbreviation,
      email,
      phone,
      location,
      state,
      country,
      principal,
      type,
      description,
      website,
      registrationNumber
    } = req.body;

    // Check if email already exists
    const existingEmail = await School.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Generate unique school ID
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    const schoolId = `SCH-${abbreviation.toUpperCase()}-${random}`;

    // Check if generated ID is unique
    let school = await School.findOne({ schoolId });
    let attempts = 0;
    while (school && attempts < 5) {
      const newRandom = crypto.randomBytes(3).toString('hex').toUpperCase();
      schoolId = `SCH-${abbreviation.toUpperCase()}-${newRandom}`;
      school = await School.findOne({ schoolId });
      attempts++;
    }

    if (school) {
      return res.status(500).json({ error: 'Failed to generate unique school ID' });
    }

    // Create new school
    const newSchool = new School({
      schoolId,
      name: name.trim(),
      abbreviation: abbreviation.trim().toUpperCase(),
      email: email.toLowerCase().trim(),
      phone: phone?.trim() || null,
      location: location.trim(),
      state: state?.trim() || null,
      country: country?.trim() || 'Nigeria',
      principal: principal?.trim() || null,
      type: type?.toLowerCase() || 'secondary',
      description: description?.trim() || null,
      website: website?.trim() || null,
      registrationNumber: registrationNumber?.trim() || null,
      createdBy: req.user._id,
      status: 'active'
    });

    await newSchool.save();

    res.status(201).json({
      success: true,
      message: 'School created successfully',
      data: newSchool
    });
  } catch (err) {
    console.error('Error creating school:', err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(409).json({ error: `${field} already exists` });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/schools/admin/all
 * Get all schools with full details (Admin only)
 */
router.get('/admin/all', authMiddleware, adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const status = req.query.status || 'active';

    const query = status === 'all' ? {} : { status };

    const schools = await School.find(query)
      .populate('createdBy', 'name email')
      .populate('lastModifiedBy', 'name email')
      .limit(limit)
      .skip(skip)
      .sort({ createdAt: -1 });

    const total = await School.countDocuments(query);

    res.json({
      success: true,
      data: schools,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Error fetching schools:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/schools/:schoolId
 * Update school details (Admin only)
 */
router.put('/:schoolId', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { schoolId } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated
    delete updates.schoolId;
    delete updates.apiKey;
    delete updates.createdBy;
    delete updates.createdAt;
    delete updates.isDeleted;
    delete updates.deletedAt;
    delete updates.deletedBy;

    // Validate email if provided
    if (updates.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      updates.email = updates.email.toLowerCase();

      // Check if email is already used by another school
      const existing = await School.findOne({
        email: updates.email,
        schoolId: { $ne: schoolId }
      });
      if (existing) {
        return res.status(409).json({ error: 'Email already in use' });
      }
    }

    updates.lastModified = new Date();
    updates.lastModifiedBy = req.user._id;

    const school = await School.findOneAndUpdate(
      { schoolId },
      updates,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email');

    if (!school) {
      return res.status(404).json({ error: 'School not found' });
    }

    res.json({
      success: true,
      message: 'School updated successfully',
      data: school
    });
  } catch (err) {
    console.error('Error updating school:', err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(409).json({ error: `${field} already exists` });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/schools/:schoolId
 * Soft delete a school (Admin only)
 */
router.delete('/:schoolId', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { schoolId } = req.params;

    const school = await School.findOne({ schoolId });
    if (!school) {
      return res.status(404).json({ error: 'School not found' });
    }

    await school.softDelete(req.user._id);

    res.json({
      success: true,
      message: 'School deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting school:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/schools/:schoolId/generate-api-key
 * Generate API key for a school (Admin only)
 */
router.post('/:schoolId/generate-api-key', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { schoolId } = req.params;

    const school = await School.findOne({ schoolId });
    if (!school) {
      return res.status(404).json({ error: 'School not found' });
    }

    const apiKey = school.generateApiKey();
    school.isApiEnabled = true;
    await school.save();

    res.json({
      success: true,
      message: 'API key generated successfully',
      data: {
        schoolId: school.schoolId,
        apiKey,
        isApiEnabled: true
      }
    });
  } catch (err) {
    console.error('Error generating API key:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/schools/:schoolId/stats
 * Get school statistics (Admin only)
 */
router.get('/:schoolId/stats', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { schoolId } = req.params;

    const school = await School.findOne({ schoolId });
    if (!school) {
      return res.status(404).json({ error: 'School not found' });
    }

    // Get counts from related collections
    const Student = require('../models/Student');
    const Staff = require('../models/Staff');

    const totalStudents = await Student.countDocuments({ school: school._id });
    const totalStaff = await Staff.countDocuments({ school: school._id });

    res.json({
      success: true,
      data: {
        schoolId: school.schoolId,
        name: school.name,
        totalStudents,
        totalStaff,
        status: school.status,
        createdAt: school.createdAt,
        lastModified: school.lastModified
      }
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/schools/bulk-import
 * Bulk import schools from CSV/JSON (Admin only)
 */
router.post('/bulk-import', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { schools } = req.body;

    if (!Array.isArray(schools) || schools.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty schools array' });
    }

    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };

    for (let i = 0; i < schools.length; i++) {
      try {
        const schoolData = schools[i];

        if (!schoolData.name || !schoolData.abbreviation || !schoolData.email || !schoolData.location) {
          results.errors.push({
            row: i + 1,
            error: 'Missing required fields: name, abbreviation, email, location'
          });
          results.failed++;
          continue;
        }

        // Check if email exists
        const existing = await School.findOne({ email: schoolData.email.toLowerCase() });
        if (existing) {
          results.errors.push({
            row: i + 1,
            error: 'Email already exists'
          });
          results.failed++;
          continue;
        }

        // Generate school ID
        const random = crypto.randomBytes(3).toString('hex').toUpperCase();
        const schoolId = `SCH-${schoolData.abbreviation.toUpperCase()}-${random}`;

        const newSchool = new School({
          schoolId,
          name: schoolData.name.trim(),
          abbreviation: schoolData.abbreviation.trim().toUpperCase(),
          email: schoolData.email.toLowerCase().trim(),
          phone: schoolData.phone?.trim() || null,
          location: schoolData.location.trim(),
          state: schoolData.state?.trim() || null,
          country: schoolData.country?.trim() || 'Nigeria',
          principal: schoolData.principal?.trim() || null,
          type: schoolData.type?.toLowerCase() || 'secondary',
          description: schoolData.description?.trim() || null,
          createdBy: req.user._id,
          status: 'active'
        });

        await newSchool.save();
        results.successful++;
      } catch (err) {
        results.errors.push({
          row: i + 1,
          error: err.message
        });
        results.failed++;
      }
    }

    res.json({
      success: true,
      message: `Import completed: ${results.successful} successful, ${results.failed} failed`,
      data: results
    });
  } catch (err) {
    console.error('Error in bulk import:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
