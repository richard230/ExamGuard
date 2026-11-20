const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const router = express.Router();

const { authMiddleware } = require('./auth');
const adminAuth = require('../middleware/adminAuth');
const School = require('../models/School');
const Student = require('../models/Student');
const ScratchCard = require('../models/ScratchCard');
const ScratchCardPurchase = require('../models/ScratchCardPurchase');
const SchoolWallet = require('../models/SchoolWallet');

const CARD_PRICE_NAIRA = 150;
const MAX_PURCHASE_QUANTITY = 1000;
const DEFAULT_CARD_VALIDITY_DAYS = Math.min(
  730,
  Math.max(1, Number(process.env.SCRATCH_CARD_VALIDITY_DAYS) || 365)
);
const CURRENCY = 'NGN';
const CARD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function isPlatformAdmin(user = {}) {
  const roles = [
    user.role,
    user.userType,
    user.accountType,
    user.type
  ].filter(Boolean).map(value => String(value).toLowerCase().trim());

  return roles.some(role => [
    'systemadmin',
    'system_admin',
    'platformadmin',
    'platform_admin'
  ].includes(role));
}

function userSchoolIdentifiers(user = {}) {
  return [
    user.schoolId,
    user.schoolKey,
    user.schoolCode,
    typeof user.school === 'string' ? user.school : null,
    user.school?._id,
    user.school?.schoolId
  ].filter(Boolean).map(value => String(value).trim());
}

function requestedSchoolIdentifier(req) {
  return String(
    req.params?.schoolId ||
    req.body?.schoolId ||
    req.query?.schoolId ||
    req.headers['x-school-id'] ||
    req.headers['x-school-code'] ||
    ''
  ).trim();
}

async function resolveSchool(req, res) {
  const identifiers = userSchoolIdentifiers(req.user || {});
  const requested = requestedSchoolIdentifier(req);
  const platformAdmin = isPlatformAdmin(req.user || {});
  const schoolKey = requested || identifiers[0] || '';

  if (!schoolKey) {
    res.status(403).json({
      success: false,
      error: 'Your account is not associated with a school.'
    });
    return null;
  }

  const conditions = [
    { schoolId: schoolKey.toUpperCase() },
    { subdomain: schoolKey.toLowerCase() },
    { customDomain: schoolKey.toLowerCase() }
  ];

  if (mongoose.Types.ObjectId.isValid(schoolKey)) {
    conditions.unshift({ _id: new mongoose.Types.ObjectId(schoolKey) });
  }

  const school = await School.findOne({
    $or: conditions,
    status: 'active',
    isDeleted: { $ne: true }
  }).select('_id schoolId schoolName email adminEmail status');

  if (!school) {
    res.status(404).json({
      success: false,
      error: 'School not found or inactive.'
    });
    return null;
  }

  if (!platformAdmin) {
    const belongsToSchool = identifiers.some(identifier =>
      identifier === String(school._id) ||
      identifier.toUpperCase() === String(school.schoolId || '').toUpperCase()
    );

    if (!belongsToSchool) {
      res.status(403).json({
        success: false,
        error: 'You are not authorized to access this school.'
      });
      return null;
    }
  }

  return school;
}

function generateCardCode() {
  const bytes = crypto.randomBytes(8);
  let code = '';

  for (let i = 0; i < 8; i++) {
    code += CARD_ALPHABET[bytes[i] % CARD_ALPHABET.length];
  }

  return code;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function parseProviderResponse(response) {
  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Payment provider returned an invalid response.');
  }

  if (!response.ok) {
    throw new Error(
      payload.message ||
      payload.error ||
      `Payment provider request failed (${response.status}).`
    );
  }

  return payload;
}

function requireFetch() {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Node.js 18 or newer is required for payment gateway requests.');
  }
}

async function initializeGatewayPayment({ purchase, school, customerEmail, callbackUrl }) {
  requireFetch();

  if (purchase.provider === 'paystack') {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      const error = new Error('Paystack is not configured on the server.');
      error.statusCode = 503;
      throw error;
    }

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: customerEmail,
        amount: purchase.amountSubunits,
        currency: CURRENCY,
        reference: purchase.reference,
        callback_url: callbackUrl,
        metadata: {
          purchaseId: String(purchase._id),
          schoolId: String(school._id),
          schoolPublicId: school.schoolId,
          quantity: purchase.quantity,
          purpose: 'scratch_card_pool'
        }
      })
    });

    const result = await parseProviderResponse(response);
    if (!result.status || !result.data?.authorization_url) {
      throw new Error(result.message || 'Paystack did not return a checkout URL.');
    }

    return {
      checkoutUrl: result.data.authorization_url,
      providerTransactionId: String(result.data.access_code || ''),
      providerResponse: result.data
    };
  }

  const secret = process.env.FLW_SECRET_KEY;
  if (!secret) {
    const error = new Error('Flutterwave is not configured on the server.');
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tx_ref: purchase.reference,
      amount: purchase.amountNaira,
      currency: CURRENCY,
      redirect_url: callbackUrl,
      customer: {
        email: customerEmail,
        name: school.schoolName
      },
      meta: {
        purchaseId: String(purchase._id),
        schoolId: String(school._id),
        schoolPublicId: school.schoolId,
        quantity: purchase.quantity,
        purpose: 'scratch_card_pool'
      },
      customizations: {
        title: `${school.schoolName} scratch cards`,
        description: `${purchase.quantity} scratch cards`
      }
    })
  });

  const result = await parseProviderResponse(response);
  if (result.status !== 'success' || !result.data?.link) {
    throw new Error(result.message || 'Flutterwave did not return a checkout URL.');
  }

  return {
    checkoutUrl: result.data.link,
    providerTransactionId: '',
    providerResponse: result.data
  };
}

