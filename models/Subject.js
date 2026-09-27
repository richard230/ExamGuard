const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const subjectSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },

  class: {
    type: Schema.Types.ObjectId,
    ref: 'Class',
    default: null
  },

  teacher: {
    type: Schema.Types.ObjectId,
    ref: 'Teacher',
    default: null
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

subjectSchema.index(
  { schoolId: 1, name: 1 },
  { unique: true }
);

subjectSchema.index({
  schoolId: 1,
  class: 1
});

subjectSchema.index({
  schoolId: 1,
  teacher: 1
});

module.exports = mongoose.model('Subject', subjectSchema);
