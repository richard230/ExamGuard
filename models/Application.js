const mongoose = require('mongoose');

const ApplicationSchema = new mongoose.Schema({
  // Step 1: Applicant Information
  applicantType: {
    type: String,
    enum: ['national', 'international'],
    required: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    minlength: 3,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email']
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  dateOfBirth: {
    type: Date,
    required: true
  },
  nationality: {
    type: String,
    trim: true
  },
  currentAddress: {
    type: String,
    trim: true
  },

  // Step 2: Program & Academics
  intakeTerm: {
    type: String,
    enum: ['September 2026', 'January 2027'],
    required: true
  },
  program: {
    type: String,
    enum: [
      'International Baccalaureate (IBDP)',
      'French Baccalaureate',
      'French as a Foreign Language (FLE)',
      'Summer Internship / Camp'
    ],
    required: true
  },
  currentSchool: {
    type: String,
    trim: true
  },
  currentGrade: {
    type: String,
    trim: true
  },
  previousAcademics: {
    type: String,
    trim: true
  },

  // Step 3: Documents & Residency
  idDocument: {
    fileName: String,
    fileSize: Number,
    fileType: String,
    uploadPath: String,
    uploadedAt: Date
  },
  transcripts: [
    {
      fileName: String,
      fileSize: Number,
      fileType: String,
      uploadPath: String,
      uploadedAt: Date
    }
  ],
  languageProof: {
    type: String,
    enum: ['', 'IELTS', 'TOEFL', 'Cambridge'],
    default: ''
  },
  emergencyContactName: {
    type: String,
    trim: true
  },
  emergencyContactPhone: {
    type: String,
    trim: true
  },

  // Application Status
  status: {
    type: String,
    enum: ['draft', 'submitted', 'under-review', 'accepted', 'rejected'],
    default: 'draft'
  },
  submittedAt: Date,
  reviewedAt: Date,
  reviewedBy: mongoose.Schema.Types.ObjectId, // Reference to admin who reviewed
  notes: String,

  // Tracking
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Index for faster queries
ApplicationSchema.index({ email: 1 });
ApplicationSchema.index({ username: 1 });
ApplicationSchema.index({ status: 1 });
ApplicationSchema.index({ intakeTerm: 1 });

module.exports = mongoose.model('Application', ApplicationSchema);
