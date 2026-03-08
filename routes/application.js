const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const Application = require('../models/Application');
const { authMiddleware } = require('./auth');
const adminAuth = require('../middleware/adminAuth');

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '../uploads/applications');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPG, and PNG files are allowed'));
    }
  }
});

// ========== CREATE / SUBMIT APPLICATION ==========
router.post('/', upload.fields([
  { name: 'idFile', maxCount: 1 },
  { name: 'transcripts', maxCount: 5 }
]), async (req, res) => {
  try {
    const {
      applicantType,
      username,
      password,
      firstName,
      lastName,
      email,
      phone,
      dob,
      nationality,
      address,
      intakeTerm,
      program,
      currentSchool,
      currentGrade,
      prevAcademics,
      languageProof,
      emergencyName,
      emergencyPhone
    } = req.body;

    // Validate required fields
    if (!applicantType || !username || !password || !firstName || !lastName || !email || !phone || !dob) {
      return res.status(400).json({ 
        message: 'Missing required fields' 
      });
    }

    // Check if email or username already exists
    const existingApp = await Application.findOne({
      $or: [{ email }, { username }]
    });

    if (existingApp) {
      return res.status(400).json({ 
        message: 'Email or username already registered' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Prepare application data
    const appData = {
      applicantType,
      username,
      password: hashedPassword,
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth: new Date(dob),
      nationality: nationality || '',
      currentAddress: address || '',
      intakeTerm,
      program,
      currentSchool: currentSchool || '',
      currentGrade: currentGrade || '',
      previousAcademics: prevAcademics || '',
      languageProof: languageProof || '',
      emergencyContactName: emergencyName || '',
      emergencyContactPhone: emergencyPhone || '',
      status: 'submitted',
      submittedAt: new Date()
    };

    // Handle file uploads
    if (req.files) {
      if (req.files.idFile && req.files.idFile.length > 0) {
        const file = req.files.idFile[0];
        appData.idDocument = {
          fileName: file.originalname,
          fileSize: file.size,
          fileType: file.mimetype,
          uploadPath: `/uploads/applications/${file.filename}`,
          uploadedAt: new Date()
        };
      }

      if (req.files.transcripts && req.files.transcripts.length > 0) {
        appData.transcripts = req.files.transcripts.map(file => ({
          fileName: file.originalname,
          fileSize: file.size,
          fileType: file.mimetype,
          uploadPath: `/uploads/applications/${file.filename}`,
          uploadedAt: new Date()
        }));
      }
    }

    // Create application
    const application = new Application(appData);
    await application.save();

    res.status(201).json({
      message: 'Application submitted successfully',
      applicationId: application._id,
      email: application.email
    });
  } catch (err) {
    console.error('Application submission error:', err);
    res.status(500).json({ 
      message: err.message || 'Failed to submit application' 
    });
  }
});

// ========== GET APPLICATION BY ID ==========
router.get('/:id', async (req, res) => {
  try {
    const application = await Application.findById(req.params.id).select('-password');
    
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    res.json(application);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch application' });
  }
});

// ========== GET ALL APPLICATIONS (ADMIN ONLY) ==========
router.get('/', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { status, intakeTerm, program, page = 1, limit = 20 } = req.query;
    
    // Build filter
    const filter = {};
    if (status) filter.status = status;
    if (intakeTerm) filter.intakeTerm = intakeTerm;
    if (program) filter.program = program;

    const applications = await Application.find(filter)
      .select('-password')
      .sort({ submittedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Application.countDocuments(filter);

    res.json({
      applications,
      totalApplications: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch applications' });
  }
});

// ========== UPDATE APPLICATION STATUS (ADMIN ONLY) ==========
router.patch('/:id/status', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { status, notes } = req.body;

    if (!['draft', 'submitted', 'under-review', 'accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const application = await Application.findByIdAndUpdate(
      req.params.id,
      {
        status,
        notes: notes || '',
        reviewedAt: new Date(),
        reviewedBy: req.user.id
      },
      { new: true }
    ).select('-password');

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    res.json({
      message: 'Application status updated',
      application
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update application' });
  }
});

// ========== DELETE APPLICATION (ADMIN ONLY) ==========
router.delete('/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const application = await Application.findByIdAndDelete(req.params.id);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Delete associated files
    if (application.idDocument && application.idDocument.uploadPath) {
      const filePath = path.join(__dirname, `..${application.idDocument.uploadPath}`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    if (application.transcripts && application.transcripts.length > 0) {
      application.transcripts.forEach(doc => {
        const filePath = path.join(__dirname, `..${doc.uploadPath}`);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      });
    }

    res.json({ message: 'Application deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete application' });
  }
});

// ========== GET APPLICATION STATISTICS (ADMIN ONLY) ==========
router.get('/stats/overview', authMiddleware, adminAuth, async (req, res) => {
  try {
    const totalApplications = await Application.countDocuments();
    const byStatus = await Application.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const byProgram = await Application.aggregate([
      { $group: { _id: '$program', count: { $sum: 1 } } }
    ]);
    const byIntake = await Application.aggregate([
      { $group: { _id: '$intakeTerm', count: { $sum: 1 } } }
    ]);

    res.json({
      totalApplications,
      byStatus,
      byProgram,
      byIntake
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch statistics' });
  }
});

module.exports = router;