async function verifyPaystack(purchase) {
  requireFetch();
  const secret = process.env.PAYSTACK_SECRET_KEY;

  if (!secret) {
    const error = new Error('Paystack is not configured on the server.');
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(purchase.reference)}`,
    { headers: { Authorization: `Bearer ${secret}` } }
  );
  const result = await parseProviderResponse(response);
  const transaction = result.data;

  const verified =
    result.status === true &&
    transaction?.status === 'success' &&
    transaction?.reference === purchase.reference &&
    transaction?.currency === CURRENCY &&
    Number(transaction?.amount) === purchase.amountSubunits;

  if (!verified) {
    return { verified: false, providerResponse: transaction || result };
  }

  return {
    verified: true,
    transactionId: String(transaction.id || ''),
    providerResponse: transaction
  };
}

async function verifyFlutterwave(purchase) {
  requireFetch();
  const secret = process.env.FLW_SECRET_KEY;

  if (!secret) {
    const error = new Error('Flutterwave is not configured on the server.');
    error.statusCode = 503;
    throw error;
  }

  const url = new URL('https://api.flutterwave.com/v3/transactions');
  url.searchParams.set('tx_ref', purchase.reference);

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${secret}` }
  });
  const result = await parseProviderResponse(response);
  const transactions = Array.isArray(result.data) ? result.data : [result.data];
  const transaction = transactions.find(item =>
    item?.tx_ref === purchase.reference &&
    String(item?.status || '').toLowerCase() === 'successful' &&
    String(item?.currency || '').toUpperCase() === CURRENCY &&
    Number(item?.amount) === purchase.amountNaira
  );

  if (!transaction) {
    return { verified: false, providerResponse: result.data || result };
  }

  return {
    verified: true,
    transactionId: String(transaction.id || ''),
    providerResponse: transaction
  };
}

async function verifyGatewayPayment(purchase) {
  if (purchase.provider === 'paystack') return verifyPaystack(purchase);
  if (purchase.provider === 'flutterwave') return verifyFlutterwave(purchase);
  throw new Error('Unsupported payment provider.');
}

async function createCardCodes(quantity) {
  const codes = new Set();

  while (codes.size < quantity) {
    codes.add(generateCardCode());
  }

  return [...codes];
}

async function fulfillPaidPurchase(purchaseId) {
  let purchase = await ScratchCardPurchase.findById(purchaseId);
  if (!purchase) throw new Error('Scratch card purchase not found.');

  if (purchase.fulfillmentStatus === 'complete') {
    return { complete: true, purchase };
  }

  const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
  const claim = await ScratchCardPurchase.findOneAndUpdate(
    {
      _id: purchase._id,
      paymentStatus: 'paid',
      $or: [
        { fulfillmentStatus: 'pending' },
        { fulfillmentStatus: 'processing', fulfillmentStartedAt: { $lt: staleBefore } }
      ]
    },
    {
      $set: {
        fulfillmentStatus: 'processing',
        fulfillmentStartedAt: new Date()
      }
    },
    { new: true }
  );

  if (!claim) {
    purchase = await ScratchCardPurchase.findById(purchaseId);
    return {
      complete: purchase?.fulfillmentStatus === 'complete',
      processing: purchase?.fulfillmentStatus === 'processing',
      purchase
    };
  }

  purchase = claim;

  if (!Array.isArray(purchase.generatedCodes) || purchase.generatedCodes.length !== purchase.quantity) {
    purchase.generatedCodes = await createCardCodes(purchase.quantity);
    await purchase.save();
  }

  const validityDays = Math.min(
    730,
    Math.max(1, Number(process.env.SCRATCH_CARD_VALIDITY_DAYS) || 365)
  );
  const now = new Date();
  const expiresAt = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

  const operations = purchase.generatedCodes.map((code, index) => ({
    updateOne: {
      filter: {
        purchaseId: purchase._id,
        purchaseSequence: index + 1
      },
      update: {
        $setOnInsert: {
          schoolId: purchase.schoolId,
          code,
          purchaseId: purchase._id,
          purchaseSequence: index + 1,
          status: 'available',
          assignedStudent: null,
          assignedAt: null,
          expiresAt,
          usedCount: 0,
          metadata: {
            provider: purchase.providerResponse?.paymentMethod || purchase.provider,
            purchaseReference: purchase.reference
          }
        }
      },
      upsert: true
    }
  }));

  if (operations.length) {
    await ScratchCard.bulkWrite(operations, { ordered: false });
  }

  const createdCount = await ScratchCard.countDocuments({ purchaseId: purchase._id });
  if (createdCount !== purchase.quantity) {
    throw new Error('Card pool fulfillment is incomplete; retry verification.');
  }

  purchase.fulfillmentStatus = 'complete';
  purchase.fulfillmentStartedAt = null;
  await purchase.save();

  return { complete: true, purchase };
}

