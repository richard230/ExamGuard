const mongoose = require('mongoose');

const guardianSchema = new mongoose.Schema({
  name: String,
  relationship: String,
  phone: String,
  email: String,
  address: String,
  occupation: String,
});

const docSchema = new mongoose.Schema({
  label: String,
  value: String,
  base64: String,
  uploadedAt: Date,
});

const academicSchema = new mongoose.Schema({
  session: String,
  term: String,
  class: String,
  subject: String,
  score: Number,
  grade: String,
  remarks: String,
  date: Date,
});

const attendanceSchema = new mongoose.Schema({
  session: String,
  term: String,
  present: Number,
  total: Number,
  date: Date,
});

const feeSchema = new mongoose.Schema({
  session: String,
  term: String,
  type: String,
  amount: Number,
  status: String,
  date: Date,
});

const skillsReportSchema = new mongoose.Schema({
  session: String,
  term: String,
  skills: mongoose.Schema.Types.Mixed,
  attendance: mongoose.Schema.Types.Mixed,
  comment: String,
  updatedAt: Date,
});

const hostelSchema = new mongoose.Schema({}, { strict: false });
const transportSchema = new mongoose.Schema({}, { strict: false });

const StudentSchema = new mongoose.Schema({
  student_id: { type: String, unique: true, required: true },
  surname: { type: String, required: true },
  accountStatus: String,
  subscriptionStatus: String,
  firstname: { type: String, required: true },
  othernames: { type: String, default: '' },
  dob: { type: String, required: true },
  gender: { type: String, required: true },
  nationality: { type: String, default: '' },
  state: { type: String, default: '' },
  lga: { type: String, default: '' },
  address: { type: String, default: '' },
  photoBase64: { type: String, default: '' },
  regNo: { type: String, unique: true, required: true },
  scratchCard: { type: String, unique: true, required: true },
  class: { type: String, required: true },
  classArm: { type: String, default: '' },
  previousSchool: { type: String, default: '' },
  admissionDate: { type: Date },
  academicSession: { type: String, default: '' },
  parentName: { type: String, required: true },
  parentRelationship: { type: String, required: true },
  parentPhone: { type: String, required: true },
  parentEmail: { type: String, default: '' },
  parentAddress: { type: String, default: '' },
  parentOccupation: { type: String, default: '' },
  studentEmail: { type: String, default: '' },
  studentPhone: { type: String, default: '' },
  religion: { type: String, default: '' },
  bloodGroup: { type: String, default: '' },
  genotype: { type: String, default: '' },
  medical: { type: String, default: '' },
  password: { type: String, required: true },
  // NEW: Reference to parent account
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Parent',
    default: null
  },
  academic: [academicSchema],
  attendance: [attendanceSchema],
  guardians: [guardianSchema],
  hostel: hostelSchema,
  transport: transportSchema,
  fees: [feeSchema],
  docs: [docSchema],
  skillsReports: [skillsReportSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Student', StudentSchema);
