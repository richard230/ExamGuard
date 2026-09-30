const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const subjectSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
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

module.exports = mongoose.model('Subject', subjectSchema);