async function markPurchasePaid(purchase, verified) {
  if (!verified.verified) return false;

  if (purchase.paymentStatus !== 'paid') {
    purchase.paymentStatus = 'paid';
    purchase.paidAt = new Date();
    purchase.providerTransactionId = verified.transactionId || purchase.providerTransactionId;
    purchase.providerResponse = verified.providerResponse || purchase.providerResponse;
    await purchase.save();
  }

  return true;
}

async function requireSchoolAdmin(req, res) {
  const school = await resolveSchool(req, res);
  return school;
}

async function resolveSchool(req, res) {
  const user = req.user || {};
  const userIdentifiers = [
    user.schoolId,
    user.schoolKey,
    user.schoolCode,
    typeof user.school === 'string' ? user.school : null,
    user.school?._id,
    user.school?.schoolId
  ].filter(Boolean).map(value => String(value).trim());

  const requested = String(
    req.body?.schoolId ||
    req.query?.schoolId ||
    req.headers['x-school-id'] ||
    req.headers['x-school-code'] ||
    ''
  ).trim();

  const platformRoles = [user.role, user.userType, user.accountType, user.type]
    .filter(Boolean)
    .map(value => String(value).toLowerCase().trim());

  const platformAdmin = platformRoles.some(role =>
    ['systemadmin', 'system_admin', 'platformadmin', 'platform_admin'].includes(role)
  );

  const schoolKey = requested || userIdentifiers[0] || '';

  if (!schoolKey) {
    res.status(403).json({
      success: false,
      error: 'Your account is not associated with a school.'
    });
    return null;
  }

  const conditions = [
    { schoolId: schoolKey.toUpperCase() },
    { subdomain: schoolKey.toLowerCase() },
    { customDomain: schoolKey.toLowerCase() }
  ];

  if (mongoose.Types.ObjectId.isValid(schoolKey)) {
    conditions.unshift({ _id: new mongoose.Types.ObjectId(schoolKey) });
  }

  const school = await School.findOne({
    $or: conditions,
    status: 'active',
    isDeleted: { $ne: true }
  }).select('_id schoolId schoolName email adminEmail status');

  if (!school) {
    res.status(404).json({
      success: false,
      error: 'School not found or inactive.'
    });
    return null;
  }

  if (!platformAdmin) {
    const belongs = userIdentifiers.some(identifier =>
      identifier === String(school._id) ||
      identifier.toUpperCase() === String(school.schoolId || '').toUpperCase()
    );

    if (!belongs) {
      res.status(403).json({
        success: false,
        error: 'You are not authorized to access this school.'
      });
      return null;
    }
  }

  return school;
}

function purchaseResponse(purchase) {
  return {
    id: purchase._id,
    reference: purchase.reference,
    provider: purchase.providerResponse?.paymentMethod || purchase.provider,
    quantity: purchase.quantity,
    unitPriceNaira: purchase.unitPriceNaira,
    amountNaira: purchase.amountNaira,
    currency: purchase.currency,
    paymentStatus: purchase.paymentStatus,
    fulfillmentStatus: purchase.fulfillmentStatus,
    checkoutUrl: purchase.checkoutUrl,
    paidAt: purchase.paidAt
  };
}

