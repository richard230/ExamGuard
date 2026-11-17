const mongoose = require('mongoose');

const SchoolWalletTransactionSchema = new mongoose.Schema({
  type: { type: String, enum: ['credit', 'debit'], required: true },
  source: {
    type: String,
    enum: ['direct_transfer', 'paystack', 'paystack_dva', 'adjustment', 'expense', 'student_activation'],
    required: true
  },
  amount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['pending', 'completed', 'rejected'], default: 'pending' },
  reference: { type: String, required: true },
  payerName: String,
  payerEmail: String,
  description: String,
  createdAt: { type: Date, default: Date.now },
  verifiedAt: Date,
  verifiedBy: String,
  metadata: mongoose.Schema.Types.Mixed
}, { _id: true });

const DedicatedAccountSchema = new mongoose.Schema({
  id: Number,
  accountName: String,
  accountNumber: { type: String, trim: true },
  bankName: String,
  bankSlug: String,
  currency: { type: String, default: 'NGN' },
  active: { type: Boolean, default: false },
  assigned: { type: Boolean, default: false },
  createdAt: Date,
  consentAt: Date,
  consentedBy: String,
  lastRequeryAt: Date
}, { _id: false });

const SchoolWalletSchema = new mongoose.Schema({
  schoolId: { type: String, required: true, unique: true, index: true },
  currency: { type: String, default: 'NGN' },
  balance: { type: Number, default: 0, min: 0 },
  totalCredited: { type: Number, default: 0, min: 0 },
  totalDebited: { type: Number, default: 0, min: 0 },
  paystackCustomerCode: { type: String, default: '' },
  dedicatedAccount: { type: DedicatedAccountSchema, default: undefined },
  dedicatedAccountCreationLockUntil: Date,
  transactions: { type: [SchoolWalletTransactionSchema], default: [] }
}, { timestamps: true, collection: 'schoolwallets' });

SchoolWalletSchema.index(
  { 'dedicatedAccount.accountNumber': 1 },
  { unique: true, sparse: true, name: 'unique_school_wallet_dva_account_number' }
);

module.exports = mongoose.models.SchoolWallet || mongoose.model('SchoolWallet', SchoolWalletSchema);
