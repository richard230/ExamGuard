const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  regNo: { type: String, unique: true, sparse: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['superadmin', 'admin', 'teacher', 'student'], default: 'student' },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null, index: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
