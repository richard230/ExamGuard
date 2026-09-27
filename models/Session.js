const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
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

SessionSchema.index(
  { schoolId: 1, name: 1 },
  { unique: true }
);

SessionSchema.index({
  schoolId: 1,
  is_active: 1
});

module.exports = mongoose.model('Session', SessionSchema);
