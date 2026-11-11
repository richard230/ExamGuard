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
  }).select('_id schoolId schoolName email adminEmail status subdomain customDomain');

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

// Structured diagnostics for Render logs. Never include API keys, authorization
// headers, card codes, customer email addresses, or full webhook payloads.
function paymentLog(event, details = {}) {
  const record = {
    event,
    timestamp: new Date().toISOString(),
    ...details
  };
  console.log(`[ScratchCards][${event}] ${JSON.stringify(record)}`);
}

function errorDetails(error) {
  return {
    message: error?.message || String(error),
    name: error?.name || 'Error',
    code: error?.code || null,
    statusCode: error?.statusCode || null,
    providerHttpStatus: error?.providerHttpStatus || null,
    providerCode: error?.providerCode || null,
    stack: error?.stack || null
  };
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
    const error = new Error(
      payload.message ||
      payload.error ||
      `Payment provider request failed (${response.status}).`
    );
    error.statusCode = 502;
    error.providerHttpStatus = response.status;
    error.providerCode = payload.code || payload.type || null;
    throw error;
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

  const expectedAmount = Number(
    purchase.amountSubunits != null
      ? purchase.amountSubunits
      : Number(purchase.amountNaira || 0) * 100
  );
  const expectedCurrency = String(purchase.currency || CURRENCY).trim().toUpperCase();
  const expectedReference = String(purchase.reference || '').trim();
  const verifyUrl = `https://api.paystack.co/transaction/verify/${encodeURIComponent(expectedReference)}`;

  paymentLog('PaystackVerificationStarted', {
    reference: expectedReference,
    purchaseId: String(purchase._id),
    schoolId: String(purchase.schoolId),
    expectedAmountSubunits: expectedAmount,
    expectedCurrency,
    purchasePaymentStatus: purchase.paymentStatus,
    provider: purchase.provider
  });

  let response;
  try {
    response = await fetch(verifyUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' }
    });
  } catch (error) {
    paymentLog('PaystackVerificationNetworkError', {
      reference: expectedReference,
      purchaseId: String(purchase._id),
      error: errorDetails(error)
    });
    throw error;
  }

  let result;
  try {
    result = await parseProviderResponse(response);
  } catch (error) {
    paymentLog('PaystackVerificationHttpError', {
      reference: expectedReference,
      purchaseId: String(purchase._id),
      providerHttpStatus: response.status,
      error: errorDetails(error)
    });
    throw error;
  }

  const transaction = result?.data || null;
  const actualReference = String(transaction?.reference || '').trim();
  const actualStatus = String(transaction?.status || '').trim().toLowerCase();
  const actualCurrency = String(transaction?.currency || '').trim().toUpperCase();
  const actualAmount = Number(transaction?.amount);
  const checks = {
    providerAccepted: result?.status === true,
    transactionPresent: Boolean(transaction),
    statusIsSuccess: actualStatus === 'success',
    referenceMatches: actualReference === expectedReference,
    currencyMatches: actualCurrency === expectedCurrency,
    amountMatches: Number.isFinite(actualAmount) && actualAmount === expectedAmount
  };
  const verified = Object.values(checks).every(Boolean);

  const diagnostics = {
    reference: expectedReference,
    purchaseId: String(purchase._id),
    schoolId: String(purchase.schoolId),
    providerHttpStatus: response.status,
    providerAccepted: result?.status === true,
    providerMessage: result?.message || null,
    transactionId: transaction?.id != null ? String(transaction.id) : null,
    returnedReference: actualReference || null,
    returnedStatus: actualStatus || null,
    returnedAmountSubunits: Number.isFinite(actualAmount) ? actualAmount : null,
    expectedAmountSubunits: expectedAmount,
    returnedCurrency: actualCurrency || null,
    expectedCurrency,
    checks,
    verified
  };

  paymentLog(verified ? 'PaystackVerificationSucceeded' : 'PaystackVerificationRejected', diagnostics);

  if (!verified) {
    return {
      verified: false,
      diagnostics,
      providerResponse: transaction || result
    };
  }

  return {
    verified: true,
    transactionId: String(transaction.id || ''),
    diagnostics,
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

  const validityDays = DEFAULT_CARD_VALIDITY_DAYS;
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
            provider: purchase.provider,
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


function purchaseResponse(purchase) {
  return {
    id: purchase._id,
    reference: purchase.reference,
    provider: purchase.provider,
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


function getSchoolPortalBaseUrl(school) {
  const customDomain = String(school?.customDomain || '').trim();
  const subdomain = String(school?.subdomain || '').trim();
  const baseDomain = String(process.env.GOLDLINCSCHOOLS_BASE_DOMAIN || 'goldlincschools.com.ng')
    .trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');

  // Custom domains are read from the trusted School record, never from callback query parameters.
  if (customDomain) {
    try {
      const candidate = /^https?:\/\//i.test(customDomain) ? customDomain : `https://${customDomain}`;
      const parsed = new URL(candidate);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.origin;
      }
    } catch (_) {
      // Fall through to the platform subdomain/default portal.
    }
  }

  if (subdomain && /^[a-z0-9-]+$/i.test(subdomain)) {
    return `https://${subdomain.toLowerCase()}.${baseDomain}`;
  }

  const fallback = String(process.env.GOLDLINCSCHOOLS_FRONTEND_URL || 'https://goldlincschools.com.ng').trim();
  try {
    return new URL(fallback).origin;
  } catch (_) {
    return 'https://goldlincschools.com.ng';
  }
}

function redirectAfterScratchCardPayment(res, school, status, reference, message) {
  const baseUrl = getSchoolPortalBaseUrl(school);
  let target;
  try {
    const configuredPath = String(process.env.SCRATCH_CARD_RETURN_PATH || '/').trim();
    target = new URL(configuredPath.startsWith('/') ? configuredPath : `/${configuredPath}`, baseUrl);
  } catch (_) {
    target = new URL('/', baseUrl);
  }

  target.searchParams.set('payment', status);
  target.searchParams.set('payment_type', 'scratch_card_pool');
  if (reference) target.searchParams.set('reference', reference);
  if (message) target.searchParams.set('payment_message', message);
  return res.redirect(303, target.toString());
}

// Paystack/Flutterwave return URL. Public by design: payment is verified server-to-server.
// GET /api/scratch-cards/payment/callback?reference=...
router.get('/payment/callback', async (req, res) => {
  const reference = String(
    req.query.reference || req.query.trxref || req.query.tx_ref || ''
  ).trim();

  if (!reference) {
    return redirectAfterScratchCardPayment(
      res,
      null,
      'failed',
      '',
      'The payment reference was not provided.'
    );
  }

  try {
    const purchase = await ScratchCardPurchase.findOne({ reference });
    if (!purchase) {
      return redirectAfterScratchCardPayment(
        res, null, 'failed', reference, 'We could not find this payment.'
      );
    }

    const school = await School.findById(purchase.schoolId)
      .select('_id schoolId schoolName subdomain customDomain status isDeleted');

    if (!school) {
      return redirectAfterScratchCardPayment(
        res, null, 'failed', reference, 'The school associated with this purchase could not be found.'
      );
    }

    if (purchase.paymentStatus !== 'paid') {
      const verification = await verifyGatewayPayment(purchase);
      if (!verification.verified) {
        paymentLog('CallbackVerificationRejected', {
          reference,
          purchaseId: String(purchase._id),
          schoolId: String(school._id),
          provider: purchase.provider,
          diagnostics: verification.diagnostics || null
        });
        return redirectAfterScratchCardPayment(
          res, school, 'processing', reference,
          'Your payment is being reconciled. Do not pay again; contact the school administrator if your account was debited.'
        );
      }
      await markPurchasePaid(purchase, verification);
      paymentLog('CallbackPaymentMarkedPaid', {
        reference,
        purchaseId: String(purchase._id),
        schoolId: String(school._id),
        provider: purchase.provider,
        transactionId: verification.transactionId || null
      });
      paymentLog('PurchaseMarkedPaid', {
        reference: purchase.reference,
        purchaseId: String(purchase._id),
        schoolId: String(school._id),
        provider: purchase.provider,
        transactionId: verification.transactionId || null
      });
    }

    const fulfillment = await fulfillPaidPurchase(purchase._id);
    const latestPurchase = await ScratchCardPurchase.findById(purchase._id);

    if (!fulfillment.complete) {
      return redirectAfterScratchCardPayment(
        res, school, 'processing', reference,
        'Payment was confirmed. Your scratch-card pool is still being prepared.'
      );
    }

    return redirectAfterScratchCardPayment(
      res, school, 'success', reference,
      `${latestPurchase.quantity} scratch cards are ready for use.`
    );
  } catch (error) {
    paymentLog('PaymentCallbackError', { reference, error: errorDetails(error) });
    try {
      const purchase = await ScratchCardPurchase.findOne({ reference });
      const school = purchase
        ? await School.findById(purchase.schoolId).select('_id schoolId schoolName subdomain customDomain')
        : null;
      return redirectAfterScratchCardPayment(
        res, school, 'processing', reference,
        'We are checking your payment. Please refresh the scratch-card purchase history shortly.'
      );
    } catch (redirectError) {
      console.error('Scratch-card callback redirect error:', redirectError);
      return res.status(500).send('Unable to process the payment return. Please contact support.');
    }
  }
});

// Paystack webhook. This route is intentionally public; authenticity is established by HMAC.
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

    const reference = String(event.data?.reference || '').trim();
    if (!reference) return res.json({ received: true });

    const purchase = await ScratchCardPurchase.findOne({ reference, provider: 'paystack' });
    if (!purchase) return res.json({ received: true });

    // Never fulfil from webhook payload alone. Verify the reference directly with Paystack.
    const verification = await verifyPaystack(purchase);
    if (!verification.verified) {
      paymentLog('PaystackWebhookVerificationRejected', {
        reference,
        purchaseId: String(purchase._id),
        diagnostics: verification.diagnostics || null
      });
      return res.json({ received: true, verified: false });
    }

    await markPurchasePaid(purchase, verification);
    paymentLog('PaystackWebhookPaymentMarkedPaid', {
      reference,
      purchaseId: String(purchase._id),
      transactionId: verification.transactionId || null
    });
    await fulfillPaidPurchase(purchase._id);
    return res.json({ received: true });
  } catch (error) {
    paymentLog('PaystackWebhookError', { error: errorDetails(error) });
    return res.status(500).json({ error: 'Unable to process payment webhook.' });
  }
});

