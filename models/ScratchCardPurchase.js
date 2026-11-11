const mongoose = require('mongoose');

const ScratchCardPurchaseSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  provider: {
    type: String,
    enum: ['paystack', 'flutterwave'],
    required: true
  },
  reference: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  providerTransactionId: {
    type: String,
    default: ''
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    max: 1000
  },
  unitPriceNaira: {
    type: Number,
    required: true,
    default: 150
  },
  amountNaira: {
    type: Number,
    required: true
  },
  amountSubunits: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'NGN'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending',
    index: true
  },
  fulfillmentStatus: {
    type: String,
    enum: ['pending', 'processing', 'complete'],
    default: 'pending',
    index: true
  },
  fulfillmentStartedAt: {
    type: Date,
    default: null
  },
  checkoutUrl: {
    type: String,
    default: ''
  },
  generatedCodes: {
    type: [String],
    default: []
  },
  paidAt: {
    type: Date,
    default: null
  },
  providerResponse: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, {
  timestamps: true
});

ScratchCardPurchaseSchema.index({ schoolId: 1, createdAt: -1 });

module.exports = mongoose.models.ScratchCardPurchase ||
  mongoose.model('ScratchCardPurchase', ScratchCardPurchaseSchema);
