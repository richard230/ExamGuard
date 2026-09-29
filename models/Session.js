const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },

  startDate: {
    type: Date,
    required: true
  },

  endDate: {
    type: Date,
    required: true
  },

  is_active: {
    type: Boolean,
    default: true
  },

  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  }
}, {
  timestamps: true
});

/* Prevent duplicate session names within the same school */
SessionSchema.index(
  { schoolId: 1, name: 1 },
  { unique: true }
);

/* Quickly find active sessions for a school */
SessionSchema.index({
  schoolId: 1,
  is_active: 1
});

module.exports = mongoose.model('Session', SessionSchema);
