
const mongoose = require('mongoose');
const CBTQuestionSchema = new mongoose.Schema({
  text: String,
  options: [String],
 answer: [Number],
  score: { type: Number, default: 1 }
});
const CBTSchema = new mongoose.Schema({
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  title: { type: String, required: true },
  duration: { type: Number, required: true },
  questions: [CBTQuestionSchema],
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('CBT', CBTSchema);
