const mongoose = require('mongoose');

const AdmissionCohortSchema = new mongoose.Schema({
  // Tenant key used to scope every cohort query to one school.
  schoolId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },

  // Null/absent means this is an independent cohort.
  // When set, this cohort belongs to the referenced Admission Board.
  admissionSetupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdmissionSetup',
    default: null,
    index: true
  },

  name: {
    type: String,
    trim: true,
    default: '',
    maxlength: 150
  },

  // For a linked cohort these values are copied from its board by the
  // admission routes, keeping each cohort's application snapshot consistent.
  // They remain required for independent cohorts.
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: function() {
      return !this.admissionSetupId;
    }
  },

  term: {
    type: String,
    enum: ['First Term', 'Second Term', 'Third Term'],
    required: function() {
      return !this.admissionSetupId;
    }
  },

  // Every cohort targets one class, even when its board covers several.
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },

  arm: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Arm',
    required: false,
    default: null
  },

  startDate: {
    type: Date,
    required: function() {
      return !this.admissionSetupId;
    }
  },

  endDate: {
    type: Date,
    required: function() {
      return !this.admissionSetupId;
    }
  },

  applicationFee: {
    type: Number,
    min: 0,
    default: 0
  },

  description: {
    type: String,
    default: ''
  },

  status: {
    type: String,
    enum: ['active', 'paused', 'closed'],
    default: 'active',
    index: true
  },

  applicantCount: {
    type: Number,
    min: 0,
    default: 0
  },

  capacity: {
    type: Number,
    min: 1,
    default: 50
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Prevent duplicate cohorts for the same school, board/class/arm combination.
// Independent cohorts use a null board ID and are still distinguished by
// session, term, class and arm.
AdmissionCohortSchema.index({
  schoolId: 1,
  admissionSetupId: 1,
  session: 1,
  term: 1,
  class: 1,
  arm: 1
});

AdmissionCohortSchema.index({ schoolId: 1, status: 1 });
AdmissionCohortSchema.index({ schoolId: 1, admissionSetupId: 1 });

module.exports = mongoose.model('AdmissionCohort', AdmissionCohortSchema);
