const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  // Multi-school / tenant owner
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

  startedAt: {
    type: Date
  },

  finishedAt: {
    type: Date
  },

  status: {
    type: String,
    enum: ['Started', 'In Progress', 'Finished', 'Abandoned'],
    default: 'Started'
  },

  activityLog: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    event: String,
    meta: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true
});

// Helpful multi-school indexes
activitySchema.index({ schoolId: 1, student: 1 });
activitySchema.index({ schoolId: 1, exam: 1 });
activitySchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model('Activity', activitySchema);
