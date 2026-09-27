const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TermSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },

  session: {
    type: Schema.Types.ObjectId,
    ref: 'Session',
    required: true
  },

  startDate: {
    type: Date
  },

  endDate: {
    type: Date
  },

  schoolId: {
    type: Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  }
}, {
  timestamps: true
});

TermSchema.index(
  { schoolId: 1, session: 1, name: 1 },
  { unique: true }
);

TermSchema.index({
  schoolId: 1,
  session: 1
});

module.exports = mongoose.model('Term', TermSchema);
