const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Class = require('../models/Class');
const studentAuth = require('../middleware/studentAuth');
const adminAuth = require('../middleware/adminAuth');
const { authMiddleware } = require('./auth');

/* ============================================
   STUDENT ENDPOINTS - View Own Fees
   ============================================ */

// GET /api/fees/me - Return current student's fee summary and breakdown
router.get('/me', studentAuth, async (req, res) => {
  try {
    const student = req.student;
    const fees = Array.isArray(student.fees) ? student.fees : [];

    let paid = 0, due = 0, total = 0, waived = 0;
    let breakdown = [];

    for (const fee of fees) {
      total += fee.amount || 0;
      const status = String(fee.status).toLowerCase();
      
      if (status === 'paid') {
        paid += fee.amount || 0;
      } else if (status === 'waived') {
        waived += fee.amount || 0;
      } else if (status === 'partial') {
        paid += fee.paidAmount || 0;
        due += (fee.amount - (fee.paidAmount || 0)) || 0;
      } else {
        due += fee.amount || 0;
      }

      breakdown.push({
        _id: fee._id || '',
        type: fee.type,
        amount: fee.amount,
        status: fee.status,
        session: fee.session,
        term: fee.term,
        dueDate: fee.date ? (new Date(fee.date)).toISOString().split('T')[0] : '',
        paymentMethod: fee.method || '',
        paymentRef: fee.paymentRef || '',
        paidAmount: fee.paidAmount || 0,
        paidDate: fee.paidDate || null
      });
    }

    res.json({
      success: true,
      student: {
        name: `${student.firstname} ${student.surname}`,
        id: student.student_id,
        class: student.class,
        photoUrl: student.photoBase64 || ''
      },
      summary: {
        paid,
        due,
        total,
        waived,
        percentagePaid: total > 0 ? Math.round((paid / total) * 100) : 0
      },
      breakdown
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// GET /api/fees/class/:classId/me - Return all unique fees for the student's class
router.get('/class/:classId/me', studentAuth, async (req, res) => {
  try {
    const { classId } = req.params;
    const studentsInClass = await Student.find({ class: classId });
    
    const feeMap = {};
    studentsInClass.forEach(student => {
      (student.fees || []).forEach(fee => {
        const key = [fee.term, fee.session, fee.type, fee.amount].join(':');
        feeMap[key] = {
          class: classId,
          term: fee.term,
          session: fee.session,
          type: fee.type,
          amount: fee.amount,
          dueDate: fee.date ? (new Date(fee.date)).toISOString().split('T')[0] : ''
        };
      });
    });

    res.json({
      success: true,
      fees: Object.values(feeMap)
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/* ============================================
   ADMIN ENDPOINTS - Manage Fees
   ============================================ */

// GET /api/fees - Get all fees with filters
router.get('/', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { status, studentId, classId, term, session, search, limit = 50, skip = 0 } = req.query;
    
    let query = {};
    
    if (status) query['fees.status'] = status;
    if (term) query['fees.term'] = term;
    if (session) query['fees.session'] = session;
    if (classId) query.class = classId;

    let students = await Student.find(query)
      .select('student_id firstname surname class fees')
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    // Flatten fees with student info
    let allFees = [];
    students.forEach(student => {
      (student.fees || []).forEach(fee => {
        // Apply filters
        if (status && fee.status !== status) return;
        if (term && fee.term !== term) return;
        if (session && fee.session !== session) return;

        allFees.push({
          feeId: fee._id,
          student: {
            id: student.student_id,
            name: `${student.firstname} ${student.surname}`,
            class: student.class
          },
          type: fee.type,
          amount: fee.amount,
          status: fee.status,
          term: fee.term,
          session: fee.session,
          dueDate: fee.date ? (new Date(fee.date)).toISOString().split('T')[0] : '',
          paymentMethod: fee.method || '',
          paymentRef: fee.paymentRef || '',
          paidAmount: fee.paidAmount || 0
        });
      });
    });

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      allFees = allFees.filter(f => 
        f.student.name.toLowerCase().includes(searchLower) ||
        f.student.id.toLowerCase().includes(searchLower) ||
        f.type.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      success: true,
      total: allFees.length,
      fees: allFees
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// POST /api/fees - Create/assign fees to a class
router.post('/', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { classId, term, session, feeType, amount, dueDate } = req.body;

    if (!classId || !term || !session || !feeType || !amount || !dueDate) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }

    // Find all students in the class
    const students = await Student.find({ class: classId });

    if (!students.length) {
      return res.status(404).json({ 
        success: false, 
        error: 'No students found in this class' 
      });
    }

    // Create new fee object
    const newFee = {
      session,
      term,
      type: feeType,
      amount: parseFloat(amount),
      status: 'Unpaid',
      date: new Date(dueDate),
      method: '',
      paymentRef: '',
      paidAmount: 0,
      paidDate: null
    };

    let successCount = 0;
    let failureCount = 0;

    // Assign fee to all students in class
    for (const student of students) {
      try {
        // Check if fee already exists
        const feeExists = student.fees.some(f => 
          f.term === term && 
          f.session === session && 
          f.type === feeType
        );

        if (!feeExists) {
          student.fees.push(newFee);
          await student.save();
          successCount++;
        }
      } catch (error) {
        failureCount++;
      }
    }

    res.status(201).json({
      success: true,
      message: `Fee assigned to ${successCount} students`,
      studentsAssigned: successCount,
      studentsSkipped: failureCount
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// PUT /api/fees/student/:studentId/fee/:feeId - Update specific student's fee status
router.put('/student/:studentId/fee/:feeId', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { studentId, feeId } = req.params;
    const { status, paymentMethod, paymentRef, paidAmount, waiveReason } = req.body;

    const student = await Student.findOne({ student_id: studentId });

    if (!student) {
      return res.status(404).json({ 
        success: false, 
        error: 'Student not found' 
      });
    }

    const fee = student.fees.id(feeId);

    if (!fee) {
      return res.status(404).json({ 
        success: false, 
        error: 'Fee not found' 
      });
    }

    // Update fee details
    fee.status = status || fee.status;
    fee.method = paymentMethod || fee.method;
    fee.paymentRef = paymentRef || fee.paymentRef;
    
    if (status === 'Paid') {
      fee.paidAmount = fee.amount;
      fee.paidDate = new Date();
    } else if (status === 'Partial' && paidAmount) {
      fee.paidAmount = Math.min(parseFloat(paidAmount), fee.amount);
      fee.paidDate = new Date();
    } else if (status === 'Waived') {
      fee.paidAmount = fee.amount;
      fee.waiveReason = waiveReason || '';
      fee.paidDate = new Date();
    }

    await student.save();

    res.json({
      success: true,
      message: 'Fee status updated successfully',
      fee: {
        _id: fee._id,
        type: fee.type,
        amount: fee.amount,
        status: fee.status,
        paidAmount: fee.paidAmount,
        paymentMethod: fee.method,
        paymentRef: fee.paymentRef
      }
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// DELETE /api/fees/student/:studentId/fee/:feeId - Remove fee from student
router.delete('/student/:studentId/fee/:feeId', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { studentId, feeId } = req.params;

    const student = await Student.findOne({ student_id: studentId });

    if (!student) {
      return res.status(404).json({ 
        success: false, 
        error: 'Student not found' 
      });
    }

    student.fees.id(feeId).remove();
    await student.save();

    res.json({
      success: true,
      message: 'Fee removed successfully'
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// GET /api/fees/student/:studentId - Get specific student's fees
router.get('/student/:studentId', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findOne({ student_id: studentId })
      .select('student_id firstname surname class fees');

    if (!student) {
      return res.status(404).json({ 
        success: false, 
        error: 'Student not found' 
      });
    }

    let paid = 0, due = 0, total = 0, waived = 0;
    const feeDetails = [];

    (student.fees || []).forEach(fee => {
      total += fee.amount;
      const status = String(fee.status).toLowerCase();

      if (status === 'paid') {
        paid += fee.amount;
      } else if (status === 'waived') {
        waived += fee.amount;
      } else if (status === 'partial') {
        paid += fee.paidAmount || 0;
        due += (fee.amount - (fee.paidAmount || 0));
      } else {
        due += fee.amount;
      }

      feeDetails.push({
        _id: fee._id,
        type: fee.type,
        amount: fee.amount,
        status: fee.status,
        term: fee.term,
        session: fee.session,
        dueDate: fee.date ? (new Date(fee.date)).toISOString().split('T')[0] : '',
        paymentMethod: fee.method || '',
        paymentRef: fee.paymentRef || '',
        paidAmount: fee.paidAmount || 0,
        paidDate: fee.paidDate || null
      });
    });

    res.json({
      success: true,
      student: {
        id: student.student_id,
        name: `${student.firstname} ${student.surname}`,
        class: student.class
      },
      summary: {
        total,
        paid,
        due,
        waived,
        percentagePaid: total > 0 ? Math.round((paid / total) * 100) : 0
      },
      fees: feeDetails
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// GET /api/fees/search - Search students by name or ID
router.get('/search/student', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { query, limit = 20 } = req.query;

    if (!query || query.length < 2) {
      return res.status(400).json({ 
        success: false, 
        error: 'Query must be at least 2 characters' 
      });
    }

    const searchRegex = new RegExp(query, 'i');

    const students = await Student.find({
      $or: [
        { firstname: searchRegex },
        { surname: searchRegex },
        { student_id: searchRegex },
        { studentEmail: searchRegex }
      ]
    })
      .select('student_id firstname surname class')
      .limit(parseInt(limit));

    res.json({
      success: true,
      results: students.map(s => ({
        id: s.student_id,
        name: `${s.firstname} ${s.surname}`,
        class: s.class
      }))
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// GET /api/fees/statistics - Get fees statistics
router.get('/stats/all', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { classId, term, session } = req.query;

    let matchStage = {};
    if (classId) matchStage.class = classId;

    const students = await Student.find(matchStage);

    let stats = {
      totalFees: 0,
      paidFees: 0,
      outstandingFees: 0,
      waivedFees: 0,
      partialFees: 0,
      studentCount: students.length,
      feesByStatus: {
        paid: 0,
        unpaid: 0,
        waived: 0,
        partial: 0
      },
      feesByType: {}
    };

    students.forEach(student => {
      student.fees.forEach(fee => {
        if (term && fee.term !== term) return;
        if (session && fee.session !== session) return;

        stats.totalFees += fee.amount;

        const status = String(fee.status).toLowerCase();
        if (status === 'paid') {
          stats.paidFees += fee.amount;
          stats.feesByStatus.paid++;
        } else if (status === 'waived') {
          stats.waivedFees += fee.amount;
          stats.feesByStatus.waived++;
        } else if (status === 'partial') {
          stats.partialFees += fee.amount;
          stats.feesByStatus.partial++;
        } else {
          stats.outstandingFees += fee.amount;
          stats.feesByStatus.unpaid++;
        }

        // Track by fee type
        if (!stats.feesByType[fee.type]) {
          stats.feesByType[fee.type] = { total: 0, paid: 0, outstanding: 0 };
        }
        stats.feesByType[fee.type].total += fee.amount;
        if (status === 'paid' || status === 'waived') {
          stats.feesByType[fee.type].paid += fee.amount;
        } else {
          stats.feesByType[fee.type].outstanding += fee.amount;
        }
      });
    });

    res.json({
      success: true,
      statistics: stats
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// POST /api/fees/export - Export fees data (CSV format)
router.post('/export', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { classId, term, session, status } = req.body;

    let query = {};
    if (classId) query.class = classId;

    const students = await Student.find(query)
      .select('student_id firstname surname class fees');

    let csvData = 'Student ID,Student Name,Class,Fee Type,Amount,Status,Term,Session,Due Date,Payment Method,Reference\n';

    students.forEach(student => {
      student.fees.forEach(fee => {
        if (term && fee.term !== term) return;
        if (session && fee.session !== session) return;
        if (status && fee.status !== status) return;

        const dueDate = fee.date ? new Date(fee.date).toLocaleDateString() : '';
        csvData += `"${student.student_id}","${student.firstname} ${student.surname}","${student.class}","${fee.type}",${fee.amount},"${fee.status}","${fee.term}","${fee.session}","${dueDate}","${fee.method || ''}","${fee.paymentRef || ''}"\n`;
      });
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="fees_export_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvData);

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// GET /api/fees/classes - Get all classes for filter
router.get('/meta/classes', authMiddleware, adminAuth, async (req, res) => {
  try {
    const classes = await Student.distinct('class');

    res.json({
      success: true,
      classes: classes.sort()
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

module.exports = router;