// Flutterwave webhook. This route is also public; the configured webhook hash authenticates it.
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
    const reference = String(transaction.tx_ref || transaction.reference || '').trim();
    if (!reference) return res.json({ received: true });

    const purchase = await ScratchCardPurchase.findOne({ reference, provider: 'flutterwave' });
    if (!purchase) return res.json({ received: true });

    // Verify with Flutterwave's API before changing the purchase state.
    const verification = await verifyFlutterwave(purchase);
    if (!verification.verified) return res.json({ received: true });

    await markPurchasePaid(purchase, verification);
    await fulfillPaidPurchase(purchase._id);
    return res.json({ received: true });
  } catch (error) {
    console.error('Flutterwave scratch-card webhook error:', error);
    return res.status(500).json({ error: 'Unable to process payment webhook.' });
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

// GET /api/scratch-cards/purchases
router.get('/purchases', async (req, res) => {
  try {
    const school = await requireSchoolAdmin(req, res);
    if (!school) return;

    const purchases = await ScratchCardPurchase.find({ schoolId: school._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('-generatedCodes -providerResponse')
      .lean();

    return res.json({
      success: true,
      data: purchases
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

    if (!['paystack', 'flutterwave'].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: 'Choose Paystack or Flutterwave.'
      });
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PURCHASE_QUANTITY) {
      return res.status(400).json({
        success: false,
        error: `Quantity must be a whole number between 1 and ${MAX_PURCHASE_QUANTITY}.`
      });
    }

    const email = String(req.user.email || school.adminEmail || school.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'An account email is required to initialize payment.'
      });
    }

    const callbackUrl = String(process.env.SCRATCH_CARD_CALLBACK_URL || '').trim();

    if (!callbackUrl) {
      return res.status(503).json({
        success: false,
        error: 'Set SCRATCH_CARD_CALLBACK_URL on the server before enabling card purchases.'
      });
    }

    const amountNaira = quantity * CARD_PRICE_NAIRA;
    const reference = `SC-${Date.now()}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

    const purchase = await ScratchCardPurchase.create({
      schoolId: school._id,
      createdBy: req.user.id || req.user._id || null,
      provider,
      reference,
      quantity,
      unitPriceNaira: CARD_PRICE_NAIRA,
      amountNaira,
      amountSubunits: amountNaira * 100,
      currency: CURRENCY,
      paymentStatus: 'pending',
      fulfillmentStatus: 'pending'
    });

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
      // Log actionable gateway diagnostics, but never log API keys or authorization headers.
      console.error('[ScratchCards][GatewayInitializeFailed]', JSON.stringify({
        provider,
        reference,
        schoolId: String(school._id),
        quantity,
        amountNaira,
        providerHttpStatus: gatewayError.providerHttpStatus || null,
        providerCode: gatewayError.providerCode || null,
        error: gatewayError.message,
        at: new Date().toISOString()
      }));

      purchase.paymentStatus = 'failed';
      purchase.providerResponse = {
        error: gatewayError.message,
        providerHttpStatus: gatewayError.providerHttpStatus || null,
        providerCode: gatewayError.providerCode || null
      };
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

    if (purchase.paymentStatus !== 'paid') {
      const verification = await verifyGatewayPayment(purchase);

      if (!verification.verified) {
        paymentLog('PurchaseVerificationRejected', {
          reference: purchase.reference,
          purchaseId: String(purchase._id),
          schoolId: String(school._id),
          provider: purchase.provider,
          paymentStatus: purchase.paymentStatus,
          fulfillmentStatus: purchase.fulfillmentStatus,
          diagnostics: verification.diagnostics || null
        });
        return res.status(402).json({
          success: false,
          paymentStatus: purchase.paymentStatus,
          fulfillmentStatus: purchase.fulfillmentStatus,
          verification: verification.diagnostics || null,
          error: 'Payment provider did not return all expected verification details. Check server logs for the exact failed condition.'
        });
      }

      await markPurchasePaid(purchase, verification);
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
    paymentLog('PurchaseVerificationError', {
      reference: String(req.params.reference || ''),
      error: errorDetails(error)
    });
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


module.exports = router;
