const mongoose = require('mongoose');
const subjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  ca1_score: { type: Number, default: 0 },
  ca2_score: { type: Number, default: 0 },
  midterm_score: { type: Number, default: 0 },
  exam_score: { type: Number, default: 0 },
  score: { type: Number, default: 0 },
  grade: { type: String, default: "" },
  remarks: { type: String, default: "" },
  subject_position: { type: String, default: "" },
  subject_position_num: { type: Number, default: 0 }
}, { _id: false });
const resultSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
    index: true
  },
  term: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Term',
    required: true,
    index: true
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
    index: true
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true,
    index: true
  },
  ca1_score: {
    type: Number,
    default: 0
  },
  ca2_score: {
    type: Number,
    default: 0
  },
  midterm_score: {
    type: Number,
    default: 0
  },
  exam_score: {
    type: Number,
    default: 0
  },
  score: {
    type: Number,
    default: 0
  },
  grade: {
    type: String,
    default: ""
  },
  remarks: {
    type: String,
    default: ""
  },
  subject_position: {
    type: String,
    default: ""
  },
  subject_position_num: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ["Draft", "Published"],
    default: "Draft",
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff'
  },
  affectiveRatings: {
    type: Object,
    default: {}
  },
  psychomotorRatings: {
    type: Object,
    default: {}
  },
  attendance: {
    total: {
      type: Number,
      default: 0
    },
    present: {
      type: Number,
      default: 0
    },
    absent: {
      type: Number,
      default: 0
    },
    percent: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});
resultSchema.index({
  schoolId: 1,
  student: 1,
  session: 1,
  term: 1,
  class: 1,
  subject: 1
}, {
  unique: true
});
resultSchema.index({
  schoolId: 1,
  session: 1,
  term: 1,
  class: 1,
  status: 1
});
resultSchema.index({
  schoolId: 1,
  class: 1,
  session: 1,
  term: 1,
  subject: 1,
  status: 1
});
module.exports = mongoose.model('Result', resultSchema);
