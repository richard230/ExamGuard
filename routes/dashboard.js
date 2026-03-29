const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const {
  Employee,
  Payment,
  CashRequest,
  Admission,
  HostelApplication,
  TransportApplication,
  LibraryRequest,
  InventoryRequest,
  LeaveApplication
} = require('../models/Entities');

router.get('/dashboard/summary', async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      students,
      employees,
      payments,
      cashRequests,
      expiringSubscriptions,
      ongoingAdmissions,
      totalAdmissions,
      hostelApplications,
      transportApplications,
      libraryRequests,
      inventoryRequests,
      leaveApplications
    ] = await Promise.all([
      Student.find().lean(),
      Employee.countDocuments().catch(() => 0),
      Payment.find().lean().catch(() => []),
      CashRequest.countDocuments().catch(() => 0),
      Student.countDocuments({ subscriptionStatus: 'Expired' }).catch(() => 0),
      Admission.countDocuments({ status: 'ongoing' }).catch(() => 0),
      Admission.countDocuments().catch(() => 0),
      HostelApplication.countDocuments({ status: 'pending' }).catch(() => 0),
      TransportApplication.countDocuments({ status: 'pending' }).catch(() => 0),
      LibraryRequest.countDocuments({ status: 'pending' }).catch(() => 0),
      InventoryRequest.countDocuments({ status: 'pending' }).catch(() => 0),
      LeaveApplication.countDocuments({ status: 'pending' }).catch(() => 0)
    ]);

    const activeStudents = students.filter(s => s.accountStatus === 'Active').length;
    const totalStudents = students.length;

    let todayPayments = { count: 0, amount: 0 };
    let monthPayments = { count: 0, amount: 0 };

    payments.forEach(p => {
      const payDate = new Date(p.date);
      if (payDate >= startOfToday) {
        todayPayments.count++;
        todayPayments.amount += p.amount || 0;
      }
      if (payDate >= startOfMonth) {
        monthPayments.count++;
        monthPayments.amount += p.amount || 0;
      }
    });

    const months = [];
    const incomes = Array(24).fill(0);
    const expenditures = Array(24).fill(0);

    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 23 + i, 1);
      months.push(d.toLocaleString('default', { month: 'short', year: 'numeric' }));
    }

    payments.forEach(p => {
      const payDate = new Date(p.date);
      const idx = (payDate.getFullYear() - now.getFullYear()) * 12 + payDate.getMonth() - now.getMonth() + 23;
      if (idx >= 0 && idx < 24) {
        incomes[idx] += p.amount || 0;
      }
    });

    res.json({
      todayPayments,
      monthPayments,
      cashRequests,
      expiringSubscriptions,
      employees,
      activeStudents,
      totalStudents,
      ongoingAdmissions,
      totalAdmissions,
      hostelApplications,
      transportApplications,
      libraryRequests,
      inventoryRequests,
      leaveApplications,
      parents: 0, // Placeholder since Parent model doesn't exist
      session: "2024–2025",
      financeSummary: {
        labels: months,
        incomes,
        expenditures,
      }
    });

  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

module.exports = router;
