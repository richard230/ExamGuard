const mongoose = require('mongoose');

const AdmissionApplicationSchema = new mongoose.Schema({
  // Tenant ownership is optional for legacy records; all new submissions set it.
  schoolId: { type: String, index: true },
  admissionSetupId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdmissionSetup', default: null },
  cohort: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdmissionCohort',
    required: true
  },
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session'
  },
  term: String,
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class'
  },
  arm: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Arm'
  },
  name: {
    type: String,
    required: false
  },
  email: {
    type: String,
    required: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: true
  },
  parentEmail: String,
  parentPhone: String,
  dateOfBirth: Date,
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: true
  },
  address: String,
  previousSchool: String,
  documents: String, // URL to documents/files
  photoUrl: String,
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Enrolled'],
    default: 'Pending'
  },
  applicationFee: {
    type: Number,
    default: 0
  },
  feePaid: {
    type: Boolean,
    default: false
  },
  notes: String,
  dateApplied: {
    type: Date,
    default: Date.now
  },
  dateReviewed: Date,
  reviewedBy: {
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

// Index for faster queries
AdmissionApplicationSchema.index({ cohort: 1, status: 1 });
AdmissionApplicationSchema.index({ schoolId: 1, admissionSetupId: 1 });
AdmissionApplicationSchema.index({ email: 1 });
AdmissionApplicationSchema.index({ dateApplied: -1 });

module.exports = mongoose.model('AdmissionApplication', AdmissionApplicationSchema);