// PUBLIC Paystack webhook. Keep this before router.use(authMiddleware, adminAuth).
// This single endpoint handles both scratch-card purchases and school-wallet DVAs.
router.post('/webhooks/paystack', async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return res.status(503).json({ error: 'Paystack is not configured.' });

    const signature = req.headers['x-paystack-signature'];
    const rawBody = req.rawBody;
    if (!signature || !rawBody) {
      return res.status(400).json({ error: 'Missing Paystack webhook signature or raw body.' });
    }

    const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
    if (!safeEqual(signature, expected)) {
      return res.status(401).json({ error: 'Invalid webhook signature.' });
    }

    const event = req.body || {};
    if (event.event !== 'charge.success') return res.json({ received: true });

    const transaction = event.data || {};
    const reference = String(transaction.reference || '').trim();
    if (!reference) return res.json({ received: true });

    // First handle existing scratch-card purchases without changing their flow.
    const purchase = await ScratchCardPurchase.findOne({ reference });
    if (purchase && purchase.provider === 'paystack') {
      const isValid =
        String(transaction.status || '').toLowerCase() === 'success' &&
        String(transaction.currency || '').toUpperCase() === CURRENCY &&
        Number.isSafeInteger(Number(transaction.amount)) &&
        Number(transaction.amount) === purchase.amountSubunits;

      if (!isValid) return res.json({ received: true });

      await markPurchasePaid(purchase, {
        verified: true,
        transactionId: String(transaction.id || ''),
        providerResponse: transaction
      });
      await fulfillPaidPurchase(purchase._id);
      return res.json({ received: true, handled: 'scratch_card' });
    }

    // Dedicated Virtual Account transfers arrive through the dedicated_nuban
    // channel. Verify the reference server-to-server before crediting any wallet.
    const eventAuthorization = transaction.authorization || {};
    if (String(eventAuthorization.channel || '').toLowerCase() !== 'dedicated_nuban') {
      return res.json({ received: true });
    }

    const verificationResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secret}`,
          Accept: 'application/json'
        }
      }
    );
    const verificationPayload = await verificationResponse.json().catch(() => ({}));
    if (!verificationResponse.ok || verificationPayload.status !== true || !verificationPayload.data) {
      console.error('[SchoolWallet][DVA Webhook] Paystack verification failed', {
        reference,
        httpStatus: verificationResponse.status,
        message: verificationPayload.message
      });
      return res.status(502).json({ error: 'Unable to verify the dedicated-account transfer yet.' });
    }

    const verified = verificationPayload.data;
    const verifiedReference = String(verified.reference || '').trim();
    const amountKobo = Number(verified.amount);
    const currency = String(verified.currency || '').toUpperCase();
    const authorization = verified.authorization || {};
    const verifiedChannel = String(authorization.channel || '').toLowerCase();
    const receiverAccountNumber = String(
      authorization.receiver_bank_account_number ||
      authorization.receiver_account_number ||
      authorization.account_number ||
      verified.receiver_bank_account_number ||
      transaction.authorization?.receiver_bank_account_number ||
      transaction.receiver_bank_account_number ||
      ''
    ).replace(/\D/g, '');
    const customerCode = String(
      verified.customer?.customer_code ||
      transaction.customer?.customer_code ||
      ''
    ).trim();
    const metadataSchoolId = String(
      verified.customer?.metadata?.examguardSchoolId ||
      transaction.customer?.metadata?.examguardSchoolId ||
      verified.metadata?.examguardSchoolId ||
      transaction.metadata?.examguardSchoolId ||
      ''
    ).trim();

    if (
      String(verified.status || '').toLowerCase() !== 'success' ||
      verifiedReference !== reference ||
      !Number.isSafeInteger(amountKobo) || amountKobo <= 0 ||
      currency !== CURRENCY ||
      (verifiedChannel && verifiedChannel !== 'dedicated_nuban')
    ) {
      console.warn('[SchoolWallet][DVA Webhook] Transfer did not pass validation', {
        reference,
        status: verified.status,
        verifiedReference,
        amountKobo,
        currency,
        verifiedChannel
      });
      return res.json({ received: true });
    }

    let wallet = null;
    if (receiverAccountNumber) {
      wallet = await SchoolWallet.collection.findOne({
        'dedicatedAccount.accountNumber': receiverAccountNumber,
        'dedicatedAccount.active': true
      });
    }

    // Customer-code fallback is allowed only when Paystack omitted the
    // receiving account number. If both are supplied, the exact account wins.
    if (!wallet && !receiverAccountNumber && customerCode) {
      wallet = await SchoolWallet.collection.findOne({
        paystackCustomerCode: customerCode,
        'dedicatedAccount.active': true
      });
    }

    // Last-resort tenant metadata lookup helps diagnose/recover legacy records,
    // but it must never credit a wallet if a supplied account number conflicts.
    if (!wallet && !receiverAccountNumber && metadataSchoolId) {
      wallet = await SchoolWallet.collection.findOne({
        schoolId: metadataSchoolId,
        paystackCustomerCode: customerCode,
        'dedicatedAccount.active': true
      });
    }

    if (!wallet) {
      console.error('[SchoolWallet][DVA Webhook] No school wallet matched the verified transfer; requesting Paystack retry', {
        reference,
        receiverAccountLast4: receiverAccountNumber ? receiverAccountNumber.slice(-4) : null,
        customerCode: customerCode || null,
        metadataSchoolId: metadataSchoolId || null,
        accountNumberPresent: Boolean(receiverAccountNumber)
      });
      // Do not acknowledge a successful transfer that ExamGuard has not
      // credited. Paystack can retry after the account mapping is repaired.
      return res.status(503).json({ error: 'School wallet mapping is not ready. Please retry this webhook.' });
    }

    const storedAccountNumber = String(wallet.dedicatedAccount?.accountNumber || '').replace(/\D/g, '');
    if (receiverAccountNumber && storedAccountNumber !== receiverAccountNumber) {
      console.error('[SchoolWallet][DVA Webhook] Receiving account mismatch; refusing credit', {
        reference,
        schoolId: wallet.schoolId,
        receiverAccountLast4: receiverAccountNumber.slice(-4),
        storedAccountLast4: storedAccountNumber.slice(-4)
      });
      return res.status(503).json({ error: 'Receiving account does not match the assigned school wallet.' });
    }
    if (!receiverAccountNumber && customerCode && String(wallet.paystackCustomerCode) !== customerCode) {
      return res.status(503).json({ error: 'Paystack customer does not match the assigned school wallet.' });
    }

    const amountNaira = Number((amountKobo / 100).toFixed(2));
    const payerName = String(
      authorization.sender_name ||
      transaction.customer?.first_name && `${transaction.customer.first_name} ${transaction.customer.last_name || ''}`.trim() ||
      'Bank transfer'
    ).trim();
    const payerEmail = String(verified.customer?.email || transaction.customer?.email || '').trim().toLowerCase();

    // Atomic duplicate guard: repeated Paystack webhook deliveries cannot credit
    // the same reference twice, even if they arrive concurrently.
    // Use the native collection for the DVA mapping and credit ledger as well.
    // This keeps webhook matching/crediting independent of any stale Mongoose
    // model schema while preserving the atomic duplicate-reference guard.
    const creditResult = await SchoolWallet.collection.updateOne(
      {
        _id: wallet._id,
        'transactions.reference': { $ne: reference }
      },
      {
        $inc: { balance: amountNaira, totalCredited: amountNaira },
        $push: {
          transactions: {
            type: 'credit',
            source: 'paystack_dva',
            amount: amountNaira,
            status: 'completed',
            reference,
            payerName,
            payerEmail,
            description: 'Paystack dedicated bank-account wallet funding',
            createdAt: new Date(verified.paid_at || Date.now()),
            verifiedAt: new Date(),
            metadata: {
              paystackTransactionId: String(verified.id || ''),
              channel: verifiedChannel || 'dedicated_nuban',
              senderBank: String(authorization.sender_bank || ''),
              receivingBank: String(authorization.receiver_bank || wallet.dedicatedAccount?.bankName || ''),
              receivingAccountLast4: receiverAccountNumber ? receiverAccountNumber.slice(-4) : String(wallet.dedicatedAccount?.accountNumber || '').slice(-4),
              paystackCustomerCode: customerCode || wallet.paystackCustomerCode || ''
            }
          }
        }
      }
    );

    if (creditResult.modifiedCount !== 1) {
      const alreadyProcessed = await SchoolWallet.collection.findOne({
        _id: wallet._id,
        'transactions.reference': reference
      }, { projection: { _id: 1 } });
      if (!alreadyProcessed) {
        console.error('[SchoolWallet][DVA Webhook] Wallet credit update did not modify a document', { reference, schoolId: wallet.schoolId });
        return res.status(500).json({ error: 'Wallet credit could not be recorded.' });
      }
      return res.json({ received: true, duplicate: true });
    }

    console.info('[SchoolWallet][DVA Webhook] Wallet credited', {
      schoolId: wallet.schoolId,
      reference,
      amount: amountNaira,
      balanceUpdated: true
    });
    return res.json({ received: true, handled: 'school_wallet_dva' });
  } catch (error) {
    console.error('Paystack webhook processing error:', error);
    return res.status(500).json({ error: 'Unable to process Paystack webhook.' });
  }
});

router.use(authMiddleware, adminAuth);

// GET /api/scratch-cards/pool
router.get('/pool', async (req, res) => {
  try {
    const school = await requireSchoolAdmin(req, res);
    if (!school) return;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const status = String(req.query.status || '').trim().toLowerCase();
    const filter = { schoolId: school._id };

    if (['available', 'assigned', 'used', 'expired', 'replaced', 'revoked'].includes(status)) {
      filter.status = status;
    }

    const [cards, total, summary] = await Promise.all([
      ScratchCard.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('assignedStudent', 'student_id regNo firstname surname othernames class'),
      ScratchCard.countDocuments(filter),
      ScratchCard.aggregate([
        { $match: { schoolId: school._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);

    return res.json({
      success: true,
      data: cards.map(card => ({
        id: card._id,
        code: card.code,
        status: card.status,
        assignedStudent: card.assignedStudent ? {
          id: card.assignedStudent._id,
          studentId: card.assignedStudent.student_id,
          regNo: card.assignedStudent.regNo,
          name: `${card.assignedStudent.firstname || ''} ${card.assignedStudent.surname || ''}`.trim(),
          class: card.assignedStudent.class || ''
        } : null,
        assignedAt: card.assignedAt,
        expiresAt: card.expiresAt,
        usedCount: card.usedCount,
        purchaseId: card.purchaseId,
        createdAt: card.createdAt
      })),
      summary: Object.fromEntries(summary.map(row => [row._id, row.count])),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Scratch-card pool list error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to load scratch-card pool.'
    });
  }
});

// GET /api/scratch-cards/wallet-balance
// Reads the school wallet directly from MongoDB to stay consistent with DVA credits.
router.get('/wallet-balance', async (req, res) => {
  try {
    const school = await requireSchoolAdmin(req, res);
    if (!school) return;

    const wallet = await SchoolWallet.collection.findOne(
      { schoolId: String(school._id) },
      { projection: { balance: 1, currency: 1, dedicatedAccount: 1 } }
    );

    return res.json({
      success: true,
      balance: Math.max(0, Number(wallet?.balance) || 0),
      currency: wallet?.currency || CURRENCY
    });
  } catch (error) {
    console.error('Scratch-card wallet balance error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to load school wallet balance.'
    });
  }
});

// GET /api/scratch-cards/purchases
router.get('/purchases', async (req, res) => {
  try {
    const school = await requireSchoolAdmin(req, res);
    if (!school) return;

    const purchases = await ScratchCardPurchase.find({ schoolId: school._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('-generatedCodes')
      .lean();

    return res.json({
      success: true,
      data: purchases.map(purchase => {
        const { providerResponse, ...safePurchase } = purchase;
        return {
          ...safePurchase,
          provider: providerResponse?.paymentMethod || purchase.provider
        };
      })
    });
  } catch (error) {
    console.error('Scratch-card purchase history error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to load purchase history.'
    });
  }
});

// POST /api/scratch-cards/purchases/initiate
router.post('/purchases/initiate', async (req, res) => {
  try {
    const school = await requireSchoolAdmin(req, res);
    if (!school) return;

    const provider = String(req.body.provider || '').trim().toLowerCase();
    const quantity = Number(req.body.quantity);

    if (!['paystack', 'flutterwave', 'school_wallet'].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: 'Choose Paystack, Flutterwave or School Wallet.'
      });
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PURCHASE_QUANTITY) {
      return res.status(400).json({
        success: false,
        error: `Quantity must be a whole number between 1 and ${MAX_PURCHASE_QUANTITY}.`
      });
    }

    const email = String(req.user.email || school.adminEmail || school.email || '').trim().toLowerCase();
    const callbackUrl = String(
      process.env.SCRATCH_CARD_CALLBACK_URL ||
      req.body.callbackUrl ||
      ''
    ).trim();

    if (provider !== 'school_wallet' && !email) {
      return res.status(400).json({
        success: false,
        error: 'An account email is required to initialize gateway payment.'
      });
    }

    if (provider !== 'school_wallet' && !callbackUrl) {
      return res.status(503).json({
        success: false,
        error: 'Set SCRATCH_CARD_CALLBACK_URL on the server before enabling gateway purchases.'
      });
    }

    const amountNaira = quantity * CARD_PRICE_NAIRA;
    const reference = `SC-${Date.now()}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

    // The existing purchase schema may constrain provider to gateway names.
    // Keep its schema-compatible value and record the actual wallet tender in
    // providerResponse.paymentMethod for history, audit and fulfillment.
    const purchase = await ScratchCardPurchase.create({
      schoolId: school._id,
      createdBy: req.user.id || req.user._id || null,
      provider: provider === 'school_wallet' ? 'paystack' : provider,
      reference,
      quantity,
      unitPriceNaira: CARD_PRICE_NAIRA,
      amountNaira,
      amountSubunits: amountNaira * 100,
      currency: CURRENCY,
      paymentStatus: 'pending',
      fulfillmentStatus: 'pending'
    });

    if (provider === 'school_wallet') {
      try {
        const walletCollection = SchoolWallet.collection;
        const walletFilter = {
          schoolId: String(school._id),
          balance: { $gte: amountNaira },
          'transactions.reference': { $ne: reference }
        };
        const debit = await walletCollection.updateOne(
          walletFilter,
          {
            $inc: {
              balance: -amountNaira,
              totalDebited: amountNaira
            },
            $push: {
              transactions: {
                type: 'debit',
                source: 'adjustment',
                amount: amountNaira,
                status: 'completed',
                reference,
                description: `Scratch-card pool purchase (${quantity} cards)`,
                createdAt: new Date(),
                verifiedAt: new Date(),
                metadata: {
                  purpose: 'scratch_card_pool',
                  purchaseId: String(purchase._id),
                  quantity,
                  unitPriceNaira: CARD_PRICE_NAIRA
                }
              }
            }
          }
        );

        if (debit.modifiedCount !== 1) {
          const wallet = await walletCollection.findOne(
            { schoolId: String(school._id) },
            { projection: { balance: 1 } }
          );
          await ScratchCardPurchase.updateOne(
            { _id: purchase._id, paymentStatus: 'pending' },
            {
              $set: {
                paymentStatus: 'failed',
                providerResponse: {
                  paymentMethod: 'school_wallet',
                  error: 'Insufficient school wallet balance.'
                }
              }
            }
          );
          return res.status(402).json({
            success: false,
            error: 'Insufficient school wallet balance.',
            required: amountNaira,
            balance: Math.max(0, Number(wallet?.balance) || 0)
          });
        }

        purchase.paymentStatus = 'paid';
        purchase.paidAt = new Date();
        purchase.providerResponse = {
          paymentMethod: 'school_wallet',
          walletDebited: true,
          amountNaira
        };
        await purchase.save();

        try {
          const fulfillment = await fulfillPaidPurchase(purchase._id);
          const completedPurchase = await ScratchCardPurchase.findById(purchase._id);
          if (!fulfillment.complete) {
            return res.status(202).json({
              success: true,
              paymentStatus: 'paid',
              fulfillmentStatus: completedPurchase?.fulfillmentStatus || 'processing',
              message: 'Wallet payment was successful. Scratch-card pool fulfillment is processing; do not pay again.',
              data: purchaseResponse(completedPurchase || purchase)
            });
          }

          return res.status(201).json({
            success: true,
            message: 'Scratch cards purchased successfully using the school wallet.',
            data: purchaseResponse(completedPurchase)
          });
        } catch (fulfillmentError) {
          console.error('[ScratchCards][WalletFulfillmentPending]', {
            reference,
            purchaseId: String(purchase._id),
            message: fulfillmentError.message
          });
          const currentPurchase = await ScratchCardPurchase.findById(purchase._id);
          return res.status(202).json({
            success: true,
            paymentStatus: 'paid',
            fulfillmentStatus: currentPurchase?.fulfillmentStatus || 'processing',
            message: 'Wallet payment was successful. Card generation is pending; do not pay again.',
            data: purchaseResponse(currentPurchase || purchase)
          });
        }
      } catch (walletError) {
        console.error('Scratch-card wallet payment error:', walletError);
        // If the debit already happened, never mark the purchase unpaid or invite
        // the user to retry payment. Keep it paid and let fulfillment be retried.
        const current = await ScratchCardPurchase.findById(purchase._id).catch(() => null);
        if (current?.paymentStatus === 'paid') {
          return res.status(202).json({
            success: true,
            paymentStatus: 'paid',
            fulfillmentStatus: current.fulfillmentStatus,
            message: 'Wallet debit was recorded. Card generation is pending; do not pay again.',
            data: purchaseResponse(current)
          });
        }
        return res.status(500).json({
          success: false,
          error: 'Unable to complete school wallet payment. Please check wallet transactions before retrying.'
        });
      }
    }

    try {
      const initialized = await initializeGatewayPayment({
        purchase,
        school,
        customerEmail: email,
        callbackUrl
      });

      purchase.checkoutUrl = initialized.checkoutUrl;
      purchase.providerTransactionId = initialized.providerTransactionId;
      purchase.providerResponse = initialized.providerResponse;
      await purchase.save();

      return res.status(201).json({
        success: true,
        data: purchaseResponse(purchase)
      });
    } catch (gatewayError) {
      purchase.paymentStatus = 'failed';
      purchase.providerResponse = { error: gatewayError.message };
      await purchase.save();

      const status = gatewayError.statusCode || 502;
      return res.status(status).json({
        success: false,
        error: gatewayError.message || 'Could not initialize payment.'
      });
    }
  } catch (error) {
    console.error('Scratch-card purchase initialization error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to initialize scratch-card purchase.'
    });
  }
});

