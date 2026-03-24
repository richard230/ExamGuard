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
    student_id: { type: String, required: true, index: true },
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
    classSize: { type: Number, default: 0 },
    operation: { type: String, enum: ['create', 'update'], default: 'create' } // Track if upload or update
  },

  // Soft Delete
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
  deletedBy: mongoose.Schema.Types.ObjectId
}, {
  timestamps: true,
  collection: 'universal_uploads'
});

// ===== INDEXES FOR BETTER QUERY PERFORMANCE =====
universalUploadSchema.index({ schoolId: 1, session: 1, term: 1 });
universalUploadSchema.index({ schoolId: 1, session: 1, term: 1, class: 1 });
universalUploadSchema.index({ schoolId: 1, session: 1, term: 1, class: 1, subject: 1 });
universalUploadSchema.index({ status: 1, uploadTimestamp: -1 });
universalUploadSchema.index({ createdAt: -1 });
universalUploadSchema.index({ 'results.student_id': 1 });
universalUploadSchema.index({ 'results.position': 1 });
universalUploadSchema.index({ uploadId: 1 });
universalUploadSchema.index({ isDeleted: 1, status: 1 });

// ===== PRE-SAVE HOOKS =====
universalUploadSchema.pre('save', function(next) {
  if (!this.uploadId) {
    // Generate unique uploadId
    this.uploadId = `UPL-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }
  
  // Set total records count
  this.processingStats.totalRecords = this.results.length;
  
  next();
});

// ===== STATIC METHODS (Class-level) =====

/**
 * Check if an exact duplicate upload already exists
 * @param {String} schoolId - School ID
 * @param {String} session - Academic session
 * @param {String} term - Term (normalized)
 * @param {String} classLevel - Class/Grade level
 * @param {String} subject - Subject name
 * @returns {Promise<Object|null>} - Duplicate upload object or null
 */
universalUploadSchema.statics.checkDuplicateUpload = async function(schoolId, session, term, classLevel, subject) {
  try {
    const existingUpload = await this.findOne({
      schoolId,
      session,
      term,
      class: classLevel,
      subject,
      status: { $in: ['pending', 'processing', 'completed'] },
      isDeleted: false
    }).select('uploadId status processingStats createdAt results');
    
    return existingUpload || null;
  } catch (err) {
    console.error('Error checking duplicate upload:', err);
    return null;
  }
};

/**
 * Check for partial duplicates (same students from same school/session/term)
 * @param {String} schoolId - School ID
 * @param {String} session - Academic session
 * @param {String} term - Term
 * @param {Array} studentIds - Array of student IDs to check
 * @returns {Promise<Object|null>} - Overlap information or null
 */
universalUploadSchema.statics.checkPartialDuplicate = async function(schoolId, session, term, studentIds) {
  try {
    const existingUpload = await this.findOne({
      schoolId,
      session,
      term,
      status: { $in: ['pending', 'processing', 'completed'] },
      isDeleted: false,
      'results.student_id': { $in: studentIds }
    }).select('uploadId results status');
    
    if (!existingUpload) return null;
    
    // Count overlapping records
    const overlapCount = existingUpload.results.filter(r => 
      studentIds.includes(r.student_id)
    ).length;
    
    return {
      uploadId: existingUpload.uploadId,
      overlapCount,
      totalInExisting: existingUpload.results.length,
      status: existingUpload.status,
      overlappingStudents: existingUpload.results
        .filter(r => studentIds.includes(r.student_id))
        .map(r => ({ id: r.student_id, name: r.student_name }))
    };
  } catch (err) {
    console.error('Error checking partial duplicate:', err);
    return null;
  }
};

/**
 * Get existing upload details
 * @param {String} schoolId - School ID
 * @param {String} session - Academic session
 * @param {String} term - Term
 * @param {String} classLevel - Class/Grade level
 * @param {String} subject - Subject name
 * @returns {Promise<Object|null>} - Upload details or null
 */
universalUploadSchema.statics.getExistingUpload = async function(schoolId, session, term, classLevel, subject) {
  try {
    return await this.findOne({
      schoolId,
      session,
      term,
      class: classLevel,
      subject,
      status: { $in: ['pending', 'processing', 'completed'] },
      isDeleted: false
    }).select('uploadId status processingStats createdAt metadata');
  } catch (err) {
    console.error('Error fetching existing upload:', err);
    return null;
  }
};

/**
 * Get all uploads for a school
 * @param {String} schoolId - School ID
 * @param {Object} filters - Optional filters (session, term, status)
 * @returns {Promise<Array>} - Array of uploads
 */
universalUploadSchema.statics.getSchoolUploads = async function(schoolId, filters = {}) {
  try {
    const query = { schoolId, isDeleted: false, ...filters };
    return await this.find(query)
      .select('uploadId session term class subject status processingStats createdAt metadata')
      .sort({ createdAt: -1 });
  } catch (err) {
    console.error('Error fetching school uploads:', err);
    return [];
  }
};

/**
 * Get upload history for a specific school/session/term
 * @param {String} schoolId - School ID
 * @param {String} session - Academic session
 * @param {String} term - Term
 * @returns {Promise<Array>} - Array of uploads
 */
universalUploadSchema.statics.getUploadHistory = async function(schoolId, session, term) {
  try {
    return await this.find({
      schoolId,
      session,
      term,
      isDeleted: false
    })
    .select('uploadId class subject status processingStats createdAt metadata')
    .sort({ createdAt: -1 })
    .limit(50);
  } catch (err) {
    console.error('Error fetching upload history:', err);
    return [];
  }
};

/**
 * Find duplicate uploads by student and session
 * @param {String} studentId - Student ID
 * @param {String} session - Academic session
 * @param {String} term - Term
 * @returns {Promise<Array>} - Array of duplicate uploads
 */
universalUploadSchema.statics.findDuplicatesByStudent = async function(studentId, session, term) {
  try {
    return await this.find({
      session,
      term,
      'results.student_id': studentId,
      isDeleted: false
    }).select('uploadId schoolId schoolName class subject status createdAt');
  } catch (err) {
    console.error('Error finding student duplicates:', err);
    return [];
  }
};

/**
 * Mark records as processed
 * @param {String} uploadId - Upload ID
 * @param {Number} successCount - Number of successful records
 * @param {Number} failureCount - Number of failed records
 * @returns {Promise<Object>} - Updated upload
 */
universalUploadSchema.statics.markAsProcessed = async function(uploadId, successCount = 0, failureCount = 0) {
  try {
    const update = {
      status: failureCount > 0 ? 'partially_failed' : 'completed',
      'processingStats.successCount': successCount,
      'processingStats.failureCount': failureCount,
      'processingStats.processingCompletedAt': new Date(),
      'processingStats.processingDurationMs': Date.now() - new Date(
        await this.findOne({ uploadId }).select('createdAt')
      ).getTime()
    };
    
    return await this.findOneAndUpdate({ uploadId }, update, { new: true });
  } catch (err) {
    console.error('Error marking as processed:', err);
    return null;
  }
};

/**
 * Calculate checksum for duplicate detection
 * @param {String} schoolId - School ID
 * @param {String} session - Academic session
 * @param {String} term - Term
 * @param {String} classLevel - Class/Grade level
 * @param {Array} results - Result records
 * @returns {String} - Checksum hash
 */
universalUploadSchema.statics.calculateChecksum = function(schoolId, session, term, classLevel, results) {
  const crypto = require('crypto');
  const data = JSON.stringify({
    schoolId,
    session,
    term,
    classLevel,
    studentCount: results.length,
    studentIds: results.map(r => r.student_id).sort().join(',')
  });
  return crypto.createHash('sha256').update(data).digest('hex');
};

// ===== INSTANCE METHODS =====

/**
 * Soft delete this upload
 */
universalUploadSchema.methods.softDelete = function(userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

/**
 * Get all unique students in this upload
 * @returns {Array} - Array of unique students
 */
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

/**
 * Get student data by student ID
 * @param {String} studentId - Student ID
 * @returns {Array} - Array of results for the student
 */
universalUploadSchema.methods.getStudentData = function(studentId) {
  return this.results.filter(r => r.student_id === studentId);
};

/**
 * Get upload summary
 * @returns {Object} - Summary information
 */
universalUploadSchema.methods.getSummary = function() {
  const uniqueStudents = new Set(this.results.map(r => r.student_id)).size;
  const uniqueSubjects = new Set(this.results.map(r => r.subject)).size;
  
  return {
    uploadId: this.uploadId,
    schoolId: this.schoolId,
    schoolName: this.schoolName,
    session: this.session,
    term: this.term,
    class: this.class,
    subject: this.subject,
    status: this.status,
    totalRecords: this.results.length,
    uniqueStudents,
    uniqueSubjects,
    successCount: this.processingStats.successCount,
    failureCount: this.processingStats.failureCount,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    metadata: this.metadata
  };
};

/**
 * Update upload with new results
 * @param {Array} newResults - New result records
 * @returns {Promise<Object>} - Updated upload
 */
universalUploadSchema.methods.updateResults = async function(newResults) {
  try {
    this.results = newResults;
    this.processingStats.totalRecords = newResults.length;
    this.status = 'pending'; // Reset to pending for reprocessing
    this.metadata.retryCount = (this.metadata.retryCount || 0) + 1;
    this.metadata.operation = 'update';
    
    return await this.save();
  } catch (err) {
    console.error('Error updating results:', err);
    throw err;
  }
};

/**
 * Mark a record as having an error
 * @param {Number} recordIndex - Index of the record
 * @param {String} studentId - Student ID
 * @param {String} error - Error message
 */
universalUploadSchema.methods.addError = function(recordIndex, studentId, error) {
  this.errors.push({
    recordIndex,
    studentId,
    error,
    timestamp: new Date()
  });
};

/**
 * Get processing progress
 * @returns {Object} - Progress information
 */
universalUploadSchema.methods.getProgress = function() {
  const total = this.processingStats.totalRecords;
  const success = this.processingStats.successCount;
  const failure = this.processingStats.failureCount;
  const processed = success + failure;
  
  return {
    total,
    processed,
    remaining: total - processed,
    success,
    failure,
    percentage: total > 0 ? Math.round((processed / total) * 100) : 0,
    status: this.status
  };
};

module.exports = mongoose.model('UniversalUpload', universalUploadSchema);
