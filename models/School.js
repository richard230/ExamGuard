const mongoose = require('mongoose');

const schoolSchema = new mongoose.Schema(
  {
    // School Information
    schoolName: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    schoolType: {
      type: String,
      enum: ['primary', 'secondary', 'boarding', 'international', 'university', 'vocational', 'other'],
      required: true
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
      trim: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    },
    website: {
      type: String,
      trim: true
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
      default: 'active'
    },
    suspensionReason: {
      type: String,
      trim: true
    },

    // Associated Demo Request
    demoRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DemoRequest'
    },

    // Account Manager (Admin)
    accountManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    // Tags & Notes
    tags: [String],
    internalNotes: {
      type: String,
      trim: true
    }
  },
  { timestamps: true }
);

// Index for faster queries
schoolSchema.index({ schoolName: 1, email: 1 });
schoolSchema.index({ subscriptionStatus: 1 });
schoolSchema.index({ status: 1 });

module.exports = mongoose.model('School', schoolSchema);
