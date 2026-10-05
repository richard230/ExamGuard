const mongoose = require('mongoose');

const { Schema, model } = mongoose;

const schoolEnquirySchema = new Schema(
  {
    school: {
      type: Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true
    },

    schoolId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true
    },

    schoolName: {
      type: String,
      required: true,
      trim: true
    },

    schoolSubdomain: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
      default: ''
    },

    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 160,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      index: true
    },

    phone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40
    },

    grade: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },

    comments: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ''
    },

    source: {
      type: String,
      trim: true,
      maxlength: 60,
      default: 'school-homepage'
    },

    status: {
      type: String,
      enum: ['new', 'contacted', 'closed', 'spam'],
      default: 'new',
      index: true
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

schoolEnquirySchema.index({ school: 1, createdAt: -1 });
schoolEnquirySchema.index({ school: 1, status: 1, createdAt: -1 });

module.exports = model('SchoolEnquiry', schoolEnquirySchema);
module.exports.default = module.exports;
