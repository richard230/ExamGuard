const mongoose = require('mongoose');
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    regNo: {
      type: String,
      trim: true,
      default: undefined
    },
    password: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: [
        'superadmin',
        'admin',
        'teacher',
        'student'
      ],
      default: 'student',
      lowercase: true,
      trim: true
    },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);
userSchema.pre('save', function (next) {
  if (this.email) {
    this.email = this.email.trim().toLowerCase();
  }
  if (this.regNo) {
    this.regNo = this.regNo.trim();
  }
  next();
});
userSchema.index(
  { schoolId: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      schoolId: { $type: 'objectId' },
      email: { $type: 'string' }
    }
  }
);
userSchema.index(
  { schoolId: 1, regNo: 1 },
  {
    unique: true,
    partialFilterExpression: {
      schoolId: { $type: 'objectId' },
      regNo: { $type: 'string' }
    }
  }
);
userSchema.index({
  schoolId: 1,
  role: 1
});
module.exports = mongoose.model('User', userSchema);
