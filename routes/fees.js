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

/**
 * GET /api/fees/me
 * Return current student's fee summary and breakdown
 * Auth: Student
 */
router.get('/me', studentAuth, async (req, res) => {
  try {
    const student = req.student;
    if (!student) {
      return res.status(401).json({ 
        success: false, 
        error: 'Student not authenticated' 
      });
    }

    const fees = Array.isArray(student.fees) ? student.fees : [];

    let paid = 0, due = 0, total = 0, waived = 0, partial = 0;
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
        partial += fee.paidAmount || 0;
        due += (fee.amount - (fee.paidAmount || 0)) || 0;
      } else {
        due += fee.amount || 0;
      }

      breakdown.push({
        _id: fee._id || '',
        type: fee.type || 'Unknown',
        amount: fee.amount || 0,
        status: fee.status || 'Unpaid',
        session: fee.session || '',
        term: fee.term || '',
        dueDate: fee.date ? (new Date(fee.date)).toISOString().split('T')[0] : '',
        paymentMethod: fee.method || '',
        paymentRef: fee.paymentRef || '',
        paidAmount: fee.paidAmount || 0,
        paidDate: fee.paidDate || null,
        waiveReason: fee.waiveReason || ''
      });
    }

    res.json({
      success: true,
      student: {
        name: `${student.firstname} ${student.surname}`,
        id: student.student_id,
        class: student.class,
        photoUrl: student.photoBase64 || '',
        email: student.studentEmail || ''
      },
      summary: {
        paid,
        due,
        total,
        waived,
        partial,
        percentagePaid: total > 0 ? Math.round((paid / total) * 100) : 0,
        percentagePending: total > 0 ? Math.round((due / total) * 100) : 0
      },
      breakdown,
      timestamp: new Date()
    });
  } catch (err) {
    console.error('Error in /fees/me:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/**
 * GET /api/fees/class/:classId/me
 * Return all unique fees for the student's class
 * Auth: Student
 */
router.get('/class/:classId/me', studentAuth, async (req, res) => {
  try {
    const { classId } = req.params;
    
    if (!classId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Class ID is required' 
      });
    }

    const studentsInClass = await Student.find({ class: classId });
    
    if (!studentsInClass.length) {
      return res.status(404).json({ 
        success: false, 
        error: 'No students found in this class' 
      });
    }

    const feeMap = {};
    studentsInClass.forEach(student => {
      (student.fees || []).forEach(fee => {
        const key = [fee.term, fee.session, fee.type, fee.amount].join(':');
        feeMap[key] = {
          class: classId,
          term: fee.term || '',
          session: fee.session || '',
          type: fee.type || 'Unknown',
          amount: fee.amount || 0,
          dueDate: fee.date ? (new Date(fee.date)).toISOString().split('T')[0] : '',
          studentCount: 0
        };
      });
    });

    res.json({
      success: true,
      class: classId,
      totalFeeTypes: Object.keys(feeMap).length,
      fees: Object.values(feeMap)
    });
  } catch (err) {
    console.error('Error in /fees/class/:classId/me:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/* ============================================
   ADMIN ENDPOINTS - SPECIFIC ROUTES FIRST
   (Prevent route shadowing by :param)
   ============================================ */

/**
 * GET /api/fees/meta/classes
 * Get all classes for filter dropdown
 * Auth: Admin
 */
router.get('/meta/classes', authMiddleware, adminAuth, async (req, res) => {
  try {
    const classes = await Student.distinct('class');

    res.json({
      success: true,
      classes: classes.filter(c => c).sort(),
      count: classes.length
    });
  } catch (err) {
    console.error('Error in /fees/meta/classes:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/**
 * GET /api/fees/search/student
 * Search students by name or ID
 * Query: ?query=name&limit=20
 * Auth: Admin
 */
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
      .select('student_id firstname surname class fees')
      .limit(parseInt(limit));

    const enrichedResults = students.map(s => {
      let totalFees = 0;
      let paidFees = 0;
      (s.fees || []).forEach(fee => {
        totalFees += fee.amount || 0;
        if (String(fee.status).toLowerCase() === 'paid' || String(fee.status).toLowerCase() === 'waived') {
          paidFees += fee.amount || 0;
        }
      });

      return {
        id: s.student_id,
        name: `${s.firstname} ${s.surname}`,
        class: s.class,
        totalFees,
        paidFees,
        outstandingFees: totalFees - paidFees
      };
    });

    res.json({
      success: true,
      results: enrichedResults,
      count: enrichedResults.length
    });
  } catch (err) {
    console.error('Error in /fees/search/student:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/**
 * GET /api/fees/stats/all
 * Get comprehensive fees statistics
 * Query: ?classId=&term=&session=
 * Auth: Admin
 */
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
      feesByType: {},
      topOutstanding: [],
      paymentCollection: 0
    };

    students.forEach(student => {
      (student.fees || []).forEach(fee => {
        if (term && fee.term !== term) return;
        if (session && fee.session !== session) return;

        stats.totalFees += fee.amount || 0;

        const status = String(fee.status).toLowerCase();
        if (status === 'paid') {
          stats.paidFees += fee.amount || 0;
          stats.feesByStatus.paid++;
        } else if (status === 'waived') {
          stats.waivedFees += fee.amount || 0;
          stats.feesByStatus.waived++;
        } else if (status === 'partial') {
          stats.partialFees += fee.amount || 0;
          stats.feesByStatus.partial++;
          stats.paidFees += fee.paidAmount || 0;
        } else {
          stats.outstandingFees += fee.amount || 0;
          stats.feesByStatus.unpaid++;
        }

        // Track by fee type
        const feeType = fee.type || 'Unknown';
        if (!stats.feesByType[feeType]) {
          stats.feesByType[feeType] = { total: 0, paid: 0, outstanding: 0, count: 0 };
        }
        stats.feesByType[feeType].total += fee.amount || 0;
        stats.feesByType[feeType].count++;
        if (status === 'paid' || status === 'waived') {
          stats.feesByType[feeType].paid += fee.amount || 0;
        } else {
          stats.feesByType[feeType].outstanding += fee.amount || 0;
        }
      });
    });

    stats.paymentCollection = stats.totalFees > 0 
      ? Math.round((stats.paidFees / stats.totalFees) * 100) 
      : 0;

    res.json({
      success: true,
      statistics: stats,
      timestamp: new Date()
    });
  } catch (err) {
    console.error('Error in /fees/stats/all:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/**
 * POST /api/fees/export
 * Export fees data as CSV
 * Body: { classId, term, session, status }
 * Auth: Admin
 */
router.post('/export', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { classId, term, session, status } = req.body;

    let query = {};
    if (classId) query.class = classId;

    const students = await Student.find(query)
      .select('student_id firstname surname class fees');

    let csvData = 'Student ID,Student Name,Class,Fee Type,Amount,Status,Term,Session,Due Date,Payment Method,Reference,Paid Amount\n';

    students.forEach(student => {
      (student.fees || []).forEach(fee => {
        if (term && fee.term !== term) return;
        if (session && fee.session !== session) return;
        if (status && fee.status !== status) return;

        const dueDate = fee.date ? new Date(fee.date).toLocaleDateString() : '';
        const escapedMethod = (fee.method || '').replace(/"/g, '""');
        const escapedRef = (fee.paymentRef || '').replace(/"/g, '""');
        
        csvData += `"${student.student_id}","${student.firstname} ${student.surname}","${student.class}","${fee.type || 'Unknown'}",${fee.amount || 0},"${fee.status || 'Unpaid'}","${fee.term || ''}","${fee.session || ''}","${dueDate}","${escapedMethod}","${escapedRef}",${fee.paidAmount || 0}\n`;
      });
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="fees_export_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvData);
  } catch (err) {
    console.error('Error in /fees/export:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/* ============================================
   ADMIN ENDPOINTS - CLASS SETUP
   ============================================ */

/**
 * POST /api/fees/class-setup
 * Setup/create fees for a class
 * Used by the admin fees page for bulk fee assignment
 * Body: { classId, term, session, feeType (or type), amount, dueDate }
 * Auth: Admin
 */
router.post('/class-setup', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { classId, term, session, feeType, type, amount, dueDate } = req.body;

    // Accept both 'feeType' and 'type' field names
    const finalFeeType = feeType || type;

    // Validation
    if (!classId || !term || !session || !finalFeeType || !amount || !dueDate) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: classId, term, session, feeType (or type), amount, dueDate',
        received: {
          classId: classId ? '✓' : '✗',
          term: term ? '✓' : '✗',
          session: session ? '✓' : '✗',
          feeType: finalFeeType ? '✓' : '✗',
          amount: amount ? '✓' : '✗',
          dueDate: dueDate ? '✓' : '✗'
        }
      });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Amount must be a positive number' 
      });
    }

    // Validate date
    const dueDateTime = new Date(dueDate);
    if (isNaN(dueDateTime.getTime())) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid due date format. Use YYYY-MM-DD format' 
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
      type: finalFeeType,
      amount: parsedAmount,
      status: 'Unpaid',
      date: dueDateTime,
      method: '',
      paymentRef: '',
      paidAmount: 0,
      paidDate: null
    };

    let successCount = 0;
    let failureCount = 0;
    const failedStudents = [];

    // Assign fee to all students in class
    for (const student of students) {
      try {
        // Check if fee already exists
        const feeExists = student.fees.some(f => 
          f.term === term && 
          f.session === session && 
          f.type === finalFeeType &&
          f.amount === parsedAmount
        );

        if (!feeExists) {
          student.fees.push(newFee);
          await student.save();
          successCount++;
        }
      } catch (error) {
        failureCount++;
        failedStudents.push({
          studentId: student.student_id,
          error: error.message
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `Fee assigned to ${successCount} students`,
      studentsAssigned: successCount,
      totalStudents: students.length,
      skipped: students.length - successCount,
      failedStudents: failedStudents.length > 0 ? failedStudents : undefined,
      fee: {
        type: finalFeeType,
        amount: parsedAmount,
        term,
        session,
        dueDate: dueDateTime.toISOString().split('T')[0]
      }
    });

  } catch (err) {
    console.error('Error in POST /class-setup:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/* ============================================
   ADMIN ENDPOINTS - GENERIC ROUTES
   ============================================ */

/**
 * GET /api/fees
 * Get all fees with filters
 * Query: ?status=&classId=&term=&session=&search=&limit=50&skip=0
 * Auth: Admin
 */
router.get('/', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { status, classId, term, session, search, limit = 50, skip = 0 } = req.query;
    
    let query = {};
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
          type: fee.type || 'Unknown',
          amount: fee.amount || 0,
          status: fee.status || 'Unpaid',
          term: fee.term || '',
          session: fee.session || '',
          dueDate: fee.date ? (new Date(fee.date)).toISOString().split('T')[0] : '',
          paymentMethod: fee.method || '',
          paymentRef: fee.paymentRef || '',
          paidAmount: fee.paidAmount || 0,
          daysOverdue: fee.date ? Math.floor((new Date() - new Date(fee.date)) / (1000 * 60 * 60 * 24)) : 0
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
      limit: parseInt(limit),
      skip: parseInt(skip),
      fees: allFees
    });
  } catch (err) {
    console.error('Error in GET /fees:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/**
 * POST /api/fees
 * Create/assign fees to a class
 * Body: { classId, term, session, feeType (or type), amount, dueDate }
 * Auth: Admin
 */
router.post('/', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { classId, term, session, feeType, type, amount, dueDate } = req.body;

    // Accept both 'feeType' and 'type' field names
    const finalFeeType = feeType || type;

    // Validation
    if (!classId || !term || !session || !finalFeeType || !amount || !dueDate) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: classId, term, session, feeType (or type), amount, dueDate',
        received: {
          classId: classId ? '✓' : '✗',
          term: term ? '✓' : '✗',
          session: session ? '✓' : '✗',
          feeType: finalFeeType ? '✓' : '✗',
          amount: amount ? '✓' : '✗',
          dueDate: dueDate ? '✓' : '✗'
        }
      });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Amount must be a positive number' 
      });
    }

    // Validate date
    const dueDateTime = new Date(dueDate);
    if (isNaN(dueDateTime.getTime())) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid due date format. Use YYYY-MM-DD format' 
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
      type: finalFeeType,
      amount: parsedAmount,
      status: 'Unpaid',
      date: dueDateTime,
      method: '',
      paymentRef: '',
      paidAmount: 0,
      paidDate: null
    };

    let successCount = 0;
    let failureCount = 0;
    const failedStudents = [];

    // Assign fee to all students in class
    for (const student of students) {
      try {
        // Check if fee already exists
        const feeExists = student.fees.some(f => 
          f.term === term && 
          f.session === session && 
          f.type === finalFeeType &&
          f.amount === parsedAmount
        );

        if (!feeExists) {
          student.fees.push(newFee);
          await student.save();
          successCount++;
        }
      } catch (error) {
        failureCount++;
        failedStudents.push({
          studentId: student.student_id,
          error: error.message
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `Fee assigned to ${successCount} students`,
      studentsAssigned: successCount,
      studentsSkipped: students.length - successCount,
      failedStudents: failedStudents.length > 0 ? failedStudents : undefined
    });
  } catch (err) {
    console.error('Error in POST /fees:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/**
 * GET /api/fees/student/:studentId
 * Get specific student's fees
 * Auth: Admin
 */
router.get('/student/:studentId', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { studentId } = req.params;

    if (!studentId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Student ID is required' 
      });
    }

    const student = await Student.findOne({ student_id: studentId })
      .select('student_id firstname surname class fees email');

    if (!student) {
      return res.status(404).json({ 
        success: false, 
        error: 'Student not found' 
      });
    }

    let paid = 0, due = 0, total = 0, waived = 0;
    const feeDetails = [];

    (student.fees || []).forEach(fee => {
      total += fee.amount || 0;
      const status = String(fee.status).toLowerCase();

      if (status === 'paid') {
        paid += fee.amount || 0;
      } else if (status === 'waived') {
        waived += fee.amount || 0;
      } else if (status === 'partial') {
        paid += fee.paidAmount || 0;
        due += (fee.amount - (fee.paidAmount || 0));
      } else {
        due += fee.amount || 0;
      }

      feeDetails.push({
        _id: fee._id,
        type: fee.type || 'Unknown',
        amount: fee.amount || 0,
        status: fee.status || 'Unpaid',
        term: fee.term || '',
        session: fee.session || '',
        dueDate: fee.date ? (new Date(fee.date)).toISOString().split('T')[0] : '',
        paymentMethod: fee.method || '',
        paymentRef: fee.paymentRef || '',
        paidAmount: fee.paidAmount || 0,
        paidDate: fee.paidDate || null,
        waiveReason: fee.waiveReason || ''
      });
    });

    res.json({
      success: true,
      student: {
        id: student.student_id,
        name: `${student.firstname} ${student.surname}`,
        class: student.class,
        email: student.email || ''
      },
      summary: {
        total,
        paid,
        due,
        waived,
        percentagePaid: total > 0 ? Math.round((paid / total) * 100) : 0,
        percentagePending: total > 0 ? Math.round((due / total) * 100) : 0
      },
      fees: feeDetails
    });
  } catch (err) {
    console.error('Error in GET /student/:studentId:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/**
 * PUT /api/fees/student/:studentId/fee/:feeId
 * Update specific student's fee status
 * Body: { status, paymentMethod, paymentRef, paidAmount, waiveReason }
 * Auth: Admin
 */
router.put('/student/:studentId/fee/:feeId', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { studentId, feeId } = req.params;
    const { status, paymentMethod, paymentRef, paidAmount, waiveReason } = req.body;

    if (!studentId || !feeId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Student ID and Fee ID are required' 
      });
    }

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

    // Validate status
    const validStatuses = ['Paid', 'Unpaid', 'Partial', 'Waived'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: `Status must be one of: ${validStatuses.join(', ')}` 
      });
    }

    // Update fee details
    fee.status = status || fee.status;
    fee.method = paymentMethod || fee.method;
    fee.paymentRef = paymentRef || fee.paymentRef;
    
    if (status === 'Paid') {
      fee.paidAmount = fee.amount;
      fee.paidDate = new Date();
    } else if (status === 'Partial') {
      if (!paidAmount) {
        return res.status(400).json({ 
          success: false, 
          error: 'paidAmount is required for Partial status' 
        });
      }
      const parsedAmount = parseFloat(paidAmount);
      if (isNaN(parsedAmount) || parsedAmount < 0 || parsedAmount > fee.amount) {
        return res.status(400).json({ 
          success: false, 
          error: `paidAmount must be between 0 and ${fee.amount}` 
        });
      }
      fee.paidAmount = parsedAmount;
      fee.paidDate = new Date();
    } else if (status === 'Waived') {
      fee.paidAmount = fee.amount;
      fee.waiveReason = waiveReason || 'No reason provided';
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
        paymentRef: fee.paymentRef,
        paidDate: fee.paidDate
      }
    });
  } catch (err) {
    console.error('Error in PUT /student/:studentId/fee/:feeId:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/**
 * DELETE /api/fees/student/:studentId/fee/:feeId
 * Remove fee from student
 * Auth: Admin
 */
router.delete('/student/:studentId/fee/:feeId', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { studentId, feeId } = req.params;

    if (!studentId || !feeId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Student ID and Fee ID are required' 
      });
    }

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

    student.fees.id(feeId).remove();
    await student.save();

    res.json({
      success: true,
      message: 'Fee removed successfully',
      removedFee: {
        _id: fee._id,
        type: fee.type,
        amount: fee.amount
      }
    });
  } catch (err) {
    console.error('Error in DELETE /student/:studentId/fee/:feeId:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

module.exports = router;
