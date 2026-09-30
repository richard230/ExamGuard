const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  isCorrect: { type: Boolean, default: false }
}, { _id: true });

const questionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  imageUrl: String,
  options: { type: [optionSchema], required: true },
  explanation: String,
  createdAt: { type: Date, default: Date.now }
});

const collectionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
  questions: { type: [questionSchema], default: [] },
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Index for faster queries
collectionSchema.index({ teacher: 1, createdAt: -1 });
collectionSchema.index({ class: 1 });
collectionSchema.index({ subject: 1 });

module.exports = mongoose.model('Collection', collectionSchema);
