const mongoose = require('mongoose');

const universalUploadSchema = new mongoose.Schema({
  // Upload Metadata
  uploadId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  uploadTimestamp: {
    type: Date,
    default: Date.now,
    index: true
  },

  // Source Information
  sourceType: {
    type: String,
    enum: ['school_backend', 'direct_upload', 'api', 'bulk_import'],
    required: true
  },
  
  // School Information (Verified)
  schoolId: {
    type: String,
    required: true,
    index: true
  },
  schoolName: {
    type: String,
    required: true
  },
  schoolRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: false
  },

  // Academic Information
  session: {
    type: String,
    required: true,
    index: true
  },
  term: {
    type: String,
    enum: ['First Term', 'Second Term', 'Third Term', 'FIRST TERM', 'SECOND TERM', 'THIRD TERM'],
    required: true,
    index: true,
    set: function(value) {
      // Normalize term values
      if (value === 'FIRST TERM') return 'First Term';
      if (value === 'SECOND TERM') return 'Second Term';
      if (value === 'THIRD TERM') return 'Third Term';
      return value;
    }
  },
  class: {
    type: String,
    required: true,
    index: true
  },
  subject: {
    type: String,
    required: true,
    index: true
  },
  resultType: {
    type: String,
    enum: ['ca1_score', 'ca2_score', 'midterm_score', 'exam_score', 'combined'],
    required: true
  },

  // Upload Data
  results: [{
    student_id: { type: String, required: true },
    student_name: { type: String, required: true },
    ca1_score: { type: Number, default: null },
    ca2_score: { type: Number, default: null },
    midterm_score: { type: Number, default: null },
    exam_score: { type: Number, default: null },
    grade: { type: String, default: null },
    remarks: { type: String, default: null },
    subject: { type: String, default: null },
    recordStatus: {
      type: String,
      enum: ['valid', 'invalid', 'duplicate', 'processed'],
      default: 'valid'
    },
    errorMessage: { type: String, default: null }
  }],

  // Processing Status
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'partially_failed'],
    default: 'pending',
    index: true
  },
  
  processingStats: {
    totalRecords: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    failureCount: { type: Number, default: 0 },
    duplicateCount: { type: Number, default: 0 },
    processingStartedAt: { type: Date, default: null },
    processingCompletedAt: { type: Date, default: null },
    processingDurationMs: { type: Number, default: 0 }
  },

  // Upsert Configuration
  upsertConfig: {
    shouldUpdate: { type: Boolean, default: true },
    shouldCreate: { type: Boolean, default: true },
    updateFields: [String],
    matchOn: { type: String, enum: ['student_id', 'student_email'], default: 'student_id' }
  },

  // Audit Trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  uploadSource: {
    ipAddress: String,
    userAgent: String,
    backendUrl: String
  },

  // Error Tracking
  errors: [{
    recordIndex: Number,
    studentId: String,
    error: String,
    timestamp: { type: Date, default: Date.now }
  }],

  // Metadata
  metadata: {
    fileSize: Number,
    fileName: String,
    checksumHash: String,
    retryCount: { type: Number, default: 0 },
    tags: [String]
  },

  // Soft Delete
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
  deletedBy: mongoose.Schema.Types.ObjectId
}, {
  timestamps: true,
  collection: 'universal_uploads'
});

// Indexes for better query performance
universalUploadSchema.index({ schoolId: 1, session: 1, term: 1 });
universalUploadSchema.index({ status: 1, uploadTimestamp: -1 });
universalUploadSchema.index({ createdAt: -1 });

// Generate Upload ID before saving
universalUploadSchema.pre('save', function(next) {
  if (!this.uploadId) {
    // Generate unique uploadId
    this.uploadId = `UPL-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }
  
  // Set total records count
  this.processingStats.totalRecords = this.results.length;
  
  next();
});

// Instance methods
universalUploadSchema.methods.softDelete = function(userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

module.exports = mongoose.model('UniversalUpload', universalUploadSchema);
