const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  isCorrect: { type: Boolean, default: false }
}, { _id: true });

const questionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, required: true }, // HTML/Rich text
  imageUrl: { type: String },
  options: { type: [optionSchema], required: true },
  explanation: { type: String }, // Optional explanation/rationale
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

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

module.exports = mongoose.model('QuestionCollection', collectionSchema);
