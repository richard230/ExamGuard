const express = require('express');
const router = express.Router();
const { authMiddleware } = require('./auth');
const adminAuth = require('../middleware/adminAuth');
const SalaryPayment = require('../models/SalaryPayment');
const AdminTransaction = require('../models/AdminTransaction');
const Staff = require('../models/Staff');
const User = require('../models/User');

// ==================== SALARY PAYMENT ENDPOINTS ====================

router.get('/salary', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { staff, status, year, month } = req.query;
    let query = {};

    if (staff) query.staff = staff;
    if (status) query.status = status;
    if (year) query.year = parseInt(year);
    if (month) query.month = month;

    const salaries = await SalaryPayment.find(query)
      .populate('staff', 'first_name last_name email designation position')  // ← FIXED
      .populate('paidBy', 'email name')
      .sort({ year: -1, month: -1 });

    res.json(salaries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/salary/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const salary = await SalaryPayment.findById(req.params.id)
      .populate('staff', 'first_name last_name email designation position')  // ← FIXED
      .populate('paidBy', 'email name');

    if (!salary) {
      return res.status(404).json({ error: 'Salary payment not found' });
    }

    res.json(salary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/salary', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { staffId, month, year, amount, method, reference } = req.body;

    // Validation
    if (!staffId || !month || !year || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if staff exists
    const staff = await Staff.findById(staffId);
    if (!staff) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    // Check if payment already exists for this month/year
    const exists = await SalaryPayment.findOne({
      staff: staffId,
      month,
      year
    });

    if (exists) {
      return res.status(400).json({ error: 'Salary payment already exists for this staff member in this month/year' });
    }

    const salary = new SalaryPayment({
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
    await salary.populate('staff', 'first_name last_name email designation position');  // ← FIXED
    await salary.populate('paidBy', 'email name');

    res.status(201).json(salary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.put('/salary/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { status, method, reference, waiveNote, notes } = req.body;

    const salary = await SalaryPayment.findById(req.params.id);
    if (!salary) {
      return res.status(404).json({ error: 'Salary payment not found' });
    }

    if (status) salary.status = status;
    if (method) salary.method = method;
    if (reference !== undefined) salary.reference = reference;
    if (waiveNote !== undefined) salary.waiveNote = waiveNote;
    if (notes !== undefined) salary.notes = notes;

    // Set paid date if status is being changed to Paid
    if (status === 'Paid' && salary.status !== 'Paid') {
      salary.paidDate = new Date();
      salary.paidBy = req.user._id;
    }

    await salary.save();
    await salary.populate('staff', 'first_name last_name email designation position');  // ← FIXED
    await salary.populate('paidBy', 'email name');

    res.json(salary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE salary payment
router.delete('/salary/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const salary = await SalaryPayment.findById(req.params.id);
    if (!salary) {
      return res.status(404).json({ error: 'Salary payment not found' });
    }

    await SalaryPayment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Salary payment deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ADMINISTRATIVE TRANSACTION ENDPOINTS ====================

// GET all admin transactions
router.get('/admin', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { type, status, vendor } = req.query;
    let query = {};

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
    res.status(500).json({ error: error.message });
  }
});

// GET single admin transaction
router.get('/admin/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const transaction = await AdminTransaction.findById(req.params.id)
      .populate('createdBy', 'email name')
      .populate('paidBy', 'email name')
      .populate('approvedBy', 'email name');

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE admin transaction
router.post('/admin', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { type, description, vendor, amount, method, reference } = req.body;

    // Validation
    if (!type || !description || !vendor || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const transaction = new AdminTransaction({
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
    res.status(500).json({ error: error.message });
  }
});

// UPDATE admin transaction
router.put('/admin/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { status, method, reference, notes } = req.body;

    const transaction = await AdminTransaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (status) transaction.status = status;
    if (method) transaction.method = method;
    if (reference !== undefined) transaction.reference = reference;
    if (notes !== undefined) transaction.notes = notes;

    // Set paid date if status is being changed to Paid
    if (status === 'Paid' && transaction.status !== 'Paid') {
      transaction.paidDate = new Date();
      transaction.paidBy = req.user._id;
    }

    // Set approved date if status is being changed to Approved
    if (status === 'Approved' && transaction.status !== 'Approved') {
      transaction.approvedBy = req.user._id;
    }

    await transaction.save();
    await transaction.populate('createdBy', 'email name');
    await transaction.populate('paidBy', 'email name');
    await transaction.populate('approvedBy', 'email name');

    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE admin transaction
router.delete('/admin/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const transaction = await AdminTransaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    await AdminTransaction.findByIdAndDelete(req.params.id);
    res.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== STATISTICS ENDPOINTS ====================

// GET payment statistics
router.get('/stats', authMiddleware, adminAuth, async (req, res) => {
  try {
    // Salary statistics
    const totalSalariesData = await SalaryPayment.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalSalaries = totalSalariesData[0]?.total || 0;

    const paidSalariesData = await SalaryPayment.aggregate([
      { $match: { status: 'Paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const paidSalaries = paidSalariesData[0]?.total || 0;

    const outstandingSalariesData = await SalaryPayment.aggregate([
      { $match: { status: { $in: ['Unpaid', 'Pending'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const outstandingSalaries = outstandingSalariesData[0]?.total || 0;

    // Admin transaction statistics
    const totalAdminData = await AdminTransaction.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalAdminTransactions = totalAdminData[0]?.total || 0;

    const paidAdminData = await AdminTransaction.aggregate([
      { $match: { status: 'Paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const paidAdminTransactions = paidAdminData[0]?.total || 0;

    res.json({
      totalSalaries,
      paidSalaries,
      outstandingSalaries,
      totalAdminTransactions,
      paidAdminTransactions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET salary statistics by staff
router.get('/salary/stats/:staffId', authMiddleware, adminAuth, async (req, res) => {
  try {
    const staffId = req.params.staffId;

    const stats = await SalaryPayment.aggregate([
      { $match: { staff: mongoose.Types.ObjectId(staffId) } },
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
    res.status(500).json({ error: error.message });
  }
});

// ==================== REPORT ENDPOINTS ====================

// GET salary report by period
router.get('/salary/report', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { year, month, status } = req.query;
    let query = {};

    if (year) query.year = parseInt(year);
    if (month) query.month = month;
    if (status) query.status = status;

    const report = await SalaryPayment.find(query)
      .populate('staff', 'name email position')
      .sort({ 'staff.name': 1 });

    // Calculate totals
    const totalAmount = report.reduce((sum, sal) => sum + (sal.amount || 0), 0);
    const paidAmount = report.filter(sal => sal.status === 'Paid')
      .reduce((sum, sal) => sum + (sal.amount || 0), 0);
    const unpaidAmount = report.filter(sal => sal.status !== 'Paid')
      .reduce((sum, sal) => sum + (sal.amount || 0), 0);

    res.json({
      data: report,
      summary: {
        totalAmount,
        paidAmount,
        unpaidAmount,
        count: report.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET admin transaction report by type
router.get('/admin/report', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { type, status, startDate, endDate } = req.query;
    let query = {};

    if (type) query.type = type;
    if (status) query.status = status;

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const report = await AdminTransaction.find(query)
      .populate('createdBy', 'email name')
      .populate('vendor')
      .sort({ date: -1 });

    // Calculate totals
    const totalAmount = report.reduce((sum, trans) => sum + (trans.amount || 0), 0);
    const paidAmount = report.filter(trans => trans.status === 'Paid')
      .reduce((sum, trans) => sum + (trans.amount || 0), 0);

    // Group by type
    const byType = {};
    report.forEach(trans => {
      if (!byType[trans.type]) {
        byType[trans.type] = { count: 0, amount: 0 };
      }
      byType[trans.type].count += 1;
      byType[trans.type].amount += trans.amount;
    });

    res.json({
      data: report,
      summary: {
        totalAmount,
        paidAmount,
        count: report.length,
        byType
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
