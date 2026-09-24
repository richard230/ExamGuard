const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ParentSchema = new mongoose.Schema({
  // ==========================================
  // SCHOOL / TENANT
  // ==========================================
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    default: null,
    index: true
  },

  name: {
    type: String,
    required: true,
    trim: true
  },

  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    match: /.+\@.+\..+/
  },

  phone: {
    type: String,
    trim: true
  },

  address: {
    type: String,
    trim: true
  },

  occupation: {
    type: String,
    trim: true
  },

  emergencyContactName: {
    type: String,
    trim: true
  },

  emergencyContactPhone: {
    type: String,
    trim: true
  },

  families: [{
    type: String,
    trim: true
  }],

  // Proper student reference
  studentIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: false
  }],

  password: {
    type: String,
    required: true,
    select: false
  },

  temporaryPassword: {
    type: String,
    select: false
  },

  isVerified: {
    type: Boolean,
    default: false
  },

  lastLogin: {
    type: Date
  },

  role: {
    type: String,
    enum: ['parent'],
    default: 'parent'
  },

  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },

  profilePhoto: {
    type: String
  },

  notificationPreferences: {
    email: {
      type: Boolean,
      default: true
    },
    sms: {
      type: Boolean,
      default: false
    },
    inApp: {
      type: Boolean,
      default: true
    }
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }

}, {
  timestamps: true
});

// ==========================================
// INDEXES
// ==========================================

// School + email = unique parent email within each school
ParentSchema.index(
  { schoolId: 1, email: 1 },
  { unique: true }
);

// Faster school-wide parent queries
ParentSchema.index({ schoolId: 1 });

// Faster lookup by linked students
ParentSchema.index({ studentIds: 1 });

// ==========================================
// EXPORT
// ==========================================

module.exports =
  mongoose.models.Parent ||
  mongoose.model('Parent', ParentSchema);
