const mongoose = require('mongoose');

const ParentSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true,
    match: /.+\@.+\..+/
  },
  phone: { 
    type: String,
    trim: true 
  },
  address: { 
    type: String,
    trim: true 
  },
  occupation: { 
    type: String,
    trim: true 
  },
  emergencyContactName: { 
    type: String,
    trim: true 
  },
  emergencyContactPhone: { 
    type: String,
    trim: true 
  },
  families: [{ 
    type: String,
    trim: true 
  }],
  studentIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student'
  }],
  password: {
    type: String,
    required: true,
    select: false
  },
  temporaryPassword: {
    type: String,
    select: false
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date
  },
  role: {
    type: String,
    enum: ['parent'],
    default: 'parent'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  profilePhoto: {
    type: String
  },
  notificationPreferences: {
    email: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
    inApp: { type: Boolean, default: true }
  }
}, { timestamps: true });

// Index for faster queries
ParentSchema.index({ email: 1 });
ParentSchema.index({ studentIds: 1 });

module.exports = mongoose.models.Parent || mongoose.model('Parent', ParentSchema);
