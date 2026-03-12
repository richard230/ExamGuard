const express = require('express');
const router = express.Router();
const School = require('../models/School');
const DemoRequest = require('../models/DemoRequest');
const { authMiddleware } = require('./auth');
const adminAuth = require('../middleware/adminAuth');

/* ================= ADMIN ROUTES ================= */

// Get all schools (Admin)
router.get('/', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { status, subscriptionStatus, search, page = 1, limit = 10 } = req.query;

    let query = {};

    if (status) {
      query.status = status;
    }

    if (subscriptionStatus) {
      query.subscriptionStatus = subscriptionStatus;
    }

    if (search) {
      query.$or = [
        { schoolName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const schools = await School.find(query)
      .populate('accountManager', 'fullName email')
      .populate('demoRequestId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await School.countDocuments(query);

    res.json({
      success: true,
      data: schools,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching schools:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching schools'
    });
  }
});

// Get single school details (Admin)
router.get('/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await School.findById(req.params.id)
      .populate('accountManager', 'fullName email')
      .populate('demoRequestId');

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    res.json({
      success: true,
      data: school
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching school details'
    });
  }
});

// Create new school from approved demo request (Admin)
router.post('/from-request/:requestId', authMiddleware, adminAuth, async (req, res) => {
  try {
    const demoRequest = await DemoRequest.findById(req.params.requestId);

    if (!demoRequest || demoRequest.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Invalid or non-approved demo request'
      });
    }

    // Check if school already exists
    const existingSchool = await School.findOne({ email: demoRequest.email });
    if (existingSchool) {
      return res.status(400).json({
        success: false,
        message: 'School with this email already exists'
      });
    }

    const newSchool = new School({
      schoolName: demoRequest.schoolName,
      schoolType: demoRequest.schoolType,
      studentCount: parseInt(demoRequest.studentCount.split('-')[0]) || 0,
      country: demoRequest.country,
      email: demoRequest.email,
      phone: demoRequest.phone,
      website: demoRequest.schoolWebsite,
      adminName: demoRequest.fullName,
      adminEmail: demoRequest.email,
      adminPhone: demoRequest.phone,
      demoRequestId: demoRequest._id,
      accountManager: req.user._id,
      subscriptionStatus: 'trial',
      featuresEnabled: {
        studentManagement: demoRequest.needs.includes('student-management'),
        grading: demoRequest.needs.includes('grading'),
        feeManagement: demoRequest.needs.includes('fee-management'),
        attendance: demoRequest.needs.includes('attendance'),
        parentPortal: demoRequest.needs.includes('parent-portal'),
        staffManagement: demoRequest.needs.includes('staff-management'),
        analytics: demoRequest.needs.includes('analytics'),
        mobileApps: demoRequest.needs.includes('mobile-apps')
      }
    });

    await newSchool.save();

    res.status(201).json({
      success: true,
      message: 'School created successfully from demo request',
      data: newSchool
    });

  } catch (error) {
    console.error('Error creating school:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating school'
    });
  }
});

// Update school details (Admin)
router.patch('/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { schoolName, studentCount, staffCount, status, subscriptionPlan, subscriptionStatus, internalNotes } = req.body;

    const updateData = {};
    if (schoolName) updateData.schoolName = schoolName;
    if (studentCount) updateData.studentCount = studentCount;
    if (staffCount) updateData.staffCount = staffCount;
    if (status) updateData.status = status;
    if (subscriptionPlan) updateData.subscriptionPlan = subscriptionPlan;
    if (subscriptionStatus) updateData.subscriptionStatus = subscriptionStatus;
    if (internalNotes) updateData.internalNotes = internalNotes;

    const school = await School.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    res.json({
      success: true,
      message: 'School updated successfully',
      data: school
    });

  } catch (error) {
    console.error('Error updating school:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating school'
    });
  }
});

// Update school subscription (Admin)
router.patch('/:id/subscription', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { subscriptionPlan, subscriptionStatus, subscriptionEndDate } = req.body;

    const school = await School.findByIdAndUpdate(
      req.params.id,
      {
        subscriptionPlan,
        subscriptionStatus,
        subscriptionEndDate: subscriptionEndDate ? new Date(subscriptionEndDate) : undefined
      },
      { new: true }
    );

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    res.json({
      success: true,
      message: 'Subscription updated successfully',
      data: school
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating subscription'
    });
  }
});

// Update school features (Admin)
router.patch('/:id/features', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { features } = req.body;

    const school = await School.findByIdAndUpdate(
      req.params.id,
      { featuresEnabled: features },
      { new: true }
    );

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    res.json({
      success: true,
      message: 'Features updated successfully',
      data: school
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating features'
    });
  }
});

// Suspend/Unsuspend school (Admin)
router.patch('/:id/suspend', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { suspend, reason } = req.body;

    const school = await School.findByIdAndUpdate(
      req.params.id,
      {
        status: suspend ? 'suspended' : 'active',
        suspensionReason: suspend ? reason : null
      },
      { new: true }
    );

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    res.json({
      success: true,
      message: `School ${suspend ? 'suspended' : 'unsuspended'} successfully`,
      data: school
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating school status'
    });
  }
});

// Get school statistics (Admin)
router.get('/admin/stats', authMiddleware, adminAuth, async (req, res) => {
  try {
    const stats = {
      totalSchools: await School.countDocuments(),
      activeSchools: await School.countDocuments({ status: 'active' }),
      inactiveSchools: await School.countDocuments({ status: 'inactive' }),
      suspendedSchools: await School.countDocuments({ status: 'suspended' }),
      trialSchools: await School.countDocuments({ subscriptionStatus: 'trial' }),
      activeSubscriptions: await School.countDocuments({ subscriptionStatus: 'active' }),
      totalStudents: 0,
      totalStaff: 0
    };

    // Calculate totals
    const schools = await School.find();
    stats.totalStudents = schools.reduce((sum, s) => sum + s.studentCount, 0);
    stats.totalStaff = schools.reduce((sum, s) => sum + s.staffCount, 0);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics'
    });
  }
});

module.exports = router;