// GET /api/scratch-cards/purchases/:reference/verify
router.get('/purchases/:reference/verify', async (req, res) => {
  try {
    const school = await requireSchoolAdmin(req, res);
    if (!school) return;

    const purchase = await ScratchCardPurchase.findOne({
      reference: req.params.reference,
      schoolId: school._id
    });

    if (!purchase) {
      return res.status(404).json({
        success: false,
        error: 'Purchase not found for this school.'
      });
    }

    const paymentMethod = purchase.providerResponse?.paymentMethod || purchase.provider;
    if (purchase.paymentStatus !== 'paid' && paymentMethod !== 'school_wallet') {
      const verification = await verifyGatewayPayment(purchase);

      if (!verification.verified) {
        return res.status(402).json({
          success: false,
          paymentStatus: purchase.paymentStatus,
          fulfillmentStatus: purchase.fulfillmentStatus,
          error: 'Payment has not been verified as successful.'
        });
      }

      await markPurchasePaid(purchase, verification);
    } else if (purchase.paymentStatus !== 'paid') {
      return res.status(402).json({
        success: false,
        paymentStatus: purchase.paymentStatus,
        error: 'School wallet payment has not been recorded as completed.'
      });
    }

    const fulfillment = await fulfillPaidPurchase(purchase._id);
    const updatedPurchase = await ScratchCardPurchase.findById(purchase._id);

    if (!fulfillment.complete) {
      return res.status(202).json({
        success: false,
        paymentStatus: updatedPurchase.paymentStatus,
        fulfillmentStatus: updatedPurchase.fulfillmentStatus,
        error: 'Payment is verified; card-pool fulfillment is still processing. Retry shortly.'
      });
    }

    return res.json({
      success: true,
      data: purchaseResponse(updatedPurchase)
    });
  } catch (error) {
    console.error('Scratch-card purchase verification error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Unable to verify purchase.'
    });
  }
});

