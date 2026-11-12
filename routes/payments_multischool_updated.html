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
 * Existing records created before multi-school support will need a schoolId
 * backfill before they can be safely displayed by these tenant-scoped routes.
 */

// ==================== SALARY PAYMENT ENDPOINTS ====================


router.get('/salary', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { staff, status, year, month } = req.query;

    const school = await resolveCurrentSchool(req);
    if (!school) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No active school is associated with this account.'
      });
    }

    const query = schoolFilter(school);

    if (staff) query.staff = staff;
    if (status) query.status = status;
    if (year) query.year = parseInt(year);
    if (month) query.month = month;

    const salaries = await SalaryPayment.find(query)
      .populate('staff', 'first_name last_name email designation position')
      .populate('paidBy', 'email name')
      .sort({ year: -1, month: -1 });

    res.json(salaries);
  } catch (error) {
    if (handleTenantError(res, error)) return;
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/salary/:id', authMiddleware, adminAuth, async (req, res) => {
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
    )
      .populate('staff', 'first_name last_name email designation position')
      .populate('paidBy', 'email name');

    if (!salary) {
      return res.status(404).json({ error: 'Salary payment not found' });
    }

    res.json(salary);
  } catch (error) {
    if (handleTenantError(res, error)) return;
    res.status(500).json({ success: false, error: error.message });
  }
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
    if (!school) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No active school is associated with this account.'
      });
    }

    const query = schoolFilter(school);

    if (type) query.type = type;
    if (status) query.status = status;
    if (vendor) query.vendor = new RegExp(vendor, 'i');

    const transactions = await AdminTransaction.find(query)
      .populate('createdBy', 'email name')
      .populate('paidBy', 'email name')
      .populate('approvedBy', 'email name')
      .sort({ date: -1 });

    res.json(transactions);
  } catch (error) {
    if (handleTenantError(res, error)) return;
    res.status(500).json({ success: false, error: error.message });
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
    if (!school) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No active school is associated with this account.'
      });
    }

    const schoolId = schoolScope(school);

    const totalSalariesData = await SalaryPayment.aggregate([
      { $match: { schoolId } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalSalaries = totalSalariesData[0]?.total || 0;

    const paidSalariesData = await SalaryPayment.aggregate([
      { $match: { schoolId, status: 'Paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const paidSalaries = paidSalariesData[0]?.total || 0;

    const outstandingSalariesData = await SalaryPayment.aggregate([
      { $match: { schoolId, status: { $in: ['Unpaid', 'Pending'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const outstandingSalaries = outstandingSalariesData[0]?.total || 0;

    const totalAdminData = await AdminTransaction.aggregate([
      { $match: { schoolId } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalAdminTransactions = totalAdminData[0]?.total || 0;

    const paidAdminData = await AdminTransaction.aggregate([
      { $match: { schoolId, status: 'Paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const paidAdminTransactions = paidAdminData[0]?.total || 0;

    res.json({
      success: true,
      totalSalaries,
      paidSalaries,
      outstandingSalaries,
      totalAdminTransactions,
      paidAdminTransactions,
      schoolId
    });
  } catch (error) {
    if (handleTenantError(res, error)) return;
    res.status(500).json({ success: false, error: error.message });
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
    if (!school) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No active school is associated with this account.'
      });
    }

    const query = schoolFilter(school);

    if (year) query.year = parseInt(year);
    if (month) query.month = month;
    if (status) query.status = status;

    const report = await SalaryPayment.find(query)
      .populate('staff', 'first_name last_name email designation position')
      .sort({ year: -1, month: -1 });

    const totalAmount = report.reduce((sum, sal) => sum + (sal.amount || 0), 0);
    const paidAmount = report
      .filter(sal => sal.status === 'Paid')
      .reduce((sum, sal) => sum + (sal.amount || 0), 0);
    const unpaidAmount = report
      .filter(sal => sal.status !== 'Paid')
      .reduce((sum, sal) => sum + (sal.amount || 0), 0);

    res.json({
      data: report,
      summary: {
        totalAmount,
        paidAmount,
        unpaidAmount,
        count: report.length
      },
      schoolId: schoolScope(school)
    });
  } catch (error) {
    if (handleTenantError(res, error)) return;
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET admin transaction report by type
router.get('/admin/report', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { type, status, startDate, endDate } = req.query;

    const school = await resolveCurrentSchool(req);
    if (!school) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No active school is associated with this account.'
      });
    }

    const query = schoolFilter(school);

    if (type) query.type = type;
    if (status) query.status = status;

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    const report = await AdminTransaction.find(query)
      .populate('createdBy', 'email name')
      .populate('vendor')
      .sort({ date: -1 });

    const totalAmount = report.reduce((sum, trans) => sum + (trans.amount || 0), 0);
    const paidAmount = report
      .filter(trans => trans.status === 'Paid')
      .reduce((sum, trans) => sum + (trans.amount || 0), 0);

    const byType = {};
    report.forEach(trans => {
      if (!byType[trans.type]) {
        byType[trans.type] = { count: 0, amount: 0 };
      }

      byType[trans.type].count += 1;
      byType[trans.type].amount += trans.amount || 0;
    });

    res.json({
      data: report,
      summary: {
        totalAmount,
        paidAmount,
        count: report.length,
        byType
      },
      schoolId: schoolScope(school)
    });
  } catch (error) {
    if (handleTenantError(res, error)) return;
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
