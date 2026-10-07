const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema({
  value: { type: String, required: true }
}, { _id: false });

const questionSchema = new mongoose.Schema({
  text: { type: String, required: true }, // HTML (Quill) supported
  options: { type: [optionSchema], required: true },
  answer: { type: Number, required: true }, // index of the correct option
  score: { type: Number, default: 1 }
}, { _id: false });

// CBT Exam Model
const examSchema = new mongoose.Schema({
  // Multi-school / tenant owner
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

  scheduledFor: {
    type: Date
  },

  status: {
    type: String,
    enum: ['Draft', 'Scheduled', 'Active', 'Completed', 'Stopped'],
    default: 'Draft'
  },

  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff'
  },

  // Exam Code Fields
  examCode: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },

  codeGeneratedAt: {
    type: Date
  },

  codeExpiresAt: {
    type: Date
  },

  isCodeActive: {
    type: Boolean,
    default: true
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

// School-scoped indexes
examSchema.index({ schoolId: 1, class: 1 });
examSchema.index({ schoolId: 1, subject: 1 });
examSchema.index({ schoolId: 1, status: 1 });
examSchema.index({ schoolId: 1, examCode: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Exam', examSchema);