// POST /api/scratch-cards/assign
router.post('/assign', async (req, res) => {
  try {
    const school = await requireSchoolAdmin(req, res);
    if (!school) return;

    const cardCode = String(req.body.cardCode || '').trim().toUpperCase();
    const studentIdentifier = String(req.body.studentId || '').trim();
    const replaceExisting = req.body.replaceExisting === true;
    const expiryDays = Math.min(
      730,
      Math.max(1, Number(req.body.expiryDays) || DEFAULT_CARD_VALIDITY_DAYS)
    );

    if (!cardCode || !studentIdentifier) {
      return res.status(400).json({
        success: false,
        error: 'cardCode and studentId are required.'
      });
    }

    const studentMatch = [
      { student_id: studentIdentifier },
      { regNo: studentIdentifier }
    ];

    if (mongoose.Types.ObjectId.isValid(studentIdentifier)) {
      studentMatch.unshift({ _id: new mongoose.Types.ObjectId(studentIdentifier) });
    }

    const student = await Student.findOne({
      schoolId: school._id,
      $or: studentMatch
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found in this school.'
      });
    }

    const card = await ScratchCard.findOneAndUpdate(
      {
        schoolId: school._id,
        code: cardCode,
        status: 'available'
      },
      {
        $set: {
          status: 'assigned',
          assignedStudent: student._id,
          assignedAt: new Date(),
          expiresAt: new Date(Date.now() + expiryDays * 86400000),
          usedCount: 0
        }
      },
      { new: true }
    );

    if (!card) {
      return res.status(409).json({
        success: false,
        error: 'That card is not available in this school’s purchased pool.'
      });
    }

    const previousCardCode = String(student.scratchCard || '').trim().toUpperCase();
    if (previousCardCode && previousCardCode !== cardCode && !replaceExisting) {
      await ScratchCard.updateOne(
        { _id: card._id, schoolId: school._id, status: 'assigned' },
        { $set: { status: 'available', assignedStudent: null, assignedAt: null, expiresAt: null } }
      );

      return res.status(409).json({
        success: false,
        error: 'Student already has a card. Set replaceExisting to true to replace it.'
      });
    }

    if (previousCardCode && previousCardCode !== cardCode) {
      await ScratchCard.updateOne(
        {
          schoolId: school._id,
          code: previousCardCode,
          assignedStudent: student._id,
          status: { $in: ['assigned', 'used', 'expired'] }
        },
        {
          $set: {
            status: 'replaced',
            assignedStudent: null,
            expiresAt: null
          }
        }
      );

      if (!Array.isArray(student.scratchCardHistory)) {
        student.scratchCardHistory = [];
      }

      student.scratchCardHistory.forEach(entry => {
        if (entry.status === 'active') {
          entry.status = 'replaced';
          entry.exhaustedAt = entry.exhaustedAt || new Date();
        }
      });
    }

    if (!Array.isArray(student.scratchCardHistory)) {
      student.scratchCardHistory = [];
    }

    student.scratchCard = card.code;
    student.scratchCardUsage = 0;
    student.scratchCardAssignedAt = card.assignedAt;
    student.scratchCardExpiry = card.expiresAt;
    student.scratchCardHistory.push({
      cardCode: card.code,
      usedCount: 0,
      assignedAt: card.assignedAt,
      exhaustedAt: null,
      status: 'active'
    });

    try {
      await student.save();
    } catch (saveError) {
      await ScratchCard.updateOne(
        { _id: card._id, schoolId: school._id, assignedStudent: student._id },
        { $set: { status: 'available', assignedStudent: null, assignedAt: null, expiresAt: null } }
      );
      throw saveError;
    }

    return res.json({
      success: true,
      message: 'Scratch card assigned and saved.',
      data: {
        card: {
          id: card._id,
          code: card.code,
          status: card.status,
          expiresAt: card.expiresAt
        },
        student: {
          id: student._id,
          studentId: student.student_id,
          regNo: student.regNo,
          scratchCard: student.scratchCard,
          scratchCardUsage: student.scratchCardUsage,
          scratchCardExpiry: student.scratchCardExpiry
        }
      }
    });
  } catch (error) {
    console.error('Scratch-card assignment error:', error);
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'A duplicate scratch-card code already exists.'
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Unable to assign scratch card.'
    });
  }
});

