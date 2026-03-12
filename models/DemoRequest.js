const mongoose = require('mongoose');

const demoRequestSchema = new mongoose.Schema(
  {
    // Request Info
    requestId: {
      type: String,
      unique: true,
      sparse: true,
      default: null
    },
    
    // School Information
    schoolName: {
      type: String,
      required: [true, 'School name is required'],
      trim: true
    },
    schoolType: {
      type: String,
      enum: {
        values: ['primary', 'secondary', 'boarding', 'international', 'university', 'vocational', 'other'],
        message: 'Invalid school type'
      },
      required: [true, 'School type is required']
    },
    studentCount: {
      type: String,
      enum: {
        values: ['under-200', '200-500', '500-1000', '1000-2000', '2000-5000', 'over-5000'],
        message: 'Invalid student count range'
      },
      required: [true, 'Student count is required']
    },
    country: {
      type: String,
      required: [true, 'Country is required'],
      trim: true
    },
    schoolWebsite: {
      type: String,
      trim: true,
      default: null
    },

    // Contact Information
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true
    },
    jobTitle: {
      type: String,
      required: [true, 'Job title is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email address'
      ]
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true
    },

    // Requirements
    needs: {
      type: [String],
      enum: {
        values: [
          'student-management',
          'grading',
          'fee-management',
          'attendance',
          'parent-portal',
          'staff-management',
          'analytics',
          'mobile-apps'
        ],
        message: 'Invalid requirement selected'
      },
      required: [true, 'At least one requirement must be selected'],
      validate: {
        validator: function(v) {
          return v && v.length > 0;
        },
        message: 'At least one requirement must be selected'
      }
    },

    // Budget & Timeline
    budget: {
      type: String,
      enum: {
        values: ['under-50k', '50k-100k', '100k-200k', '200k-plus', 'not-sure'],
        message: 'Invalid budget range'
      },
      required: [true, 'Budget is required']
    },
    timeline: {
      type: String,
      enum: {
        values: ['urgent', 'soon', 'flexible', 'exploring'],
        message: 'Invalid timeline'
      },
      required: [true, 'Timeline is required']
    },

    // Demo Preferences
    demoTime: {
      type: String,
      enum: {
        values: ['morning', 'afternoon', 'evening', 'flexible'],
        message: 'Invalid demo time'
      },
      required: [true, 'Demo time preference is required']
    },
    additionalInfo: {
      type: String,
      trim: true,
      default: null
    },

    // Status Management
    status: {
      type: String,
      enum: {
        values: ['pending', 'reviewed', 'approved', 'rejected'],
        message: 'Invalid status'
      },
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
      trim: true,
      default: null
    },

    // Tracking
    ipAddress: {
      type: String,
      default: null
    },
    userAgent: {
      type: String,
      default: null
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
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for faster queries
demoRequestSchema.index({ email: 1 }, { unique: true, sparse: true });
demoRequestSchema.index({ status: 1 });
demoRequestSchema.index({ createdAt: -1 });
demoRequestSchema.index({ requestId: 1 });

// Auto-generate request ID before save
demoRequestSchema.pre('save', async function(next) {
  if (!this.requestId) {
    try {
      const count = await mongoose.model('DemoRequest').countDocuments();
      this.requestId = `#REQ-${String(count + 1).padStart(3, '0')}`;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Virtual for formatted student count
demoRequestSchema.virtual('studentCountDisplay').get(function() {
  const display = {
    'under-200': 'Under 200',
    '200-500': '200 - 500',
    '500-1000': '500 - 1,000',
    '1000-2000': '1,000 - 2,000',
    '2000-5000': '2,000 - 5,000',
    'over-5000': 'Over 5,000'
  };
  return display[this.studentCount] || this.studentCount;
});

// Virtual for formatted budget
demoRequestSchema.virtual('budgetDisplay').get(function() {
  const display = {
    'under-50k': 'Under ₦50,000',
    '50k-100k': '₦50K - ₦100K',
    '100k-200k': '₦100K - ₦200K',
    '200k-plus': '₦200K+',
    'not-sure': 'Not sure yet'
  };
  return display[this.budget] || this.budget;
});

// Virtual for formatted timeline
demoRequestSchema.virtual('timelineDisplay').get(function() {
  const display = {
    'urgent': 'Urgent (1 month)',
    'soon': 'Soon (1-3 months)',
    'flexible': 'Flexible (3-6 months)',
    'exploring': 'Just exploring'
  };
  return display[this.timeline] || this.timeline;
});

// Virtual for formatted demo time
demoRequestSchema.virtual('demoTimeDisplay').get(function() {
  const display = {
    'morning': 'Morning (9AM-12PM)',
    'afternoon': 'Afternoon (12PM-5PM)',
    'evening': 'Evening (5PM-8PM)',
    'flexible': 'Flexible'
  };
  return display[this.demoTime] || this.demoTime;
});

// Virtual for days since request
demoRequestSchema.virtual('daysSinceRequest').get(function() {
  const now = new Date();
  const diff = now - this.createdAt;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
});

// Virtual for formatted creation date
demoRequestSchema.virtual('createdAtFormatted').get(function() {
  return this.createdAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
});

// Method to mark as viewed
demoRequestSchema.methods.markAsViewed = function() {
  this.viewed = true;
  this.viewedAt = new Date();
  return this.save();
};

// Method to update status
demoRequestSchema.methods.updateStatus = function(newStatus, adminId = null, notes = null) {
  this.status = newStatus;
  this.statusUpdatedAt = new Date();
  this.statusUpdatedBy = adminId;
  if (notes) this.adminNotes = notes;
  return this.save();
};

// Method to schedule demo
demoRequestSchema.methods.scheduleDemo = function(demoDate, demoTime, demoLink = null) {
  this.demoScheduledDate = new Date(demoDate);
  this.demoScheduledTime = demoTime;
  if (demoLink) this.demoLink = demoLink;
  this.status = 'approved';
  return this.save();
};

// Statics for common queries
demoRequestSchema.statics.findByStatus = function(status) {
  return this.find({ status });
};

demoRequestSchema.statics.findPending = function() {
  return this.find({ status: 'pending' });
};

demoRequestSchema.statics.findApproved = function() {
  return this.find({ status: 'approved' });
};

demoRequestSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

demoRequestSchema.statics.getStats = function() {
  return Promise.all([
    this.countDocuments(),
    this.countDocuments({ status: 'pending' }),
    this.countDocuments({ status: 'reviewed' }),
    this.countDocuments({ status: 'approved' }),
    this.countDocuments({ status: 'rejected' })
  ]).then(([total, pending, reviewed, approved, rejected]) => ({
    totalRequests: total,
    pendingRequests: pending,
    reviewedRequests: reviewed,
    approvedRequests: approved,
    rejectedRequests: rejected,
    conversionRate: total > 0 ? Math.round((approved / total) * 100) : 0
  }));
};

// Error handling middleware
demoRequestSchema.post('save', function(error, doc, next) {
  if (error.name === 'ValidationError') {
    const messages = Object.values(error.errors).map(err => err.message);
    const err = new Error(messages.join(', '));
    err.status = 400;
    next(err);
  } else if (error.code === 11000) {
    const field = Object.keys(error.keyPattern)[0];
    const err = new Error(`A demo request with this ${field} already exists`);
    err.status = 409;
    next(err);
  } else {
    next(error);
  }
});

module.exports = mongoose.model('DemoRequest', demoRequestSchema);
