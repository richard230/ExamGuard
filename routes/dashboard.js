const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const School = require('../models/School');
const { authMiddleware } = require('./auth');
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
  const roles = [user.role, user.userType, user.accountType, user.type]
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
      const error = new Error('You are not authorized to access this school dashboard.');
      error.statusCode = 403;
      throw error;
    }
  }

  return school;
}

function schoolFilter(schoolId, extra = {}) {
  return { ...extra, schoolId };
}

router.get('/dashboard/summary', authMiddleware, async (req, res) => {
  try {
    const school = await resolveCurrentSchool(req);

    if (!school) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No active school is associated with this account.'
      });
    }

    const schoolId = String(school.schoolId || school._id);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      students,
      employees,
      parents,
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
      Student.find(schoolFilter(schoolId)).lean(),
      Employee.countDocuments(schoolFilter(schoolId)).catch(() => 0),
      Parent.countDocuments(schoolFilter(schoolId)).catch(() => 0),
      Payment.find(schoolFilter(schoolId)).lean().catch(() => []),
      CashRequest.countDocuments(schoolFilter(schoolId)).catch(() => 0),
      Student.countDocuments(schoolFilter(schoolId, { subscriptionStatus: 'Expired' })).catch(() => 0),
      Admission.countDocuments(schoolFilter(schoolId, { status: 'ongoing' })).catch(() => 0),
      Admission.countDocuments(schoolFilter(schoolId)).catch(() => 0),
      HostelApplication.countDocuments(schoolFilter(schoolId, { status: 'pending' })).catch(() => 0),
      TransportApplication.countDocuments(schoolFilter(schoolId, { status: 'pending' })).catch(() => 0),
      LibraryRequest.countDocuments(schoolFilter(schoolId, { status: 'pending' })).catch(() => 0),
      InventoryRequest.countDocuments(schoolFilter(schoolId, { status: 'pending' })).catch(() => 0),
      LeaveApplication.countDocuments(schoolFilter(schoolId, { status: 'pending' })).catch(() => 0)
    ]);

    const activeStudents = students.filter(s => s.accountStatus === 'Active').length;
    const totalStudents = students.length;

    let todayPayments = { count: 0, amount: 0 };
    let monthPayments = { count: 0, amount: 0 };

    payments.forEach(p => {
      const payDate = new Date(p.date);
      if (Number.isNaN(payDate.getTime())) return;

      if (payDate >= startOfToday) {
        todayPayments.count++;
        todayPayments.amount += Number(p.amount) || 0;
      }

      if (payDate >= startOfMonth) {
        monthPayments.count++;
        monthPayments.amount += Number(p.amount) || 0;
      }
    });

    const months = [];
    const incomes = Array(24).fill(0);
    const expenditures = Array(24).fill(0);

    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 23 + i, 1);
      months.push(d.toLocaleString('default', {
        month: 'short',
        year: 'numeric'
      }));
    }

    payments.forEach(p => {
      const payDate = new Date(p.date);
      if (Number.isNaN(payDate.getTime())) return;

      const idx =
        (payDate.getFullYear() - now.getFullYear()) * 12 +
        payDate.getMonth() - now.getMonth() +
        23;

      if (idx >= 0 && idx < 24) {
        incomes[idx] += Number(p.amount) || 0;
      }
    });

    return res.json({
      success: true,
      school: {
        _id: school._id,
        id: school._id,
        schoolId: school.schoolId || '',
        schoolName: school.schoolName || '',
        name: school.schoolName || '',
        abbreviation: school.abbreviation || '',
        motto: school.motto || '',
        tagline: school.tagline || '',
        subdomain: school.subdomain || '',
        customDomain: school.customDomain || '',
        logoUrl: school.logoUrl || school.branding?.logo || '',
        branding: school.branding || {}
      },
      todayPayments,
      monthPayments,
      cashRequests,
      expiringSubscriptions,
      employees,
      parents,
      activeStudents,
      totalStudents,
      ongoingAdmissions,
      totalAdmissions,
      hostelApplications,
      transportApplications,
      libraryRequests,
      inventoryRequests,
      leaveApplications,
      session: school.currentSession || school.settings?.currentSession || '2024–2025',
      financeSummary: {
        labels: months,
        incomes,
        expenditures
      }
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);

    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.statusCode === 403
        ? error.message
        : 'Server error',
      details: error.statusCode ? undefined : error.message
    });
  }
});

module.exports = router;
