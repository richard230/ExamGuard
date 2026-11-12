const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const School = require('../models/School');
const { authMiddleware } = require('./auth');
const adminAuth = require('../middleware/adminAuth');
const SalaryPayment = require('../models/SalaryPayment');
const AdminTransaction = require('../models/AdminTransaction');
const Staff = require('../models/Staff');
const User = require('../models/User');


// ==================== MULTI-SCHOOL / TENANT HELPERS ====================

function getUserSchoolIdentifiers(user = {}) {
  const values = [
    user.schoolId,
    user.schoolKey,
    user.schoolCode,
    typeof user.school === 'string' ? user.school : null,
    user.school?.schoolId,
    user.school?._id
  ]
    .filter(Boolean)
    .map(value => String(value).trim());

  return [...new Set(values)];
}

function isPlatformAdmin(user = {}) {
  const roles = [
    user.role,
    user.userType,
    user.accountType,
    user.type
  ]
    .filter(Boolean)
    .map(value => String(value).toLowerCase().trim());

  return roles.some(role => [
    'systemadmin',
    'system_admin',
    'platformadmin',
    'platform_admin'
  ].includes(role));
}

function getRequestedSchoolId(req) {
  return String(
    req.params?.schoolId ||
    req.body?.schoolId ||
    req.query?.schoolId ||
    req.headers?.['x-school-id'] ||
    req.headers?.['x-school-code'] ||
    req.headers?.['x-schoolid'] ||
    ''
  ).trim();
}

/**
 * Resolve the active school for the authenticated request.
 *
 * School-scoped admins can only access their own school.
 * Platform/system admins may explicitly select a school through
 * schoolId/query/header context.
 */
async function resolveCurrentSchool(req) {
  const user = req.user || {};
  const identifiers = getUserSchoolIdentifiers(user);
  const requestedId = getRequestedSchoolId(req);
  const platformAdmin = isPlatformAdmin(user);

  const schoolIdentifier = requestedId || identifiers[0] || '';

  if (!schoolIdentifier) return null;

  const query = {
    status: 'active',
    isDeleted: { $ne: true }
  };

  if (mongoose.Types.ObjectId.isValid(schoolIdentifier)) {
    query._id = schoolIdentifier;
  } else {
    query.schoolId = schoolIdentifier;
  }

  const school = await School.findOne(query).lean();

  if (!school) return null;

  if (!platformAdmin) {
    const belongs = identifiers.some(identifier =>
      identifier === String(school._id) ||
      identifier === String(school.schoolId)
    );

    if (!belongs) {
      const error = new Error('You are not authorized to access this school.');
      error.statusCode = 403;
      throw error;
    }
  }

  return school;
}

function schoolScope(school) {
  return String(school._id);
}

function schoolFilter(school, extra = {}) {
  return {
    ...extra,
    schoolId: schoolScope(school)
  };
}

function getPaymentConfigFromSchool(school) {
  const cfg = school?.paymentConfig || {};
  const enabledGateways = Array.isArray(cfg.enabledGateways)
    ? cfg.enabledGateways.filter(Boolean)
    : [];
  let method = cfg.method || cfg.paymentMethod || cfg.paymentType || cfg.receivingMethod || '';
  if (!method) method = enabledGateways.length ? 'gateway' : 'direct';
  return {
    ...cfg,
    method,
    enabledGateways,
    publicKeys: {
      paystackPublicKey: cfg.publicKeys?.paystackPublicKey || '',
      flutterwavePublicKey: cfg.publicKeys?.flutterwavePublicKey || '',
      stripePublicKey: cfg.publicKeys?.stripePublicKey || '',
      remitaMerchantId: cfg.publicKeys?.remitaMerchantId || ''
    },
    bankTransferDetails: Array.isArray(cfg.bankTransferDetails) ? cfg.bankTransferDetails : []
  };
}

/*
 * Legacy records created before schoolId was added can still be resolved
 * safely through their school-owned Staff/User relationship. New records
 * always receive schoolId directly.
 */
