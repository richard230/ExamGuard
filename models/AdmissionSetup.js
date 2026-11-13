const mongoose = require('mongoose');

const AdmissionSetupSchema = new mongoose.Schema({
  // Tenant key used to scope every admission-board query to one school.
  schoolId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },

  // An AdmissionSetup now represents an Admission Board.
  // Optional at schema level so existing records without a title remain valid.
  title: {
    type: String,
    trim: true,
    maxlength: 150,
    default: ''
  },

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

  // New multi-class field. The legacy singular `class` field is retained below
  // so existing records and older code can continue to read their data.
  classes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class'
  }],

  // Legacy compatibility field. New boards should use `classes`.
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
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
    min: 0,
    default: 0
  },

  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Keep the legacy single-class field readable while normalizing old records
// into the new multi-class representation when they are saved.
AdmissionSetupSchema.pre('validate', function(next) {
  if ((!Array.isArray(this.classes) || this.classes.length === 0) && this.class) {
    this.classes = [this.class];
  }

  if (Array.isArray(this.classes) && this.classes.length > 0 && !this.class) {
    this.class = this.classes[0];
  }

  next();
});

AdmissionSetupSchema.index({ schoolId: 1, session: 1, term: 1 });
AdmissionSetupSchema.index({ schoolId: 1, isActive: 1 });

module.exports = mongoose.model('AdmissionSetup', AdmissionSetupSchema);
