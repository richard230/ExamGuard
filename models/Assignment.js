const mongoose = require('mongoose');

const AssignmentSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },

  title: { type: String, required: true },

  description: {
    type: String,
    default: ""
  },

  type: {
    type: String,
    enum: ['STANDARD', 'QUESTION_BANK'],
    default: 'STANDARD'
  },

  questionsAllocated: [{
    type: String
  }],

  cbt: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: false
  },

  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },

  assignedTo: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student'
  }],

  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },

  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: true
  },

  files: [{
    url: String,
    name: String
  }],

  dueDate: {
    type: Date,
    required: true
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff'
  }

}, { timestamps: true });

AssignmentSchema.index({ schoolId: 1, teacher: 1 });
AssignmentSchema.index({ schoolId: 1, class: 1 });
AssignmentSchema.index({ schoolId: 1, subject: 1 });
AssignmentSchema.index({ schoolId: 1, createdAt: -1 });
AssignmentSchema.index({ schoolId: 1, dueDate: 1 });

module.exports = mongoose.model('Assignment', AssignmentSchema);