async function findSalaryPaymentsForSchool(school, filter = {}) {
  const current = await SalaryPayment.find(schoolFilter(school, filter))
    .populate('staff', 'first_name last_name email designation position schoolId')
    .populate('paidBy', 'email name schoolId')
    .sort({ year: -1, month: -1 });

  const legacy = await SalaryPayment.find({
    ...filter,
    $or: [{ schoolId: { $exists: false } }, { schoolId: null }, { schoolId: '' }]
  })
    .populate('staff', 'first_name last_name email designation position schoolId')
    .populate('paidBy', 'email name schoolId')
    .sort({ year: -1, month: -1 });

  const target = schoolScope(school);
  const validLegacy = legacy.filter(p =>
    String(p.staff?.schoolId || '') === target || String(p.paidBy?.schoolId || '') === target
  );
  const seen = new Set();
  return [...current, ...validLegacy].filter(p => {
    const id = String(p._id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function findAdminTransactionsForSchool(school, filter = {}) {
  const current = await AdminTransaction.find(schoolFilter(school, filter))
    .populate('createdBy', 'email name schoolId')
    .populate('paidBy', 'email name schoolId')
    .populate('approvedBy', 'email name schoolId')
    .sort({ date: -1 });

  const legacy = await AdminTransaction.find({
    ...filter,
    $or: [{ schoolId: { $exists: false } }, { schoolId: null }, { schoolId: '' }]
  })
    .populate('createdBy', 'email name schoolId')
    .populate('paidBy', 'email name schoolId')
    .populate('approvedBy', 'email name schoolId')
    .sort({ date: -1 });

  const target = schoolScope(school);
  const validLegacy = legacy.filter(t =>
    String(t.createdBy?.schoolId || '') === target || String(t.paidBy?.schoolId || '') === target
  );
  const seen = new Set();
  return [...current, ...validLegacy].filter(t => {
    const id = String(t._id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function withResolvedSchool(document, school) {
  const raw = document?.toObject ? document.toObject() : { ...document };
  if (!raw.schoolId) raw.schoolId = schoolScope(school);
  return raw;
}

function schoolIdFromDocument(document) {
  return document?.schoolId ? String(document.schoolId) : '';
}

function handleTenantError(res, error) {
  if (error?.statusCode === 403) {
    return res.status(403).json({
      success: false,
      error: error.message
    });
  }

  return null;
}


/*
 * IMPORTANT MODEL REQUIREMENT:
 * SalaryPayment and AdminTransaction must define a `schoolId` field
 * (preferably indexed) for tenant isolation, e.g.:
 *   schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true }
 *
 * Existing records created before multi-school support may have no schoolId. This version
 * resolves those legacy records through their school-owned Staff/User relationship.
 * New records always receive schoolId directly.
 */

// ==================== SCHOOL / PAYMENT CONFIGURATION ====================

router.get('/config', authMiddleware, adminAuth, async (req,res)=>{
  try{
    const school=await resolveCurrentSchool(req);
    if(!school)return res.status(401).json({success:false,error:'Unauthorized: No active school is associated with this account.'});
    return res.json({success:true,schoolId:schoolScope(school),school:{_id:school._id,schoolId:school.schoolId,schoolName:school.schoolName,abbreviation:school.abbreviation,motto:school.motto||'',logoUrl:school.logoUrl||school.branding?.logo||'',branding:school.branding||{},email:school.email||'',phone:school.phone||'',address:school.address||'',city:school.city||'',state:school.state||'',country:school.country||''},paymentConfig:getPaymentConfigFromSchool(school)});
  }catch(error){if(handleTenantError(res,error))return;res.status(500).json({success:false,error:error.message});}
});

router.get('/payment-config', authMiddleware, adminAuth, async (req,res)=>{
  try{
    const school=await resolveCurrentSchool(req);
    if(!school)return res.status(401).json({success:false,error:'Unauthorized: No active school is associated with this account.'});
    return res.json({success:true,schoolId:schoolScope(school),school:{_id:school._id,schoolId:school.schoolId,schoolName:school.schoolName,abbreviation:school.abbreviation,logoUrl:school.logoUrl||school.branding?.logo||'',branding:school.branding||{}},paymentConfig:getPaymentConfigFromSchool(school)});
  }catch(error){if(handleTenantError(res,error))return;res.status(500).json({success:false,error:error.message});}
});

router.post('/payment-config', authMiddleware, adminAuth, async (req,res)=>{
  try{
    const school=await resolveCurrentSchool(req);
    if(!school)return res.status(401).json({success:false,error:'Unauthorized: No active school is associated with this account.'});
    const b=req.body||{}, current=school.paymentConfig||{};
    const gateways=Array.isArray(b.enabledGateways)?[...new Set(b.enabledGateways.filter(Boolean).map(String))]:(current.enabledGateways||[]);
    const method=b.method||b.paymentMethod||b.paymentType||b.receivingMethod||current.method||(gateways.length?'gateway':'direct');
    const bank=b.bankDetails||{};
    school.paymentConfig={...current,method,paymentMethod:method,paymentType:method,receivingMethod:method,enabledGateways:gateways,allowPartialPayments:b.allowPartialPayments!==undefined?Boolean(b.allowPartialPayments):Boolean(current.allowPartialPayments??true),allowInstallments:b.allowInstallments!==undefined?Boolean(b.allowInstallments):Boolean(current.allowInstallments??false),publicKeys:{...(current.publicKeys||{}),...(b.publicKeys||{})},bankName:bank.bankName??b.bankName??current.bankName??'',accountName:bank.accountName??b.accountName??current.accountName??'',accountNumber:bank.accountNumber??b.accountNumber??current.accountNumber??'',sortCode:bank.sortCode??b.sortCode??current.sortCode??'',bankTransferDetails:Array.isArray(b.bankTransferDetails)?b.bankTransferDetails:(current.bankTransferDetails||[]),consentSigned:b.consentSigned!==undefined?Boolean(b.consentSigned):Boolean(current.consentSigned)};
    school.lastModifiedBy=req.user?._id||null;
    await school.save();
    const saved=await School.findById(school._id).lean();
    return res.json({success:true,schoolId:schoolScope(school),school:{_id:saved._id,schoolId:saved.schoolId,schoolName:saved.schoolName,abbreviation:saved.abbreviation,logoUrl:saved.logoUrl||saved.branding?.logo||'',branding:saved.branding||{}},paymentConfig:getPaymentConfigFromSchool(saved)});
  }catch(error){if(handleTenantError(res,error))return;res.status(500).json({success:false,error:error.message});}
});

// ==================== SALARY PAYMENT ENDPOINTS ====================


router.get('/salary', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { staff, status, year, month } = req.query;
    const school = await resolveCurrentSchool(req);
    if (!school) return res.status(401).json({ success:false, error:'Unauthorized: No active school is associated with this account.' });
    const filter = {};
    if (staff) filter.staff = staff;
    if (status) filter.status = status;
    if (year) filter.year = parseInt(year);
    if (month) filter.month = month;
    const salaries = await findSalaryPaymentsForSchool(school, filter);
    res.json(salaries.map(x => withResolvedSchool(x, school)));
  } catch (error) {
    if (handleTenantError(res, error)) return;
    res.status(500).json({ success:false, error:error.message });
  }
});

router.get('/salary/:id', authMiddleware, adminAuth, async (req,res)=>{
  try{
    const school=await resolveCurrentSchool(req);
    if(!school)return res.status(401).json({success:false,error:'Unauthorized: No active school is associated with this account.'});
    let salary=await SalaryPayment.findOne(schoolFilter(school,{_id:req.params.id})).populate('staff','first_name last_name email designation position schoolId').populate('paidBy','email name schoolId');
    if(!salary){
      salary=await SalaryPayment.findOne({_id:req.params.id,$or:[{schoolId:{$exists:false}},{schoolId:null},{schoolId:''}]}).populate('staff','first_name last_name email designation position schoolId').populate('paidBy','email name schoolId');
      const target=schoolScope(school);
      if(salary && String(salary.staff?.schoolId||'')!==target && String(salary.paidBy?.schoolId||'')!==target) salary=null;
    }
    if(!salary)return res.status(404).json({error:'Salary payment not found'});
    res.json(withResolvedSchool(salary,school));
  }catch(error){if(handleTenantError(res,error))return;res.status(500).json({success:false,error:error.message});}
});

router.post('/salary', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { staffId, month, year, amount, method, reference } = req.body;

    if (!staffId || !month || !year || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const school = await resolveCurrentSchool(req);
    if (!school) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No active school is associated with this account.'
      });
    }

    const schoolId = schoolScope(school);

    // Staff must belong to the current school.
    const staffRecord = await Staff.findOne({
      _id: staffId,
      schoolId
    });

    if (!staffRecord) {
      return res.status(404).json({ error: 'Staff not found in the current school' });
    }

    const exists = await SalaryPayment.findOne({
      schoolId,
      staff: staffId,
      month,
      year
    });

    if (exists) {
      return res.status(400).json({
        error: 'Salary payment already exists for this staff member in this month/year'
      });
    }

    const salary = new SalaryPayment({
      schoolId,
      staff: staffId,
      month,
      year,
      amount,
      method: method || null,
      reference,
      status: method ? 'Paid' : 'Pending',
      paidDate: method ? new Date() : null,
      paidBy: req.user._id
    });

    await salary.save();
    await salary.populate('staff', 'first_name last_name email designation position');
    await salary.populate('paidBy', 'email name');

    res.status(201).json(salary);
  } catch (error) {
    if (handleTenantError(res, error)) return;
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/salary/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { status, method, reference, waiveNote, notes } = req.body;

    const school = await resolveCurrentSchool(req);
    if (!school) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No active school is associated with this account.'
      });
    }

    const salary = await SalaryPayment.findOne(
      schoolFilter(school, { _id: req.params.id })
    );

    if (!salary) {
      return res.status(404).json({ error: 'Salary payment not found' });
    }

    if (salary.staff) {
      const staffRecord = await Staff.findOne(schoolFilter(school, { _id: salary.staff })).select('_id');
      if (!staffRecord) return res.status(403).json({ success:false, error:'This salary payment does not belong to the current school.' });
    }

    const previousStatus = salary.status;

    if (status) salary.status = status;
    if (method !== undefined) salary.method = method;
    if (reference !== undefined) salary.reference = reference;
    if (waiveNote !== undefined) salary.waiveNote = waiveNote;
    if (notes !== undefined) salary.notes = notes;

    if (status === 'Paid' && previousStatus !== 'Paid') {
      salary.paidDate = new Date();
      salary.paidBy = req.user._id;
    }

    await salary.save();
    await salary.populate('staff', 'first_name last_name email designation position');
    await salary.populate('paidBy', 'email name');

    res.json(salary);
  } catch (error) {
    if (handleTenantError(res, error)) return;
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE salary payment
router.delete('/salary/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await resolveCurrentSchool(req);
    if (!school) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No active school is associated with this account.'
      });
    }

    const salary = await SalaryPayment.findOne(
      schoolFilter(school, { _id: req.params.id })
    );

    if (!salary) {
      return res.status(404).json({ error: 'Salary payment not found' });
    }

    await SalaryPayment.deleteOne(
      schoolFilter(school, { _id: req.params.id })
    );

    res.json({
      success: true,
      message: 'Salary payment deleted successfully'
    });
  } catch (error) {
    if (handleTenantError(res, error)) return;
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ADMINISTRATIVE TRANSACTION ENDPOINTS ====================

// GET all admin transactions
router.get('/admin', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { type, status, vendor } = req.query;
    const school = await resolveCurrentSchool(req);
    if (!school) return res.status(401).json({ success:false, error:'Unauthorized: No active school is associated with this account.' });
    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (vendor) filter.vendor = new RegExp(vendor, 'i');
    const transactions = await findAdminTransactionsForSchool(school, filter);
    res.json(transactions.map(x => withResolvedSchool(x, school)));
  } catch (error) {
    if (handleTenantError(res, error)) return;
    res.status(500).json({ success:false, error:error.message });
  }
});