// POST /api/scratch-cards/pool/:id/expire
router.post('/pool/:id/expire', async (req, res) => {
  try {
    const school = await requireSchoolAdmin(req, res);
    if (!school) return;

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid card ID.' });
    }

    const card = await ScratchCard.findOne({
      _id: req.params.id,
      schoolId: school._id,
      status: { $in: ['available', 'assigned'] }
    });

    if (!card) {
      return res.status(404).json({
        success: false,
        error: 'Active card not found for this school.'
      });
    }

    card.status = 'expired';
    card.expiredAt = new Date();
    await card.save();

    if (card.assignedStudent) {
      const student = await Student.findOne({
        _id: card.assignedStudent,
        schoolId: school._id,
        scratchCard: card.code
      });

      if (student) {
        student.scratchCardExpiry = new Date();
        student.updatedAt = new Date();
        await student.save();
      }
    }

    return res.json({ success: true, message: 'Card marked expired.' });
  } catch (error) {
    console.error('Scratch-card expiration error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to expire scratch card.'
    });
  }
});

// POST /api/scratch-cards/pool/:id/revoke
router.post('/pool/:id/revoke', async (req, res) => {
  try {
    const school = await requireSchoolAdmin(req, res);
    if (!school) return;

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid card ID.' });
    }

    const card = await ScratchCard.findOne({
      _id: req.params.id,
      schoolId: school._id,
      status: { $in: ['available', 'assigned'] }
    });

    if (!card) {
      return res.status(404).json({
        success: false,
        error: 'Active card not found for this school.'
      });
    }

    card.status = 'revoked';
    card.revokedAt = new Date();
    const assignedStudent = card.assignedStudent;
    card.assignedStudent = null;
    await card.save();

    if (assignedStudent) {
      const student = await Student.findOne({
        _id: assignedStudent,
        schoolId: school._id,
        scratchCard: card.code
      });

      if (student) {
        student.scratchCard = '';
        student.scratchCardUsage = 0;
        student.scratchCardExpiry = null;
        student.updatedAt = new Date();

        if (Array.isArray(student.scratchCardHistory)) {
          student.scratchCardHistory.forEach(entry => {
            if (entry.cardCode === card.code && entry.status === 'active') {
              entry.status = 'replaced';
              entry.exhaustedAt = new Date();
            }
          });
        }

        await student.save();
      }
    }

    return res.json({ success: true, message: 'Card revoked.' });
  } catch (error) {
    console.error('Scratch-card revoke error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to revoke scratch card.'
    });
  }
});

