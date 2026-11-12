const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authMiddleware } = require('./auth');
const adminAuth = require('../middleware/adminAuth');

// Models
const Fee = require('../models/Fee');
const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');
const Expense = require('../models/Expense');
const CashRequest = require('../models/CashRequest');
const Student = require('../models/Student');
const Class = require('../models/Class');
const School = require('../models/School');


// ===== MULTI-SCHOOL / TENANT HELPERS (aligned with fees backend) =====
function getUserSchoolIdentifiers(user = {}) {
  const values = [
    user.schoolId, user.schoolKey, user.schoolCode,
    typeof user.school === 'string' ? user.school : null,
    user.school?.schoolId, user.school?._id
  ].filter(Boolean).map(value => String(value).trim());
  return [...new Set(values)];
}

function isPlatformAdmin(user = {}) {
  const roles = [user.role, user.userType, user.accountType, user.type]
    .filter(Boolean).map(value => String(value).toLowerCase().trim());
  return roles.some(role => [
    'systemadmin', 'system_admin', 'platformadmin', 'platform_admin'
  ].includes(role));
}

function getRequestedSchoolId(req) {
  return String(
    req.params?.schoolId || req.body?.schoolId || req.query?.schoolId ||
    req.headers?.['x-school-id'] || req.headers?.['x-school-code'] ||
    req.headers?.['x-schoolid'] || ''
  ).trim();
}

async function resolveCurrentSchool(req) {
  const user = req.user || {};
  const identifiers = getUserSchoolIdentifiers(user);
  const requestedId = getRequestedSchoolId(req);
  const platformAdmin = isPlatformAdmin(user);
  const schoolIdentifier = requestedId || identifiers[0] || '';
  if (!schoolIdentifier) return null;

  const query = { status: 'active', isDeleted: { $ne: true } };
  if (mongoose.Types.ObjectId.isValid(schoolIdentifier)) query._id = schoolIdentifier;
  else query.schoolId = schoolIdentifier;

  const school = await School.findOne(query).lean();
  if (!school) return null;

  if (!platformAdmin) {
    const belongs = identifiers.some(identifier =>
      identifier === String(school._id) || identifier === String(school.schoolId)
    );
    if (!belongs) {
      const error = new Error('You are not authorized to access this school.');
      error.statusCode = 403;
      throw error;
    }
  }
  return school;
}

function schoolFilter(schoolId, extra = {}) {
  return { ...extra, schoolId: String(schoolId) };
}

async function requireFinanceSchool(req, res) {
  const school = await resolveCurrentSchool(req);
  if (!school) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: No active school is associated with this account.'
    });
    return null;
  }
  req.school = school;
  req.schoolId = String(school._id);
  return school;
}

// Dedicated wallet collection: one ledger per school. Kept in this file so
// existing installations do not need an additional model import.
const SchoolWalletSchema = new mongoose.Schema({
  schoolId: { type: String, required: true, unique: true, index: true },
  currency: { type: String, default: 'NGN' },
  balance: { type: Number, default: 0, min: 0 },
  totalCredited: { type: Number, default: 0, min: 0 },
  totalDebited: { type: Number, default: 0, min: 0 },
  transactions: [{
    type: { type: String, enum: ['credit', 'debit'], required: true },
    source: { type: String, enum: ['direct_transfer', 'paystack', 'adjustment', 'expense', 'student_activation'], required: true },
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
  }]
}, { timestamps: true, collection: 'schoolwallets' });

const SchoolWallet = mongoose.models.SchoolWallet ||
  mongoose.model('SchoolWallet', SchoolWalletSchema);

function makeReference(prefix = 'WAL') {
  return `${prefix}-${Date.now()}-${require('crypto').randomBytes(4).toString('hex').toUpperCase()}`;
}

// ===== SCHOOL WALLET =====

/**
 * GET /api/finance/school-wallet
 * Return the authenticated school's wallet balance and recent ledger entries.
 */