// GET single admin transaction
router.get('/admin/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await resolveCurrentSchool(req);
    if (!school) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No active school is associated with this account.'
      });
    }

    const transaction = await AdminTransaction.findOne(
      schoolFilter(school, { _id: req.params.id })
    )
      .populate('createdBy', 'email name')
      .populate('paidBy', 'email name')
      .populate('approvedBy', 'email name');

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(transaction);
  } catch (error) {
    if (handleTenantError(res, error)) return;
    res.status(500).json({ success: false, error: error.message });
  }
});

// CREATE admin transaction
router.post('/admin', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { type, description, vendor, amount, method, reference } = req.body;

    if (!type || !description || !vendor || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const school = await resolveCurrentSchool(req);
    if (!school) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No active school is associated with this account.'
      });
    }

    const transaction = new AdminTransaction({
      schoolId: schoolScope(school),
      type,
      description,
      vendor,
      amount,
      method: method || null,
      reference,
      status: method ? 'Paid' : 'Pending',
      date: new Date(),
      createdBy: req.user._id,
      paidDate: method ? new Date() : null,
      paidBy: method ? req.user._id : null
    });

    await transaction.save();
    await transaction.populate('createdBy', 'email name');
    await transaction.populate('paidBy', 'email name');

    res.status(201).json(transaction);
  } catch (error) {
    if (handleTenantError(res, error)) return;
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATE admin transaction
router.put('/admin/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { status, method, reference, notes } = req.body;

    const school = await resolveCurrentSchool(req);
    if (!school) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No active school is associated with this account.'
      });
    }

    const transaction = await AdminTransaction.findOne(
      schoolFilter(school, { _id: req.params.id })
    );

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const previousStatus = transaction.status;

    if (status) transaction.status = status;
    if (method !== undefined) transaction.method = method;
    if (reference !== undefined) transaction.reference = reference;
    if (notes !== undefined) transaction.notes = notes;

    if (status === 'Paid' && previousStatus !== 'Paid') {
      transaction.paidDate = new Date();
      transaction.paidBy = req.user._id;
    }

    if (status === 'Approved' && previousStatus !== 'Approved') {
      transaction.approvedBy = req.user._id;
    }

    await transaction.save();
    await transaction.populate('createdBy', 'email name');
    await transaction.populate('paidBy', 'email name');
    await transaction.populate('approvedBy', 'email name');

    res.json(transaction);
  } catch (error) {
    if (handleTenantError(res, error)) return;
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE admin transaction
router.delete('/admin/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await resolveCurrentSchool(req);
    if (!school) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No active school is associated with this account.'
      });
    }

    const transaction = await AdminTransaction.findOne(
      schoolFilter(school, { _id: req.params.id })
    );

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    await AdminTransaction.deleteOne(
      schoolFilter(school, { _id: req.params.id })
    );

    res.json({
      success: true,
      message: 'Admin transaction deleted successfully'
    });
  } catch (error) {
    if (handleTenantError(res, error)) return;
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== STATISTICS ENDPOINTS ====================

// GET payment statistics
router.get('/stats', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await resolveCurrentSchool(req);
    if (!school) return res.status(401).json({ success:false, error:'Unauthorized: No active school is associated with this account.' });
    const salaries = await findSalaryPaymentsForSchool(school);
    const transactions = await findAdminTransactionsForSchool(school);
    const totalSalaries = salaries.reduce((s,x)=>s+Number(x.amount||0),0);
    const paidSalaries = salaries.filter(x=>String(x.status).toLowerCase()==='paid').reduce((s,x)=>s+Number(x.amount||0),0);
    const outstandingSalaries = salaries.filter(x=>['unpaid','pending'].includes(String(x.status).toLowerCase())).reduce((s,x)=>s+Number(x.amount||0),0);
    const totalAdminTransactions = transactions.reduce((s,x)=>s+Number(x.amount||0),0);
    const paidAdminTransactions = transactions.filter(x=>String(x.status).toLowerCase()==='paid').reduce((s,x)=>s+Number(x.amount||0),0);
    res.json({ success:true, totalSalaries, paidSalaries, outstandingSalaries, totalAdminTransactions, paidAdminTransactions, schoolId:schoolScope(school), paymentConfig:getPaymentConfigFromSchool(school), school:{_id:school._id, schoolId:school.schoolId, schoolName:school.schoolName, abbreviation:school.abbreviation, logoUrl:school.logoUrl||school.branding?.logo||'', branding:school.branding||{}} });
  } catch (error) {
    if (handleTenantError(res, error)) return;
    res.status(500).json({ success:false, error:error.message });
  }
});

