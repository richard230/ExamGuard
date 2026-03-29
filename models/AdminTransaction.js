const mongoose = require('mongoose');

const AdminTransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Utilities', 'Maintenance', 'Supplies', 'Insurance', 'Contractor', 'Equipment', 'Other'],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  vendor: {
    type: String,
    required: true // Company or individual name
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['Paid', 'Unpaid', 'Pending', 'Approved', 'Rejected', 'Waived'],
    default: 'Pending'
  },
  method: {
    type: String,
    enum: ['Bank Transfer', 'Check', 'Cash', 'Mobile Money', 'Online'],
    default: null
  },
  reference: String, // Check number, transaction ID, etc.
  notes: String,
  date: {
    type: Date,
    default: Date.now
  },
  paidDate: Date,
  paidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  attachments: [String], // URLs to receipts, invoices, etc.
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Index for faster queries
AdminTransactionSchema.index({ type: 1 });
AdminTransactionSchema.index({ status: 1 });
AdminTransactionSchema.index({ date: -1 });
AdminTransactionSchema.index({ vendor: 1 });

module.exports = mongoose.model('AdminTransaction', AdminTransactionSchema);
