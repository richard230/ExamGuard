const mongoose = require('mongoose');

const demoRequestSchema = new mongoose.Schema(
  {
    // Request Info
    requestId: {
      type: String,
      unique: true,
      required: true
    },
    
    // School Information
    schoolName: {
      type: String,
      required: true,
      trim: true
    },
    schoolType: {
      type: String,
      enum: ['primary', 'secondary', 'boarding', 'international', 'university', 'vocational', 'other'],
      required: true
    },
    studentCount: {
      type: String,
      enum: ['under-200', '200-500', '500-1000', '1000-2000', '2000-5000', 'over-5000'],
      required: true
    },
    country: {
      type: String,
      required: true,
      trim: true
    },
    schoolWebsite: {
      type: String,
      trim: true
    },

    // Contact Information
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    jobTitle: {
      type: String,
      required: true,
      trim: true
    },
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

    // Requirements
    needs: {
      type: [String],
      enum: [
        'student-management',
        'grading',
        'fee-management',
        'attendance',
        'parent-portal',
        'staff-management',
        'analytics',
        'mobile-apps'
      ],
      required: true,
      validate: {
        validator: function(v) {
          return v.length > 0;
        },
        message: 'At least one requirement must be selected'
      }
    },

    // Budget & Timeline
    budget: {
      type: String,
      enum: ['under-50k', '50k-100k', '100k-200k', '200k-plus', 'not-sure'],
      required: true
    },
    timeline: {
      type: String,
      enum: ['urgent', 'soon', 'flexible', 'exploring'],
      required: true
    },

    // Demo Preferences
    demoTime: {
      type: String,
      enum: ['morning', 'afternoon', 'evening', 'flexible'],
      required: true
    },
    additionalInfo: {
      type: String,
      trim: true
    },

    // Status Management
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'approved', 'rejected'],
      default: 'pending'
    },
    statusUpdatedAt: {
      type: Date,
      default: null
    },
    statusUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    // Demo Scheduling
    demoScheduledDate: {
      type: Date,
      default: null
    },
    demoScheduledTime: {
      type: String,
      default: null
    },
    demoLink: {
      type: String,
      default: null
    },

    // Notes
    adminNotes: {
      type: String,
      trim: true
    },

    // Tracking
    ipAddress: {
      type: String
    },
    userAgent: {
      type: String
    },
    viewed: {
      type: Boolean,
      default: false
    },
    viewedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

// Auto-generate request ID
demoRequestSchema.pre('save', async function(next) {
  if (!this.requestId) {
    const count = await mongoose.model('DemoRequest').countDocuments();
    this.requestId = `#REQ-${String(count + 1).padStart(3, '0')}`;
  }
  next();
});

module.exports = mongoose.model('DemoRequest', demoRequestSchema);