router.get('/school-wallet', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const wallet = await SchoolWallet.findOne({ schoolId: req.schoolId }).lean();
    const transactions = (wallet?.transactions || [])
      .slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100);
    res.json({
      success: true,
      school: { _id: school._id, schoolId: school.schoolId, name: school.name || school.schoolName || '' },
      balance: wallet?.balance || 0,
      totalCredited: wallet?.totalCredited || 0,
      totalDebited: wallet?.totalDebited || 0,
      totalCredits: wallet?.totalCredited || 0,
      totalDebits: wallet?.totalDebited || 0,
      currency: wallet?.currency || 'NGN',
      transactions
    });
  } catch (err) {
    console.error('School wallet load failed:', err);
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/finance/school-wallet/funding/direct
 * Record a bank transfer claim. This does NOT credit the wallet until verified.
 */
router.post('/school-wallet/funding/direct', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const amount = Number(req.body.amount);
    const reference = String(req.body.reference || req.body.transferReference || '').trim();
    const payerName = String(req.body.payerName || '').trim();
    if (!Number.isFinite(amount) || amount <= 0 || !reference) {
      return res.status(400).json({ success: false, error: 'A valid amount and transfer reference are required.', message: 'A valid amount and transfer reference are required.' });
    }

    const duplicate = await SchoolWallet.findOne({
      schoolId: req.schoolId,
      'transactions.reference': reference
    }).lean();
    if (duplicate) return res.status(409).json({ success: false, error: 'This transfer reference has already been submitted.' });

    const wallet = await SchoolWallet.findOneAndUpdate(
      { schoolId: req.schoolId },
      {
        $setOnInsert: { schoolId: req.schoolId, currency: 'NGN' },
        $push: { transactions: {
          type: 'credit', source: 'direct_transfer', amount, status: 'pending',
          reference, payerName, description: 'Direct bank transfer awaiting verification',
          createdAt: new Date()
        }}
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({
      success: true,
      message: 'Transfer submitted for verification. The wallet will be credited after confirmation.',
      reference,
      balance: wallet.balance
    });
  } catch (err) {
    console.error('Direct wallet funding submission failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/finance/school-wallet/funding/paystack/initialize
 * Initialize Paystack checkout. Set PAYSTACK_SECRET_KEY in the server environment.
 */
router.post('/school-wallet/funding/paystack/initialize', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const amount = Number(req.body.amount);
    const email = String(req.body.email || req.body.payerEmail || '').trim();
    if (!Number.isFinite(amount) || amount <= 0 || !email) {
      return res.status(400).json({ success: false, error: 'A valid amount and payer email are required.' });
    }
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(503).json({ success: false, error: 'Paystack is not configured. Set PAYSTACK_SECRET_KEY on the server.' });
    }

    // Return to the exact finance page that started checkout. The callback URL
    // must be supplied by the browser (same-origin) or configured server-side.
    const requestedCallbackUrl = String(req.body.callbackUrl || process.env.PAYSTACK_CALLBACK_URL || '').trim();
    let callbackUrl = '';
    if (requestedCallbackUrl) {
      let parsedCallback;
      try { parsedCallback = new URL(requestedCallbackUrl); }
      catch (_) { return res.status(400).json({ success: false, error: 'A valid Paystack callback URL is required.' }); }
      const requestOrigin = req.get('origin');
      const isLocal = ['localhost', '127.0.0.1'].includes(parsedCallback.hostname);
      if ((parsedCallback.protocol !== 'https:' && !isLocal) ||
          (requestOrigin && parsedCallback.origin !== requestOrigin && requestedCallbackUrl !== process.env.PAYSTACK_CALLBACK_URL)) {
        return res.status(400).json({ success: false, error: 'The callback URL must use this finance page origin or the configured PAYSTACK_CALLBACK_URL.' });
      }
      callbackUrl = parsedCallback.toString();
    } else {
      return res.status(503).json({ success: false, error: 'Set PAYSTACK_CALLBACK_URL or provide callbackUrl from the finance page.' });
    }

    const reference = makeReference('SCHWAL');
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        amount: Math.round(amount * 100),
        reference,
        currency: 'NGN',
        callback_url: callbackUrl,
        metadata: {
          purpose: 'school_wallet_funding',
          schoolId: req.schoolId,
          schoolIdentifier: String(school.schoolId || school._id)
        }
      })
    });
    const payload = await response.json();
    if (!response.ok || !payload.status || !payload.data?.authorization_url) {
      return res.status(502).json({ success: false, error: payload.message || 'Unable to initialize Paystack payment.' });
    }

    await SchoolWallet.findOneAndUpdate(
      { schoolId: req.schoolId },
      {
        $setOnInsert: { schoolId: req.schoolId, currency: 'NGN' },
        $push: { transactions: {
          type: 'credit', source: 'paystack', amount, status: 'pending',
          reference, payerEmail: email,
          description: 'Paystack wallet funding',
          createdAt: new Date(),
          metadata: { accessCode: payload.data.access_code }
        }}
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, reference, checkoutUrl: payload.data.authorization_url, authorizationUrl: payload.data.authorization_url });
  } catch (err) {
    console.error('Paystack initialization failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/finance/school-wallet/funding/paystack/verify?reference=...
 * Verify with Paystack server-to-server and credit exactly once.
 */
router.get('/school-wallet/funding/paystack/verify', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const reference = String(req.query.reference || '').trim();
    if (!reference) return res.status(400).json({ success: false, error: 'Payment reference is required.' });
    if (!process.env.PAYSTACK_SECRET_KEY) return res.status(503).json({ success: false, error: 'Paystack is not configured.' });

    console.info('[SchoolWallet] Paystack verification requested', { schoolId: req.schoolId, reference });
    const wallet = await SchoolWallet.findOne({ schoolId: req.schoolId, 'transactions.reference': reference });
    if (!wallet) {
      console.warn('[SchoolWallet] Verification reference not found in this school wallet', { schoolId: req.schoolId, reference });
      return res.status(404).json({ success: false, error: 'This payment reference is not recorded in the current school wallet.' });
    }
    const transaction = wallet.transactions.find(t => String(t.reference) === reference);
    if (!transaction) return res.status(404).json({ success: false, error: 'Wallet transaction was not found.' });
    if (transaction.source !== 'paystack') {
      return res.status(400).json({ success: false, error: 'This transaction is not a Paystack payment. Bank transfers must be confirmed against the school bank statement.' });
    }
    if (transaction.status === 'completed') {
      return res.json({ success: true, alreadyVerified: true, credited: false, balance: wallet.balance, transaction });
    }
    if (transaction.status === 'rejected') {
      return res.status(409).json({ success: false, error: 'This transaction has been rejected and cannot be credited.' });
    }

    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.status || !payload.data) {
      console.error('[SchoolWallet] Paystack verification API error', { httpStatus: response.status, message: payload.message, reference });
      return res.status(502).json({ success: false, error: payload.message || `Paystack verification service returned HTTP ${response.status}.` });
    }
    const paystackData = payload.data;
    const paidAmountKobo = Number(paystackData.amount);
    const expectedAmountKobo = Math.round(Number(transaction.amount) * 100);
    const metadataSchoolId = paystackData.metadata?.schoolId;
    const metadataMatches = metadataSchoolId == null || String(metadataSchoolId) === String(req.schoolId);
    const referenceMatches = String(paystackData.reference || '') === reference;
    const amountMatches = Number.isFinite(paidAmountKobo) && paidAmountKobo === expectedAmountKobo;
    const currencyMatches = !paystackData.currency || String(paystackData.currency).toUpperCase() === 'NGN';
    if (String(paystackData.status || '').toLowerCase() !== 'success' || !referenceMatches || !amountMatches || !currencyMatches || !metadataMatches) {
      console.warn('[SchoolWallet] Paystack transaction did not pass validation', {
        reference, paystackStatus: paystackData.status, referenceMatches, amountMatches,
        currencyMatches, metadataMatches, expectedAmountKobo, paidAmountKobo,
        metadataSchoolId: metadataSchoolId == null ? null : String(metadataSchoolId), schoolId: String(req.schoolId)
      });
      return res.status(409).json({ success: false, error: 'Paystack has not confirmed a matching successful payment for this reference. Check the reference, amount, currency and school, then retry.' });
    }

    // Atomic conditional update prevents duplicate credits if the user taps Verify more than once.
    const result = await SchoolWallet.updateOne(
      { schoolId: req.schoolId, transactions: { $elemMatch: { reference, source: 'paystack', status: 'pending' } } },
      {
        $inc: { balance: transaction.amount, totalCredited: transaction.amount },
        $set: { 'transactions.$.status': 'completed', 'transactions.$.verifiedAt': new Date(), 'transactions.$.metadata.paystackTransactionId': paystackData.id }
      }
    );
    const updated = await SchoolWallet.findOne({ schoolId: req.schoolId }).lean();
    const credited = result.modifiedCount === 1;
    console.info('[SchoolWallet] Paystack verification finished', { schoolId: req.schoolId, reference, credited, balance: updated?.balance || 0 });
    res.json({ success: true, credited, alreadyVerified: !credited, balance: updated?.balance || 0, reference });
  } catch (err) {
    console.error('Paystack verification failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/finance/school-wallet/funding/direct/:reference
 * Admin confirms/rejects a direct bank transfer. Only confirmed transfers credit the wallet.
 */
router.patch('/school-wallet/funding/direct/:reference', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const reference = String(req.params.reference || '').trim();
    const status = String(req.body.status || '').toLowerCase();
    if (!['completed', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Status must be completed or rejected.' });
    }
    const wallet = await SchoolWallet.findOne({ schoolId: req.schoolId, 'transactions.reference': reference });
    if (!wallet) return res.status(404).json({ success: false, error: 'Transfer reference not found.' });
    const transaction = wallet.transactions.find(t => t.reference === reference);
    if (transaction.source !== 'direct_transfer') return res.status(400).json({ success: false, error: 'Reference is not a direct transfer.' });
    if (transaction.status !== 'pending') return res.status(409).json({ success: false, error: 'This transfer has already been processed.' });

    const update = status === 'completed'
      ? {
          $inc: { balance: transaction.amount, totalCredited: transaction.amount },
          $set: { 'transactions.$.status': 'completed', 'transactions.$.verifiedAt': new Date(), 'transactions.$.verifiedBy': String(req.user?._id || req.user?.id || '') }
        }
      : { $set: { 'transactions.$.status': 'rejected', 'transactions.$.verifiedAt': new Date(), 'transactions.$.verifiedBy': String(req.user?._id || req.user?.id || '') } };
    const result = await SchoolWallet.updateOne(
      { schoolId: req.schoolId, transactions: { $elemMatch: { reference, status: 'pending' } } },
      update
    );
    if (!result.modifiedCount) return res.status(409).json({ success: false, error: 'Transfer has already been processed.' });
    const updated = await SchoolWallet.findOne({ schoolId: req.schoolId }).lean();
    res.json({ success: true, status, balance: updated.balance });
  } catch (err) {
    console.error('Direct transfer verification failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ===== DASHBOARD SUMMARY =====

/**
 * GET /api/finance/summary
 * Returns comprehensive financial summary
 */
router.get('/summary', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Total Revenue (All payments completed)
    const totalRevenuePipeline = [
      { $match: schoolFilter(req.schoolId, { status: 'completed' }) },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ];
    const totalRevenueResult = await Payment.aggregate(totalRevenuePipeline);
    const totalRevenue = totalRevenueResult[0]?.total || 0;

    // Month Revenue
    const monthRevenuePipeline = [
      { $match: schoolFilter(req.schoolId, { status: 'completed', transactionDate: { $gte: startOfMonth } }) },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ];
    const monthRevenueResult = await Payment.aggregate(monthRevenuePipeline);
    const monthRevenue = monthRevenueResult[0]?.total || 0;

    // Year Revenue
    const yearRevenuePipeline = [
      { $match: schoolFilter(req.schoolId, { status: 'completed', transactionDate: { $gte: startOfYear } }) },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ];
    const yearRevenueResult = await Payment.aggregate(yearRevenuePipeline);
    const yearRevenue = yearRevenueResult[0]?.total || 0;

    // Pending Payments
    const pendingPipeline = [
      { $match: schoolFilter(req.schoolId, { status: { $in: ['pending', 'overdue'] } }) },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ];
    const pendingResult = await Fee.aggregate(pendingPipeline);
    const totalPending = pendingResult[0]?.total || 0;

    // Paid Fees
    const paidPipeline = [
      { $match: schoolFilter(req.schoolId, { status: 'paid' }) },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ];
    const paidResult = await Fee.aggregate(paidPipeline);
    const totalPaid = paidResult[0]?.total || 0;

    // Total Expenses
    const expensesPipeline = [
      { $match: schoolFilter(req.schoolId, { status: 'approved' }) },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ];
    const expensesResult = await Expense.aggregate(expensesPipeline);
    const totalExpenses = expensesResult[0]?.total || 0;

    // Pending Expenses
    const pendingExpensesPipeline = [
      { $match: schoolFilter(req.schoolId, { status: 'pending' }) },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ];
    const pendingExpensesResult = await Expense.aggregate(pendingExpensesPipeline);
    const totalPendingExpenses = pendingExpensesResult[0]?.total || 0;

    // Cash in Bank (Approved cash requests - disbursed)
    const cashRequestsPipeline = [
      { $match: schoolFilter(req.schoolId, { status: 'disbursed' }) },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ];
    const cashRequestsResult = await CashRequest.aggregate(cashRequestsPipeline);
    const totalCashRequests = cashRequestsResult[0]?.total || 0;

    // Count of unpaid students
    const unpaidStudents = await Fee.countDocuments(schoolFilter(req.schoolId, { status: { $in: ['pending', 'overdue'] } }));

    // Count of overdue fees
    const overdueFeesCount = await Fee.countDocuments(schoolFilter(req.schoolId, {
      status: 'overdue', dueDate: { $lt: now }
    }));

    // Invoice stats
    const invoiceStats = await Invoice.aggregate([
      { $match: { schoolId: req.schoolId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$netAmount' }
        }
      }
    ]);

    res.json({
      revenue: {
        total: totalRevenue,
        thisMonth: monthRevenue,
        thisYear: yearRevenue
      },
      fees: {
        paid: totalPaid,
        pending: totalPending,
        unpaidStudents,
        overdueCount: overdueFeesCount
      },
      expenses: {
        approved: totalExpenses,
        pending: totalPendingExpenses
      },
      cash: {
        disbursed: totalCashRequests
      },
      invoices: invoiceStats.reduce((acc, item) => {
        acc[item._id] = { count: item.count, amount: item.totalAmount };
        return acc;
      }, {}),
      netIncome: totalRevenue - totalExpenses
    });
  } catch (err) {
    console.error('Error fetching finance summary:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== DASHBOARD STATISTICS =====

/**
 * GET /api/finance/statistics
 * Returns financial overview: total revenue, payments, pending, expenses
 */
router.get('/statistics', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const paidPayments = await Payment.aggregate([
      { $match: schoolFilter(req.schoolId, { status: 'completed' }) },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const pendingFees = await Fee.aggregate([
      { $match: schoolFilter(req.schoolId, { status: { $in: ['pending', 'overdue'] } }) },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const expenses = await Expense.aggregate([
      { $match: schoolFilter(req.schoolId, { status: 'approved' }) },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const totalRevenue = (paidPayments[0]?.total || 0) + (await Fee.aggregate([
      { $match: schoolFilter(req.schoolId, { status: 'paid' }) },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]))[0]?.total || 0;

    res.json({
      totalRevenue,
      totalPayments: paidPayments[0]?.total || 0,
      totalPending: pendingFees[0]?.total || 0,
      totalExpenses: expenses[0]?.total || 0
    });
  } catch (err) {
    console.error('Error fetching statistics:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== TRANSACTIONS =====

/**
 * GET /api/finance/transactions
 * Fetch all financial transactions (payments, expenses, cash requests)
 */
router.get('/transactions', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const { type, status, startDate, endDate, limit = 100 } = req.query;
    const skip = parseInt(req.query.skip) || 0;

    let matchStage = schoolFilter(req.schoolId);
    if (status) matchStage.status = status;
    if (startDate && endDate) {
      matchStage.transactionDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    let transactions = [];

    if (!type || type === 'all') {
      // Fetch payments
      const payments = await Payment.find(matchStage)
        .populate('student', 'name regNo')
        .sort({ transactionDate: -1 })
        .limit(parseInt(limit))
        .skip(skip);

      const paymentsFormatted = payments.map(p => ({
        _id: p._id,
        type: 'payment',
        studentName: p.student?.name || 'N/A',
        amount: p.amount,
        status: p.status,
        method: p.paymentMethod,
        date: p.transactionDate,
        ref: p.receiptNumber
      }));

      transactions = paymentsFormatted;
    } else if (type === 'payment') {
      const payments = await Payment.find(matchStage)
        .populate('student', 'name regNo')
        .sort({ transactionDate: -1 })
        .limit(parseInt(limit))
        .skip(skip);

      transactions = payments.map(p => ({
        _id: p._id,
        type: 'payment',
        studentName: p.student?.name || 'N/A',
        amount: p.amount,
        status: p.status,
        method: p.paymentMethod,
        date: p.transactionDate,
        ref: p.receiptNumber
      }));
    } else if (type === 'expense') {
      const expenses = await Expense.find(matchStage)
        .sort({ requestDate: -1 })
        .limit(parseInt(limit))
        .skip(skip);

      transactions = expenses.map(e => ({
        _id: e._id,
        type: 'expense',
        description: e.purpose,
        amount: e.amount,
        status: e.status,
        category: e.category,
        date: e.requestDate,
        ref: e.requestNumber
      }));
    } else if (type === 'cash') {
      const cashRequests = await CashRequest.find(matchStage)
        .sort({ requestDate: -1 })
        .limit(parseInt(limit))
        .skip(skip);

      transactions = cashRequests.map(c => ({
        _id: c._id,
        type: 'cash',
        description: c.reason,
        amount: c.amount,
        status: c.status,
        date: c.requestDate,
        ref: c.requestNumber
      }));
    }

    res.json({
      count: transactions.length,
      transactions
    });
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== APPROVALS =====

/**
 * GET /api/finance/approvals
 * Fetch pending approvals (expenses and cash requests)
 */
router.get('/approvals', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const pendingExpenses = await Expense.find(schoolFilter(req.schoolId, { status: 'pending' }))
      .sort({ requestDate: -1 })
      .limit(50);

    const pendingCashRequests = await CashRequest.find(schoolFilter(req.schoolId, { status: 'pending' }))
      .sort({ requestDate: -1 })
      .limit(50);

    const approvals = [
      ...pendingExpenses.map(e => ({
        _id: e._id,
        type: 'expense',
        requestNumber: e.requestNumber,
        description: e.purpose,
        amount: e.amount,
        requestedBy: e.requestedBy,
        category: e.category,
        requestDate: e.requestDate,
        priority: e.priority
      })),
      ...pendingCashRequests.map(c => ({
        _id: c._id,
        type: 'cash_request',
        requestNumber: c.requestNumber,
        description: c.reason,
        amount: c.amount,
        requestedBy: c.requestedBy,
        purpose: c.purpose,
        requestDate: c.requestDate,
        priority: c.priority
      }))
    ];

    approvals.sort((a, b) => new Date(b.requestDate) - new Date(a.requestDate));

    res.json({
      count: approvals.length,
      approvals: approvals.slice(0, 100)
    });
  } catch (err) {
    console.error('Error fetching approvals:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== BANK ACCOUNTS =====

/**
 * GET /api/finance/bank-accounts
 * Fetch configured bank accounts
 */
router.get('/bank-accounts', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    // No hard-coded bank balances: configure real bank accounts per school before displaying them.
    const bankAccounts = [];
    const totalBalance = 0;

    res.json({
      accounts: bankAccounts,
      totalBalance,
      count: bankAccounts.length
    });
  } catch (err) {
    console.error('Error fetching bank accounts:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== FEE MANAGEMENT =====

/**
 * GET /api/finance/fees
 * Fetch all student fees with filtering
 */
router.get('/fees', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const { status, term, classId, search } = req.query;
    let query = schoolFilter(req.schoolId);

    if (status) query.status = status;
    if (term) query.term = term;
    if (classId) query.class = classId;
    if (search) {
      query.$or = [
        { 'student.name': { $regex: search, $options: 'i' } },
        { 'student.regNo': { $regex: search, $options: 'i' } }
      ];
    }

    const fees = await Fee.find(query)
      .populate('student', 'name regNo')
      .populate('class', 'name')
      .sort({ dueDate: 1 })
      .limit(100);

    res.json(fees);
  } catch (err) {
    console.error('Error fetching fees:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/finance/fees
 * Create a new fee record
 */
router.post('/fees', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const { studentId, feeType, amount, term, session, dueDate, description } = req.body;

    if (!studentId || !feeType || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const student = await Student.findOne(schoolFilter(req.schoolId, { _id: studentId }));
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const fee = new Fee({
      schoolId: req.schoolId,
      student: studentId,
      class: student.class,
      feeType,
      amount,
      term,
      session,
      dueDate: new Date(dueDate),
      status: 'pending',
      description
    });

    await fee.save();
    await fee.populate('student class');

    res.status(201).json({ success: true, fee });
  } catch (err) {
    console.error('Error creating fee:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/finance/fees/:feeId
 * Update fee status
 */
router.patch('/fees/:feeId', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const { status, amountPaid, paymentMethod, notes } = req.body;
    const fee = await Fee.findOne(schoolFilter(req.schoolId, { _id: req.params.feeId }));

    if (!fee) return res.status(404).json({ error: 'Fee not found' });

    if (status) fee.status = status;
    if (amountPaid !== undefined) fee.amountPaid = amountPaid;
    if (paymentMethod) fee.paymentMethod = paymentMethod;
    if (notes) fee.notes = notes;

    await fee.save();
    await fee.populate('student class');

    res.json({ success: true, fee });
  } catch (err) {
    console.error('Error updating fee:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/finance/fees/:feeId
 * Delete a fee record
 */
router.delete('/fees/:feeId', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const fee = await Fee.findOneAndDelete(schoolFilter(req.schoolId, { _id: req.params.feeId }));
    if (!fee) return res.status(404).json({ error: 'Fee not found' });

    res.json({ success: true, message: 'Fee deleted' });
  } catch (err) {
    console.error('Error deleting fee:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== INVOICE MANAGEMENT =====

/**
 * GET /api/finance/invoices
 * Fetch all invoices
 */
router.get('/invoices', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const { status, search } = req.query;
    let query = schoolFilter(req.schoolId);

    if (status) query.status = status;
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { 'student.name': { $regex: search, $options: 'i' } }
      ];
    }

    const invoices = await Invoice.find(query)
      .populate('student', 'name email regNo')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(invoices);
  } catch (err) {
    console.error('Error fetching invoices:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/finance/invoices
 * Create a new invoice
 */
router.post('/invoices', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const { studentId, items, notes } = req.body;

    if (!studentId || !items || items.length === 0) {
      return res.status(400).json({ error: 'Invalid invoice data' });
    }

    const student = await Student.findOne(schoolFilter(req.schoolId, { _id: studentId }));
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

    const invoice = new Invoice({
      schoolId: req.schoolId,
      student: studentId,
      items,
      totalAmount,
      status: 'pending',
      notes,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    });

    await invoice.save();
    const invoiceNumber = `INV-${invoice._id.toString().slice(-6).toUpperCase()}`;
    invoice.invoiceNumber = invoiceNumber;
    await invoice.save();

    await invoice.populate('student');

    res.status(201).json({ success: true, invoice });
  } catch (err) {
    console.error('Error creating invoice:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/finance/invoices/:invoiceId
 * Update invoice status
 */
router.patch('/invoices/:invoiceId', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const { status } = req.body;
    const invoice = await Invoice.findOneAndUpdate(
      schoolFilter(req.schoolId, { _id: req.params.invoiceId }),
      { status },
      { new: true }
    ).populate('student');

    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    res.json({ success: true, invoice });
  } catch (err) {
    console.error('Error updating invoice:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== PAYMENT RECEIPTS =====

/**
 * GET /api/finance/receipts
 * Fetch all payment receipts
 */
router.get('/receipts', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const { search } = req.query;
    let query = schoolFilter(req.schoolId, { status: 'completed' });

    if (search) {
      query.$or = [
        { receiptNumber: { $regex: search, $options: 'i' } },
        { 'student.name': { $regex: search, $options: 'i' } }
      ];
    }

    const receipts = await Payment.find(query)
      .populate('student', 'name email regNo')
      .sort({ transactionDate: -1 })
      .limit(100);

    res.json(receipts);
  } catch (err) {
    console.error('Error fetching receipts:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/finance/receipts/:receiptId
 * Get single receipt details
 */
router.get('/receipts/:receiptId', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const receipt = await Payment.findOne(schoolFilter(req.schoolId, { _id: req.params.receiptId }))
      .populate('student')
      .populate('invoice');

    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });

    res.json(receipt);
  } catch (err) {
    console.error('Error fetching receipt:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== EXPENSE TRACKING =====

/**
 * GET /api/finance/expenses
 * Fetch all expense requests
 */
router.get('/expenses', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const { status, category, search } = req.query;
    let query = schoolFilter(req.schoolId);

    if (status) query.status = status;
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { purpose: { $regex: search, $options: 'i' } },
        { requestedBy: { $regex: search, $options: 'i' } }
      ];
    }

    const expenses = await Expense.find(query)
      .sort({ requestDate: -1 })
      .limit(100);

    res.json(expenses);
  } catch (err) {
    console.error('Error fetching expenses:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/finance/expenses
 * Create a new expense request
 */
router.post('/expenses', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const { requestedBy, category, amount, purpose, description, attachments } = req.body;

    if (!requestedBy || !category || !amount || !purpose) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const expense = new Expense({
      schoolId: req.schoolId,
      requestedBy,
      category,
      amount,
      purpose,
      description,
      attachments,
      status: 'pending',
      requestDate: new Date()
    });

    await expense.save();

    res.status(201).json({ success: true, expense });
  } catch (err) {
    console.error('Error creating expense:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/finance/expenses/:expenseId
 * Update expense status (approve/reject/pay)
 */
router.patch('/expenses/:expenseId', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const { status, approverNotes } = req.body;
    const expense = await Expense.findOne(schoolFilter(req.schoolId, { _id: req.params.expenseId }));

    if (!expense) return res.status(404).json({ error: 'Expense not found' });

    expense.status = status;
    if (approverNotes) expense.approverNotes = approverNotes;

    if (status === 'approved') {
      expense.approvalDate = new Date();
    } else if (status === 'paid') {
      expense.paidDate = new Date();
    }

    await expense.save();

    res.json({ success: true, expense });
  } catch (err) {
    console.error('Error updating expense:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== CASH REQUESTS =====

/**
 * GET /api/finance/cash-requests
 * Fetch all cash requests
 */
router.get('/cash-requests', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const { status } = req.query;
    let query = schoolFilter(req.schoolId);

    if (status) query.status = status;

    const requests = await CashRequest.find(query)
      .sort({ requestDate: -1 })
      .limit(100);

    res.json(requests);
  } catch (err) {
    console.error('Error fetching cash requests:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/finance/cash-requests
 * Create a new cash request
 */
router.post('/cash-requests', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const { requestedBy, amount, reason, description } = req.body;

    if (!requestedBy || !amount || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const cashRequest = new CashRequest({
      schoolId: req.schoolId,
      requestedBy,
      amount,
      reason,
      description,
      status: 'pending',
      requestDate: new Date()
    });

    await cashRequest.save();

    res.status(201).json({ success: true, cashRequest });
  } catch (err) {
    console.error('Error creating cash request:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/finance/cash-requests/:requestId
 * Approve/reject/process cash request
 */
router.patch('/cash-requests/:requestId', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const { status, approverNotes } = req.body;
    const cashRequest = await CashRequest.findOne(schoolFilter(req.schoolId, { _id: req.params.requestId }));

    if (!cashRequest) return res.status(404).json({ error: 'Cash request not found' });

    cashRequest.status = status;
    if (approverNotes) cashRequest.approverNotes = approverNotes;

    if (status === 'approved') {
      cashRequest.approvalDate = new Date();
    } else if (status === 'disbursed') {
      cashRequest.disburseDate = new Date();
    }

    await cashRequest.save();

    res.json({ success: true, cashRequest });
  } catch (err) {
    console.error('Error updating cash request:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== MONTHLY REVENUE REPORT =====

/**
 * GET /api/finance/revenue/monthly
 * Get monthly revenue trend for the year
 */
router.get('/revenue/monthly', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const year = req.query.year || new Date().getFullYear();

    const monthlyData = await Payment.aggregate([
      {
        $match: schoolFilter(req.schoolId, {
          status: 'completed',
          transactionDate: {
            $gte: new Date(`${year}-01-01`),
            $lt: new Date(`${year}-12-31`)
          }
        }),
      },
      {
        $group: {
          _id: { $month: '$transactionDate' },
          total: { $sum: '$amount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Fill missing months with 0
    const fullYearData = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const found = monthlyData.find(d => d._id === month);
      return {
        month,
        monthName: new Date(year, i).toLocaleString('default', { month: 'short' }),
        revenue: found?.total || 0
      };
    });

    res.json(fullYearData);
  } catch (err) {
    console.error('Error fetching monthly revenue:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== PAYMENT STATUS DISTRIBUTION =====

/**
 * GET /api/finance/payment-distribution
 * Get payment status breakdown
 */
router.get('/payment-distribution', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const distribution = await Fee.aggregate([
      { $match: { schoolId: req.schoolId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    const formatted = {
      paid: 0,
      pending: 0,
      overdue: 0,
      waived: 0
    };

    distribution.forEach(item => {
      if (item._id in formatted) {
        formatted[item._id] = item.totalAmount;
      }
    });

    res.json(formatted);
  } catch (err) {
    console.error('Error fetching payment distribution:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== EXPORT DATA =====

/**
 * GET /api/finance/export/fees
 * Export fees data as CSV
 */
router.get('/export/fees', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await requireFinanceSchool(req, res);
    if (!school) return;
    const fees = await Fee.find(schoolFilter(req.schoolId))
      .populate('student', 'name regNo')
      .populate('class', 'name');

    let csv = 'Student Name,RegNo,Class,Fee Type,Amount,Status,Term,Session,Due Date,Payment Method\n';
    
    fees.forEach(fee => {
      csv += `"${fee.student?.name || ''}","${fee.student?.regNo || ''}","${fee.class?.name || ''}","${fee.feeType}",${fee.amount},"${fee.status}","${fee.term}","${fee.session}","${fee.dueDate?.toLocaleDateString()}","${fee.paymentMethod || ''}"\n`;
    });

    res.header('Content-Type', 'text/csv');
    res.header('Content-Disposition', 'attachment; filename="fees_export.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Error exporting fees:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
