const mongoose = require('mongoose');
const StaffSchema = new mongoose.Schema({
  photo: String,
  first_name: String,
  last_name: String,
  other_names: String,
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other']
  },
  dob: Date,
  marital_status: {
    type: String,
    enum: ['Single', 'Married', 'Divorced', 'Widowed']
  },
  address: String,
  phone: String,
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  designation: String,
  department: String,
  duties: [{
    type: String
  }],
  staff_type: {
    type: String,
    enum: ['Teaching', 'Non-Teaching']
  },
  date_joined: Date,
  qualification: String,
  experience: Number,
  previous_employer: String,
  specialization: String,
  id_type: String,
  id_number: String,
  id_upload: String,
  kin_name: String,
  kin_relationship: String,
  kin_phone: String,
  kin_address: String,
  bank_name: String,
  account_name: String,
  account_number: String,
  pension: String,
  tax_id: String,
  classes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class'
  }],
  emergency_name: String,
  emergency_phone: String,
  emergency_relationship: String,
  login_email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  login_password: {
    type: String,
    required: true
  },
  access_level: {
    type: String,
    required: true,
    enum: [
      'Teacher',
      'Head Teacher',
      'Principal',
      'HR',
      'Account/Admin'
    ]
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
StaffSchema.index({ schoolId: 1, email: 1 }, { unique: true, sparse: true });
StaffSchema.index({ schoolId: 1, login_email: 1 }, { unique: true });
StaffSchema.index({ schoolId: 1, account_number: 1 }, { unique: true, sparse: true });
StaffSchema.index({ schoolId: 1, id_number: 1 }, { unique: true, sparse: true });
StaffSchema.index({ schoolId: 1, access_level: 1 });
StaffSchema.index({ schoolId: 1, staff_type: 1 });
module.exports = mongoose.model('Staff', StaffSchema);
