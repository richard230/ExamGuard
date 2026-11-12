const mongoose = require('mongoose');

const AdmissionCohortSchema = new mongoose.Schema({
  // Tenant key required by school-scoped admission queries.
  schoolId: { type: String, required: true, index: true },
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true
  },
  term: {
    type: String,
    enum: ['First Term', 'Second Term', 'Third Term'],
    required: true
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },
  arm: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Arm',
    required: false
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  applicationFee: {
    type: Number,
    default: 0
  },
  description: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'closed'],
    default: 'active'
  },
  applicantCount: {
    type: Number,
    default: 0
  },
  capacity: {
    type: Number,
    default: 50
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Pre-save hook to prevent editing closed cohorts
AdmissionCohortSchema.pre('findByIdAndUpdate', function(next) {
  const update = this.getUpdate();
  if (update.$set && update.$set.status === 'closed') {
    next();
  } else if (this.options.overwrite) {
    next();
  } else {
    next();
  }
});

module.exports = mongoose.model('AdmissionCohort', AdmissionCohortSchema);
