const mongoose = require('mongoose');
const crypto = require('crypto');

const schoolSchema = new mongoose.Schema(
  {
    // School Identification
    schoolId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      trim: true,
      // Format: SCH-ABBREV-XXXXXX
      match: /^SCH-[A-Z0-9]+-[A-Z0-9]+$/
    },

    abbreviation: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 5,
      sparse: true
    },

    // School Information
    schoolName: {
      type: String,
      required: true,
      trim: true,
      index: true
    },

    schoolType: {
      type: String,
      required: true,
      enum: ['primary', 'secondary', 'private', 'tertiary', 'other'],
      default: 'secondary'
    },

    studentCount: {
      type: Number,
      required: true
    },

    staffCount: {
      type: Number,
      default: 0
    },

    // Location
    country: {
      type: String,
      required: true
    },

    state: {
      type: String,
      trim: true
    },

    city: {
      type: String,
      trim: true
    },

    address: {
      type: String,
      trim: true
    },

    // Contact Information
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },

    phone: {
      type: String,
      required: true,
      trim: true
    },

    website: {
      type: String,
      trim: true,
      sparse: true
    },

    // Admin Contact
    adminName: {
      type: String,
      required: true,
      trim: true
    },

    adminEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },

    adminPhone: {
      type: String,
      required: true,
      trim: true
    },

    // Principal/Headmaster
    principal: {
      type: String,
      trim: true,
      sparse: true
    },

    // Account Information
    subscriptionPlan: {
      type: String,
      enum: ['starter', 'professional', 'enterprise'],
      default: 'starter'
    },

    subscriptionStatus: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'trial'],
      default: 'trial'
    },

    subscriptionStartDate: {
      type: Date,
      required: true,
      default: Date.now
    },

    subscriptionEndDate: {
      type: Date
    },

    // Features Enabled
    featuresEnabled: {
      studentManagement: { type: Boolean, default: true },
      grading: { type: Boolean, default: true },
      feeManagement: { type: Boolean, default: false },
      attendance: { type: Boolean, default: true },
      parentPortal: { type: Boolean, default: false },
      staffManagement: { type: Boolean, default: false },
      analytics: { type: Boolean, default: false },
      mobileApps: { type: Boolean, default: false }
    },

    // Storage & Limits
    storageUsed: {
      type: Number,
      default: 0 // in MB
    },

    storageLimit: {
      type: Number,
      default: 5000 // in MB
    },

    maxUsers: {
      type: Number,
      default: 100
    },

    currentUsers: {
      type: Number,
      default: 0
    },

    // Status
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
      index: true
    },

    suspensionReason: {
      type: String,
      trim: true
    },

    // API Access
    apiKey: {
      type: String,
      sparse: true,
      unique: true,
      index: true
    },

    isApiEnabled: {
      type: Boolean,
      default: false
    },

    // Associated Demo Request
    demoRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DemoRequest',
      sparse: true
    },

    // Account Manager (Admin)
    accountManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      sparse: true
    },

    // Audit Trail
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      sparse: true
    },

    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      sparse: true
    },

    // Tags & Notes
    tags: [String],

    internalNotes: {
      type: String,
      trim: true
    },

    // Soft Delete
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },

    deletedAt: {
      type: Date,
      sparse: true
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      sparse: true
    }
  },
  { timestamps: true }
);

// Indexes
schoolSchema.index({ schoolName: 1, email: 1 });
schoolSchema.index({ subscriptionStatus: 1 });
schoolSchema.index({ status: 1 });
schoolSchema.index({ schoolId: 1, status: 1 });
schoolSchema.index({ email: 1 });
schoolSchema.index({ createdAt: -1 });

// Virtual for display name
schoolSchema.virtual('displayName').get(function() {
  return `${this.schoolName}${this.abbreviation ? ` (${this.abbreviation})` : ''}`;
});

// Method to generate School ID
schoolSchema.methods.generateSchoolId = function() {
  if (!this.abbreviation && !this.schoolName) {
    throw new Error('School name or abbreviation is required to generate ID');
  }

  const abbrev = (this.abbreviation || this.schoolName.substring(0, 3)).toUpperCase();
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  this.schoolId = `SCH-${abbrev}-${random}`;
  return this.schoolId;
};

// Method to generate API Key
schoolSchema.methods.generateApiKey = function() {
  this.apiKey = `sch_${crypto.randomBytes(32).toString('hex')}`;
  this.isApiEnabled = true;
  return this.apiKey;
};

// Method to soft delete
schoolSchema.methods.softDelete = function(userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  this.status = 'inactive';
  return this.save();
};

// Pre-save hook to auto-generate schoolId if not present
schoolSchema.pre('save', function(next) {
  if (!this.schoolId) {
    try {
      this.generateSchoolId();
    } catch (err) {
      return next(err);
    }
  }
  next();
});

// Exclude deleted schools by default
schoolSchema.query.active = function() {
  return this.where({ isDeleted: false });
};

// Pre-find hook to exclude deleted schools
schoolSchema.pre(/^find/, function(next) {
  if (!this.getOptions().includeDeleted) {
    this.where({ isDeleted: false });
  }
  next();
});

// Exclude deleted in count
schoolSchema.pre(/^countDocuments/, function(next) {
  this.where({ isDeleted: false });
  next();
});

module.exports = mongoose.model('School', schoolSchema);
