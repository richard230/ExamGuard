const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema({
  teacher_id: {
    type: String,
    trim: true
  },

  firstname: {
    type: String,
    required: true,
    trim: true
  },

  surname: {
    type: String,
    required: true,
    trim: true
  },

  othernames: {
    type: String,
    default: ""
  },

  gender: {
    type: String,
    default: ""
  },

  dob: {
    type: Date
  },

  email: {
    type: String,
    trim: true,
    lowercase: true
  },

  phone: {
    type: String,
    default: ""
  },

  address: {
    type: String,
    default: ""
  },

  password: {
    type: String
  },

  login_password: {
    type: String
  },

  role: {
    type: String,
    default: "teacher"
  },

  staffNo: {
    type: String,
    trim: true
  },

  subjects: [{
    type: String
  }],

  classes: [{
    type: String
  }],

  photoBase64: {
    type: String,
    default: ""
  },

  qualifications: {
    type: String,
    default: ""
  },

  employmentDate: {
    type: Date
  },

  status: {
    type: String,
    default: "active"
  },

  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

teacherSchema.index(
  { schoolId: 1, teacher_id: 1 },
  { unique: true, sparse: true }
);

teacherSchema.index(
  { schoolId: 1, email: 1 },
  { unique: true, sparse: true }
);

teacherSchema.index(
  { schoolId: 1, staffNo: 1 },
  { unique: true, sparse: true }
);

teacherSchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model('Teacher', teacherSchema);
