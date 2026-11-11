const mongoose = require('mongoose');

const ScratchCardSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  purchaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ScratchCardPurchase',
    required: true,
    index: true
  },
  purchaseSequence: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['available', 'assigned', 'used', 'expired', 'replaced', 'revoked'],
    default: 'available',
    index: true
  },
  assignedStudent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    default: null,
    index: true
  },
  assignedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    default: null,
    index: true
  },
  usedCount: {
    type: Number,
    default: 0,
    min: 0
  },
  expiredAt: {
    type: Date,
    default: null
  },
  revokedAt: {
    type: Date,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

ScratchCardSchema.index({ schoolId: 1, code: 1 }, { unique: true });
ScratchCardSchema.index({ purchaseId: 1, purchaseSequence: 1 }, { unique: true });
ScratchCardSchema.index({ schoolId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.ScratchCard ||
  mongoose.model('ScratchCard', ScratchCardSchema);
