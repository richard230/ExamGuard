const mongoose = require('mongoose');

const resultCBTSchema = new mongoose.Schema({
  // School/tenant that owns this result
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },

  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },

  exam: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true
  },

  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },

  answers: [{ type: Number }], // index of selected option for each question

  score: {
    type: Number
  },

  startedAt: {
    type: Date
  },

  finishedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Helpful indexes for multi-school queries
resultCBTSchema.index({ schoolId: 1, student: 1 });
resultCBTSchema.index({ schoolId: 1, exam: 1 });
resultCBTSchema.index({ schoolId: 1, class: 1 });

module.exports = mongoose.model('ResultCBT', resultCBTSchema);
