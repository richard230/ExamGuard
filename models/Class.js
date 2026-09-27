const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const classSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },

  arms: [{
    type: String,
    trim: true
  }],

  teachers: [{
    type: Schema.Types.ObjectId,
    ref: 'Teacher'
  }],

  subjects: [{
    subject: {
      type: Schema.Types.ObjectId,
      ref: 'Subject'
    },

    teacher: {
      type: Schema.Types.ObjectId,
      ref: 'Teacher'
    }
  }],

  schoolId: {
    type: Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  }
}, {
  timestamps: true
});

classSchema.index(
  { schoolId: 1, name: 1 },
  { unique: true }
);

classSchema.index({
  schoolId: 1,
  'teachers': 1
});

classSchema.index({
  schoolId: 1,
  'subjects.subject': 1
});

module.exports = mongoose.model('Class', classSchema);
