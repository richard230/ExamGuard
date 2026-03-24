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

  // Upload Data - Enhanced with enriched metadata
  results: [{
    // Student Identification
    student_id: { type: String, required: true },
    student_name: { type: String, required: true },
    regNo: { type: String, default: null },
    
    // Academic Scores
    ca1_score: { type: Number, default: null },
    ca2_score: { type: Number, default: null },
    midterm_score: { type: Number, default: null },
    exam_score: { type: Number, default: null },
    grade: { type: String, default: null },
    remarks: { type: String, default: null },
    subject: { type: String, default: null },
    
    // Subject Position (Where student ranked in this subject)
    position: { type: String, default: '-' },
    position_numeric: { type: Number, default: null },
    
    // Affective Skills Assessment
    skills: {
      punctuality: { type: String, default: '-' },
      obedience: { type: String, default: '-' },
      honesty: { type: String, default: '-' },
      cleanliness: { type: String, default: '-' },
      initiative: { type: String, default: '-' },
      cooperation: { type: String, default: '-' }
    },
    
    // Attendance Data
    attendance: {
      present: { type: String, default: '-' },
      absent: { type: String, default: '-' },
      rate: { type: Number, default: 0 }
    },
    
    // Teacher Comment
    teacherComment: {
      comment: { type: String, default: 'No comment on record' },
      teacherName: { type: String, default: 'Unknown' }
    },
    
    // Principal Remark
    principalRemark: {
      remark: { type: String, default: 'No remark on record' },
      principalName: { type: String, default: 'Unknown' }
    },
    
    // Student Overall Position in Class
    studentPosition: { type: Number, default: 0 },
    
    // Record Status
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
    tags: [String],
    recordType: { type: String, default: 'flattened_subjects' }, // e.g., 'flattened_subjects', 'summary'
    groupSession: String,
    groupTerm: String,
    groupClass: String,
    classSize: { type: Number, default: 0 }
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
universalUploadSchema.index({ schoolId: 1, session: 1, term: 1, class: 1 });
universalUploadSchema.index({ status: 1, uploadTimestamp: -1 });
universalUploadSchema.index({ createdAt: -1 });
universalUploadSchema.index({ 'results.student_id': 1 });
universalUploadSchema.index({ 'results.position': 1 });

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

// Method to get complete student data by student_id
universalUploadSchema.methods.getStudentData = function(studentId) {
  return this.results.filter(r => r.student_id === studentId);
};

// Method to get all unique students in upload
universalUploadSchema.methods.getUniqueStudents = function() {
  const uniqueStudents = {};
  this.results.forEach(r => {
    if (!uniqueStudents[r.student_id]) {
      uniqueStudents[r.student_id] = {
        student_id: r.student_id,
        student_name: r.student_name,
        regNo: r.regNo,
        skills: r.skills,
        attendance: r.attendance,
        teacherComment: r.teacherComment,
        principalRemark: r.principalRemark,
        studentPosition: r.studentPosition,
        subjects: []
      };
    }
    uniqueStudents[r.student_id].subjects.push({
      subject: r.subject,
      ca1_score: r.ca1_score,
      ca2_score: r.ca2_score,
      midterm_score: r.midterm_score,
      exam_score: r.exam_score,
      grade: r.grade,
      position: r.position
    });
  });
  return Object.values(uniqueStudents);
};

module.exports = mongoose.model('UniversalUpload', universalUploadSchema);
