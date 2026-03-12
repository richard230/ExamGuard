const express = require('express');
const router = express.Router();
const DemoRequest = require('../models/DemoRequest');
const { authMiddleware } = require('./auth');
const adminAuth = require('../middleware/adminAuth');

/* ================= PUBLIC ROUTES ================= */

// Submit a new demo request
router.post('/submit', async (req, res) => {
  try {
    const {
      schoolName,
      schoolType,
      studentCount,
      country,
      schoolWebsite,
      fullName,
      jobTitle,
      email,
      phone,
      needs,
      budget,
      timeline,
      demoTime,
      additionalInfo
    } = req.body;

    // Validation
    if (!schoolName || !fullName || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    if (!needs || needs.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one requirement must be selected'
      });
    }

    // Check if email already submitted
    const existingRequest = await DemoRequest.findOne({ email });
    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: 'A request from this email already exists'
      });
    }

    // Create new demo request
    const newRequest = new DemoRequest({
      schoolName,
      schoolType,
      studentCount,
      country,
      schoolWebsite,
      fullName,
      jobTitle,
      email,
      phone,
      needs: Array.isArray(needs) ? needs : [needs],
      budget,
      timeline,
      demoTime,
      additionalInfo,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    await newRequest.save();

    res.status(201).json({
      success: true,
      message: 'Demo request submitted successfully',
      requestId: newRequest.requestId
    });

  } catch (error) {
    console.error('Error submitting demo request:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting demo request'
    });
  }
});

// Get all public demo request stats
router.get('/stats', async (req, res) => {
  try {
    const stats = {
      totalRequests: await DemoRequest.countDocuments(),
      pendingRequests: await DemoRequest.countDocuments({ status: 'pending' }),
      reviewedRequests: await DemoRequest.countDocuments({ status: 'reviewed' }),
      approvedRequests: await DemoRequest.countDocuments({ status: 'approved' }),
      rejectedRequests: await DemoRequest.countDocuments({ status: 'rejected' })
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching stats' });
  }
});

/* ================= ADMIN ROUTES ================= */

// Get all demo requests (Admin)
router.get('/', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;

    let query = {};

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { schoolName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
        { requestId: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const requests = await DemoRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await DemoRequest.countDocuments(query);

    res.json({
      success: true,
      data: requests,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching demo requests:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching demo requests'
    });
  }
});

// Get single demo request (Admin)
router.get('/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const request = await DemoRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Demo request not found'
      });
    }

    // Mark as viewed
    if (!request.viewed) {
      request.viewed = true;
      request.viewedAt = new Date();
      await request.save();
    }

    res.json({
      success: true,
      data: request
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching demo request'
    });
  }
});

// Update demo request status (Admin)
router.patch('/:id/status', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { status, adminNotes } = req.body;

    if (!['pending', 'reviewed', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const request = await DemoRequest.findByIdAndUpdate(
      req.params.id,
      {
        status,
        statusUpdatedAt: new Date(),
        statusUpdatedBy: req.user._id,
        adminNotes
      },
      { new: true }
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Demo request not found'
      });
    }

    res.json({
      success: true,
      message: `Demo request ${status} successfully`,
      data: request
    });

  } catch (error) {
    console.error('Error updating demo request:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating demo request'
    });
  }
});

// Schedule demo (Admin)
router.patch('/:id/schedule-demo', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { demoDate, demoTime, demoLink } = req.body;

    if (!demoDate || !demoTime) {
      return res.status(400).json({
        success: false,
        message: 'Demo date and time are required'
      });
    }

    const request = await DemoRequest.findByIdAndUpdate(
      req.params.id,
      {
        demoScheduledDate: new Date(demoDate),
        demoScheduledTime: demoTime,
        demoLink,
        status: 'approved'
      },
      { new: true }
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Demo request not found'
      });
    }

    res.json({
      success: true,
      message: 'Demo scheduled successfully',
      data: request
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error scheduling demo'
    });
  }
});

// Get dashboard stats (Admin)
router.get('/admin/dashboard-stats', authMiddleware, adminAuth, async (req, res) => {
  try {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisYear = new Date(now.getFullYear(), 0, 1);

    const stats = {
      totalRequests: await DemoRequest.countDocuments(),
      pendingRequests: await DemoRequest.countDocuments({ status: 'pending' }),
      reviewedRequests: await DemoRequest.countDocuments({ status: 'reviewed' }),
      approvedRequests: await DemoRequest.countDocuments({ status: 'approved' }),
      rejectedRequests: await DemoRequest.countDocuments({ status: 'rejected' }),
      requestsThisMonth: await DemoRequest.countDocuments({
        createdAt: { $gte: thisMonth }
      }),
      requestsThisYear: await DemoRequest.countDocuments({
        createdAt: { $gte: thisYear }
      }),
      conversionRate: 0 // Will calculate below
    };

    // Calculate conversion rate
    if (stats.totalRequests > 0) {
      stats.conversionRate = Math.round((stats.approvedRequests / stats.totalRequests) * 100);
    }

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard stats'
    });
  }
});

module.exports = router;
