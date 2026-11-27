
const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema({
  value: { type: String, required: true }
}, { _id: false });

const questionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  options: { type: [optionSchema], required: true },
  answer: { type: Number, required: true },
  score: { type: Number, default: 1 }
}, { _id: false });

const examSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },

  title: {
    type: String,
    required: true
  },

  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },

  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },

  duration: {
    type: Number,
    required: true
  },

  questions: {
    type: [questionSchema],
    required: true
  },

  scheduledFor: Date,

  status: {
    type: String,
    enum: ['Draft', 'Scheduled', 'Active', 'Completed', 'Stopped'],
    default: 'Draft'
  },

  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff'
  },

  // Optional examination access code.
  // Uniqueness is enforced by the school-scoped partial index below.
  examCode: {
    type: String,
    trim: true
  },

  codeGeneratedAt: Date,
  codeExpiresAt: Date,

  isCodeActive: {
    type: Boolean,
    default: true
  }

}, {
  timestamps: true
});

// School-scoped indexes
examSchema.index({ schoolId: 1, class: 1 });
examSchema.index({ schoolId: 1, subject: 1 });
examSchema.index({ schoolId: 1, status: 1 });

// Only enforce uniqueness when examCode is an actual string.
// Missing and null exam codes will not conflict.
examSchema.index(
  { schoolId: 1, examCode: 1 },
  {
    unique: true,
    partialFilterExpression: {
      examCode: { $type: 'string' }
    },
    name: 'schoolId_1_examCode_1'
  }
);

module.exports = mongoose.model('Exam', examSchema);