// GET salary statistics by staff
router.get('/salary/stats/:staffId', authMiddleware, adminAuth, async (req, res) => {
  try {
    const school = await resolveCurrentSchool(req);
    if (!school) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No active school is associated with this account.'
      });
    }

    const staffRecord = await Staff.findOne(
      schoolFilter(school, { _id: req.params.staffId })
    );

    if (!staffRecord) {
      return res.status(404).json({ error: 'Staff not found in the current school' });
    }

    const stats = await SalaryPayment.aggregate([
      {
        $match: {
          schoolId: schoolScope(school),
          staff: staffRecord._id
        }
      },
      {
        $group: {
          _id: '$status',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    res.json(stats);
  } catch (error) {
    if (handleTenantError(res, error)) return;
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== REPORT ENDPOINTS ====================

// GET salary report by period
router.get('/salary/report', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { year, month, status } = req.query;
    const school = await resolveCurrentSchool(req);
    if (!school) return res.status(401).json({ success:false, error:'Unauthorized: No active school is associated with this account.' });
    const filter={};
    if(year) filter.year=parseInt(year);
    if(month) filter.month=month;
    if(status) filter.status=status;
    const report=await findSalaryPaymentsForSchool(school,filter);
    const totalAmount=report.reduce((s,x)=>s+Number(x.amount||0),0);
    const paidAmount=report.filter(x=>x.status==='Paid').reduce((s,x)=>s+Number(x.amount||0),0);
    const unpaidAmount=report.filter(x=>x.status!=='Paid').reduce((s,x)=>s+Number(x.amount||0),0);
    res.json({data:report.map(x=>withResolvedSchool(x,school)),summary:{totalAmount,paidAmount,unpaidAmount,count:report.length},schoolId:schoolScope(school),paymentConfig:getPaymentConfigFromSchool(school)});
  } catch(error){ if(handleTenantError(res,error)) return; res.status(500).json({success:false,error:error.message}); }
});

// GET admin transaction report by type
router.get('/admin/report', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { type, status, startDate, endDate } = req.query;
    const school = await resolveCurrentSchool(req);
    if (!school) return res.status(401).json({ success:false, error:'Unauthorized: No active school is associated with this account.' });
    const filter={};
    if(type) filter.type=type;
    if(status) filter.status=status;
    if(startDate||endDate){filter.date={};if(startDate)filter.date.$gte=new Date(startDate);if(endDate){const d=new Date(endDate);d.setHours(23,59,59,999);filter.date.$lte=d;}}
    const report=await findAdminTransactionsForSchool(school,filter);
    const totalAmount=report.reduce((s,x)=>s+Number(x.amount||0),0);
    const paidAmount=report.filter(x=>x.status==='Paid').reduce((s,x)=>s+Number(x.amount||0),0);
    const byType={}; report.forEach(x=>{if(!byType[x.type])byType[x.type]={count:0,amount:0};byType[x.type].count++;byType[x.type].amount+=Number(x.amount||0);});
    res.json({data:report.map(x=>withResolvedSchool(x,school)),summary:{totalAmount,paidAmount,count:report.length,byType},schoolId:schoolScope(school),paymentConfig:getPaymentConfigFromSchool(school)});
  } catch(error){ if(handleTenantError(res,error)) return; res.status(500).json({success:false,error:error.message}); }
});

module.exports = router;