// POST /webhooks/flutterwave
router.post('/webhooks/flutterwave', async (req, res) => {
  try {
    const webhookHash = process.env.FLW_WEBHOOK_HASH;
    if (!webhookHash) {
      return res.status(503).json({ error: 'Flutterwave webhook is not configured.' });
    }

    const signature = String(
      req.headers['verif-hash'] ||
      req.headers['flutterwave-signature'] ||
      ''
    );

    if (!signature || !safeEqual(signature, webhookHash)) {
      return res.status(401).json({ error: 'Invalid webhook signature.' });
    }

    const payload = req.body || {};
    const transaction = payload.data || payload;
    const reference = transaction.tx_ref || transaction.reference || '';
    const purchase = await ScratchCardPurchase.findOne({ reference });

    if (!purchase || purchase.provider !== 'flutterwave') {
      return res.json({ received: true });
    }

    const isValid =
      String(transaction.status || '').toLowerCase() === 'successful' &&
      String(transaction.currency || '').toUpperCase() === CURRENCY &&
      Number(transaction.amount) === purchase.amountNaira;

    if (!isValid) return res.json({ received: true });

    await markPurchasePaid(purchase, {
      verified: true,
      transactionId: String(transaction.id || ''),
      providerResponse: transaction
    });

    await fulfillPaidPurchase(purchase._id);
    return res.json({ received: true });
  } catch (error) {
    console.error('Flutterwave scratch-card webhook error:', error);
    return res.status(500).json({ error: 'Unable to process payment webhook.' });
  }
});

module.exports = router;
