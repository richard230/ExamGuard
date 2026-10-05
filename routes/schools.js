const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const School = require('../models/School');
const DemoRequest = require('../models/DemoRequest');
const SchoolEnquiry = require('../models/SchoolEnquiry');
const { authMiddleware } = require('./auth');
const adminAuth = require('../middleware/adminAuth');
const crypto = require('crypto');
const postmark = require('postmark');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const ensureSuperAdmin = require("../utils/ensureSuperAdmin");

// Homepage carousel/editor image uploads use the existing Supabase editor bucket.
const HOMEPAGE_EDITOR_BUCKET =
  process.env.SUPABASE_EDITOR_BUCKET || 'editor';

const homepageUploadStorage = multer.memoryStorage();

const homepageImageUpload = multer({
  storage: homepageUploadStorage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif|avif)$/i.test(file.mimetype || '')) {
      return cb(new Error('Only JPEG, PNG, WebP, GIF, and AVIF images are allowed.'));
    }
    cb(null, true);
  }
});

let homepageSupabase = null;

function getHomepageSupabase() {
  if (homepageSupabase) return homepageSupabase;

  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase upload configuration is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  homepageSupabase = createClient(url, key, {
    auth: { persistSession: false }
  });

  return homepageSupabase;
}

function safeHomepageImageName(filename = 'image') {
  const original = String(filename || 'image');
  const extMatch = original.match(/\.[a-z0-9]{2,5}$/i);
  const ext = extMatch ? extMatch[0].toLowerCase() : '.jpg';
  const base = original
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'image';

  return `${base}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
}

/* ============================================================
 * TENANT / ADMIN SECURITY MODEL
 * ------------------------------------------------------------
 * - Every school has its own school-scoped `superadmin`.
 * - `superadmin` is NOT a global/platform role.
 * - Only explicit system/platform roles may cross school boundaries.
 * - All school-scoped admin reads/writes resolve and verify the target
 *   school against req.user.schoolId (or an equivalent school identifier).
 * ============================================================ */

// ===== VALIDATION MIDDLEWARE =====
const validateSchool = (req, res, next) => {
  const { schoolName, email, phone, adminName, adminEmail, adminPhone, country } = req.body;

  if (!schoolName || !email || !phone || !adminName || !adminEmail || !adminPhone || !country) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: schoolName, email, phone, adminName, adminEmail, adminPhone, country'
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'Invalid email format' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    return res.status(400).json({ success: false, error: 'Invalid admin email format' });
  }

  next();
};
function createSubdomainSlug(schoolName) {
  return schoolName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}

async function generateUniqueSubdomain(schoolName) {
  const baseSlug = createSubdomainSlug(schoolName);

  let subdomain = baseSlug;
  let counter = 2;

  while (await School.exists({ subdomain })) {
    subdomain = `${baseSlug}-${counter}`;
    counter++;
  }

  return subdomain;
}
// ===== PUBLIC ENDPOINTS =====

/**
 * GET /api/schools
 * Get all active schools (public - limited info)
 */
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const schools = await School.find({ status: 'active' })
      .select('schoolId schoolName abbreviation city state country email phone status')
      .limit(limit)
      .skip(skip)
      .sort({ createdAt: -1 });

    const total = await School.countDocuments({ status: 'active' });

    res.json({
      success: true,
      data: schools,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching schools:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching schools',
      error: error.message
    });
  }
});

/**
 * GET /api/schools/by-id/:schoolId
 * Get school by schoolId
 */
router.post("/register", async (req, res) => {
  try {
    const {
      schoolName,
      schoolType,
      studentCount,
      staffCount,
      foundedYear,
      regNumber,
      motto,
      country,
      state,
      city,
      address,
      postalCode,
      email,
      phone,
      secondaryEmail,
      altPhone,
      website,
      principal,
      principalEmail,
      adminName,
      adminEmail,
      adminPhone,
      description,
      programs = [],
      logoUrl
    } = req.body;

    // ===== VALIDATION =====
    const requiredFields = [
      "schoolName",
      "schoolType",
      "studentCount",
      "country",
      "email",
      "phone",
      "adminName",
      "adminEmail",
      "adminPhone"
    ];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(", ")}`
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: "Invalid email format" });
    }

    if (!emailRegex.test(adminEmail)) {
      return res.status(400).json({ success: false, error: "Invalid admin email format" });
    }

    if (principalEmail && !emailRegex.test(principalEmail)) {
      return res.status(400).json({ success: false, error: "Invalid principal email format" });
    }

    // Check if email already exists
    const existingEmail = await School.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        error: "Email already registered. Please use a different email or contact support."
      });
    }

    // Check if admin email already exists
    const existingAdminEmail = await School.findOne({ adminEmail: adminEmail.toLowerCase() });
    if (existingAdminEmail) {
      return res.status(409).json({
        success: false,
        error: "This admin email is already associated with another school."
      });
    }

    const subdomain = await generateUniqueSubdomain(schoolName);

    // ===== GENERATE INITIAL SUPERADMIN PASSWORD =====
    const initialSuperAdminPassword = crypto.randomBytes(9).toString("base64url");

    // ===== CREATE SCHOOL =====
    const newSchool = new School({
      schoolName: schoolName.trim(),
      schoolType: schoolType || "secondary",
      studentCount: parseInt(studentCount) || 0,
      staffCount: parseInt(staffCount) || 0,
      subdomain,
      foundedYear: foundedYear ? parseInt(foundedYear) : null,
      regNumber: regNumber?.trim() || "",
      motto: motto?.trim() || "",
      country: country.trim(),
      state: state?.trim() || "",
      city: city?.trim() || "",
      address: address?.trim() || "",
      postalCode: postalCode?.trim() || "",
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      secondaryEmail: secondaryEmail?.toLowerCase().trim() || "",
      altPhone: altPhone?.trim() || "",
      website: website?.trim() || "",
      principal: principal?.trim() || "",
      principalEmail: principalEmail?.toLowerCase().trim() || "",
      adminName: adminName.trim(),
      adminEmail: adminEmail.toLowerCase().trim(),
      adminPhone: adminPhone.trim(),
      description: description?.trim() || "",
      programs: programs && Array.isArray(programs) ? programs : [],
      logoUrl: logoUrl || "",
      // Initial subscription status
      subscriptionPlan: "starter",
      subscriptionStatus: "trial",
      status: "active" // Pending admin approval
    });

    // Auto-generate schoolId
    newSchool.generateSchoolId();

    // Save to database
    await newSchool.save();

    // ===== CREATE SCHOOL SUPERADMIN =====
    await ensureSuperAdmin({
      schoolKey: newSchool.schoolId,
      email: adminEmail,
      password: initialSuperAdminPassword,
      name: adminName
    });

    // ===== SEND CONFIRMATION EMAILS =====
    try {
      // Email template to school admin
      const adminEmailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>School Registration Confirmation</title>
  <style>
    body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; background: #f5f7fa; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; box-shadow: 0 6px 32px rgba(6,23,40,0.12); }
    .header { background: linear-gradient(135deg, #061728, #0f2847); color: #fff; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; font-weight: 800; }
    .content { padding: 30px; }
    .details { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffb400; }
    .details p { margin: 10px 0; font-size: 14px; line-height: 1.6; }
    .label { font-weight: 700; color: #061728; display: inline-block; width: 140px; }
    .value { color: #4b5563; }
    .section-title { font-weight: 700; color: #061728; margin: 20px 0 10px 0; font-size: 14px; }
    .list { margin-left: 20px; }
    .list li { margin: 8px 0; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #e5e7eb; border-radius: 0 0 10px 10px; }
    .support-link { color: #061728; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Registration Received!</h1>
    </div>
    <div class="content">
      <p>Dear ${adminName},</p>
      <p>Thank you for registering <strong>${schoolName}</strong> with ExamGuard! We've received your registration and are processing it.</p>
      
      <div class="details">
        <p><span class="label">School ID:</span> <span class="value"><strong>${newSchool.schoolId}</strong></span></p>
        <p><span class="label">School Name:</span> <span class="value">${schoolName}</span></p>
        <p><span class="label">Portal:</span> <span class="value"><a href="https://${newSchool.subdomain}.goldlincschools.com.ng">${newSchool.subdomain}.goldlincschools.com.ng</a></span></p>
        <p><span class="label">Email:</span> <span class="value"><strong>${adminEmail}</strong></span></p>
        <p><span class="label">Temporary Password:</span> <span class="value"><strong>${initialSuperAdminPassword}</strong></span></p>
        <p><span class="label">Location:</span> <span class="value">${city}, ${state}, ${country}</span></p>
        <p><span class="label">Students:</span> <span class="value">${studentCount}</span></p>
        <p><span class="label">Plan:</span> <span class="value">STARTER (Trial)</span></p>
      </div>

      <p><strong>Important:</strong> Please change this temporary password immediately after your first login.</p>

      <p class="section-title">What Happens Next?</p>
      <ul class="list">
        <li>Our team will verify your school information within 24-48 hours</li>
        <li>Once approved, you will be able to log in using your credentials above</li>
        <li>Access all starter features to begin managing your school</li>
        <li>Optional: Upgrade to Professional or Enterprise plan for advanced features</li>
      </ul>

      <p>If you have any questions before activation, feel free to reach out to our support team at <a href="mailto:support@examguard.com.ng" class="support-link">support@examguard.com.ng</a></p>
      
      <p><strong>Best regards,</strong><br>The ExamGuard Team</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ExamGuard. All rights reserved.</p>
      <p>For support, contact: <a href="mailto:support@examguard.com.ng" class="support-link">support@examguard.com.ng</a></p>
    </div>
  </div>
</body>
</html>
      `;

      // Email to internal admin team
      const internalEmailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>New School Registration - Action Required</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 700px; margin: 20px auto; padding: 20px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; border: 1px solid #ddd; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #061728; color: #fff; font-weight: 700; }
    tr:nth-child(even) { background: #f9fafb; }
    .action-box { background: #fffbf0; border: 2px solid #ffb400; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .action-box strong { color: #061728; }
  </style>
</head>
<body>
  <div class="container">
    <h2>📌 New School Registration - Pending Approval</h2>
    <p>A new school has registered and requires admin approval:</p>
    
    <table>
      <tr>
        <th colspan="2">School Information</th>
      </tr>
      <tr>
        <td><strong>School ID</strong></td>
        <td><strong style="color: #061728;">${newSchool.schoolId}</strong></td>
      </tr>
      <tr>
        <td><strong>School Name</strong></td>
        <td>${schoolName}</td>
      </tr>
      <tr>
        <td><strong>Type</strong></td>
        <td>${schoolType}</td>
      </tr>
      <tr>
        <td><strong>Students</strong></td>
        <td>${studentCount}</td>
      </tr>
      <tr>
        <td><strong>Location</strong></td>
        <td>${city}, ${state}, ${country}</td>
      </tr>
      <tr>
        <th colspan="2">Contact Information</th>
      </tr>
      <tr>
        <td><strong>Email</strong></td>
        <td><a href="mailto:${email}">${email}</a></td>
      </tr>
      <tr>
        <td><strong>Phone</strong></td>
        <td>${phone}</td>
      </tr>
      <tr>
        <th colspan="2">Admin Contact</th>
      </tr>
      <tr>
        <td><strong>Admin Name</strong></td>
        <td>${adminName}</td>
      </tr>
      <tr>
        <td><strong>Admin Email</strong></td>
        <td><a href="mailto:${adminEmail}">${adminEmail}</a></td>
      </tr>
      <tr>
        <td><strong>Admin Phone</strong></td>
        <td>${adminPhone}</td>
      </tr>
      <tr>
        <td><strong>Registered</strong></td>
        <td>${new Date().toLocaleString()}</td>
      </tr>
    </table>

    <div class="action-box">
      <strong>⚠️ Action Required:</strong> Review and approve this registration in the admin dashboard.
    </div>
  </div>
</body>
</html>
      `;

      // Send email to school admin
      await client.sendEmail({
        From: "richardochuko@examguard.com.ng",
        To: adminEmail,
        Subject: `Welcome to ExamGuard - Registration Confirmation [${newSchool.schoolId}]`,
        HtmlBody: adminEmailHtml
      });

      // Send notification to internal team
      await client.sendEmail({
        From: "richardochuko@examguard.com.ng",
        To: process.env.ADMIN_EMAIL || "richardochuko14@gmail.com",
        Subject: `[NEW] School Registration: ${schoolName} [${newSchool.schoolId}]`,
        HtmlBody: internalEmailHtml
      });

      console.log(`✅ Confirmation emails sent for school: ${newSchool.schoolId}`);
    } catch (emailErr) {
      console.error("⚠️ Email sending error:", emailErr.message);
      // Don't fail the registration if emails fail
    }

    // ===== SUCCESS RESPONSE =====
    res.status(201).json({
  success: true,
  message: "School registered successfully! Check your email for confirmation details.",
  data: {
    ...newSchool.toJSON(),
    schoolUrl: `https://${newSchool.subdomain}.goldlincschools.com.ng`,
    adminEmail: adminEmail.toLowerCase().trim(),
    temporaryPassword: initialSuperAdminPassword
  }
});


  } catch (err) {
    console.error("❌ School registration error:", err);

    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(409).json({
        success: false,
        error: `${field} already exists. Please use a different value.`
      });
    }

    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        error: "Validation error: " + messages.join(", ")
      });
    }

    res.status(500).json({
      success: false,
      message: "Error registering school",
      error: err.message
    });
  }
});


router.get('/by-id/:schoolId', async (req, res) => {
  try {
    const school = await School.findOne({
      schoolId: req.params.schoolId,
      status: 'active'
    }).select('schoolId schoolName abbreviation email phone location principal');

    if (!school) {
      return res.status(404).json({
        success: false,
        error: 'School not found'
      });
    }

    res.json({
      success: true,
      data: school
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching school',
      error: error.message
    });
  }
});

/**
 * GET /api/schools/search/:query
 * Search schools
 */
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    const schools = await School.find({
      $or: [
        { schoolName: { $regex: query, $options: 'i' } },
        { schoolId: { $regex: query, $options: 'i' } },
        { city: { $regex: query, $options: 'i' } }
      ],
      status: 'active'
    })
      .select('schoolId schoolName abbreviation location city state')
      .limit(10);

    res.json({
      success: true,
      data: schools,
      count: schools.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error searching schools',
      error: error.message
    });
  }
});

router.get('/config', async (req, res) => {
  try {
    const { schoolId, domain, subdomain } = req.query;

    if (!schoolId && !domain && !subdomain) {
      return res.status(400).json({
        success: false,
        error: 'A schoolId, domain, or subdomain query parameter is required.'
      });
    }

    const query = {
      status: 'active',
      isDeleted: { $ne: true }
    };

    if (schoolId) {
      query.schoolId = schoolId.trim();
    } else if (subdomain) {
      query.subdomain = subdomain.trim().toLowerCase();
    } else if (domain) {
      const cleanDomain = domain.trim().toLowerCase();
      query.$or = [
        { customDomain: cleanDomain },
        { subdomain: cleanDomain }
      ];
    }

    const school = await School.findOne(query)
      .select(`
    _id
    schoolId
    schoolName
    abbreviation
    motto
    tagline
    schoolType
    ownershipType
    establishedYear
    registrationNumber
    logoUrl
    subdomain
    customDomain
    country
    state
    city
    address
    postalCode
    coordinates
    email
    phone
    altPhone
    website
    description
    principal
    branding
    academicConfig
    localization
    authSettings
    portalAccess
    featuresEnabled
    paymentConfig
    communication
    pwaSettings
    settings
    homepage
    homepageSettings
`)
      .lean();

    if (!school) {
      return res.status(404).json({
        success: false,
        error: 'School configuration not found or account is currently inactive.'
      });
    }

    let bankDetails = school.paymentConfig?.bankTransferDetails || [];
    if (bankDetails.length === 0 && (school.paymentConfig?.bankName || school.paymentConfig?.accountNumber)) {
      bankDetails = [{
        bankName: school.paymentConfig.bankName || '',
        accountName: school.paymentConfig.accountName || '',
        accountNumber: school.paymentConfig.accountNumber || '',
        sortCode: school.paymentConfig.sortCode || ''
      }];
    }

    const configSettings = school.homepageSettings || {};
    const publicPayload = buildPublicSchoolPayload(
      school,
      (configSettings.enabled !== false && configSettings.published !== false)
        ? (school.homepage || {})
        : {},
      configSettings
    );

    const config = {
      ...publicPayload,

      academic: {
        currentSession: school.academicConfig?.currentSession || '',
        currentTerm: school.academicConfig?.currentTerm || '',
        dates: {
          termStartDate: school.academicConfig?.termStartDate || null,
          termEndDate: school.academicConfig?.termEndDate || null,
          nextTermBeginDate: school.academicConfig?.nextTermBeginDate || null
        },
        assessmentStructure: {
          caWeight: school.academicConfig?.assessmentStructure?.caWeight ?? 30,
          examWeight: school.academicConfig?.assessmentStructure?.examWeight ?? 70,
          caBreakdown: school.academicConfig?.assessmentStructure?.caBreakdown || [
            { name: 'CA 1', maxScore: 15 },
            { name: 'CA 2', maxScore: 15 }
          ]
        },
        gradingScale: school.academicConfig?.gradingScale || [
          { grade: 'A', minScore: 70, maxScore: 100, remark: 'Excellent' },
          { grade: 'B', minScore: 60, maxScore: 69, remark: 'Very Good' },
          { grade: 'C', minScore: 50, maxScore: 59, remark: 'Good' },
          { grade: 'D', minScore: 45, maxScore: 49, remark: 'Fair' },
          { grade: 'E', minScore: 40, maxScore: 44, remark: 'Pass' },
          { grade: 'F', minScore: 0, maxScore: 39, remark: 'Fail' }
        ],
        attendanceMode: school.academicConfig?.attendanceMode || 'daily',
        reportCardSettings: {
          showPosition: school.academicConfig?.reportCardSettings?.showPosition ?? true,
          showClassAverage: school.academicConfig?.reportCardSettings?.showClassAverage ?? true,
          showPrincipalComment: school.academicConfig?.reportCardSettings?.showPrincipalComment ?? true,
          showTeacherComment: school.academicConfig?.reportCardSettings?.showTeacherComment ?? true,
          showPsychomotorDomain: school.academicConfig?.reportCardSettings?.showPsychomotorDomain ?? true
        }
      },

      localization: {
        timezone: school.localization?.timezone || 'Africa/Lagos',
        currency: {
          code: school.localization?.currency?.code || 'NGN',
          symbol: school.localization?.currency?.symbol || '₦',
          name: school.localization?.currency?.name || 'Nigerian Naira'
        },
        dateFormat: school.localization?.dateFormat || 'DD/MM/YYYY',
        timeFormat: school.localization?.timeFormat || '12h',
        primaryLanguage: school.localization?.primaryLanguage || 'en',
        supportedLanguages: school.localization?.supportedLanguages || ['en']
      },

      authentication: {
        allowStudentRegistration: school.authSettings?.allowStudentRegistration ?? false,
        allowParentRegistration: school.authSettings?.allowParentRegistration ?? false,
        loginMethods: {
          email: school.authSettings?.loginMethods?.email ?? true,
          usernameOrRegNo: school.authSettings?.loginMethods?.usernameOrRegNo ?? true,
          phone: school.authSettings?.loginMethods?.phone ?? false
        },
        passwordPolicy: {
          minLength: school.authSettings?.passwordPolicy?.minLength || 8,
          requireNumbers: school.authSettings?.passwordPolicy?.requireNumbers ?? true,
          requireSymbols: school.authSettings?.passwordPolicy?.requireSymbols ?? false
        },
        sessionTimeoutMinutes: school.authSettings?.sessionTimeoutMinutes || 120,
        mfaRequired: school.authSettings?.mfaRequired ?? false
      },

      portals: {
        studentPortal: school.portalAccess?.studentPortal ?? school.settings?.studentPortalEnabled ?? true,
        parentPortal: school.portalAccess?.parentPortal ?? school.settings?.parentPortalEnabled ?? true,
        teacherPortal: school.portalAccess?.teacherPortal ?? true,
        staffPortal: school.portalAccess?.staffPortal ?? true,
        alumniPortal: school.portalAccess?.alumniPortal ?? false,
        applicantPortal: school.portalAccess?.applicantPortal ?? true
      },

      features: {
        onlineExamsAndCbt: school.featuresEnabled?.onlineExamsAndCbt ?? school.settings?.onlineExamsEnabled ?? true,
        feesAndAccounting: school.featuresEnabled?.feesAndAccounting ?? school.settings?.feesEnabled ?? true,
        onlinePayments: school.featuresEnabled?.onlinePayments ?? true,
        hostelAndBoarding: school.featuresEnabled?.hostelAndBoarding ?? school.settings?.hostelEnabled ?? false,
        transportation: school.featuresEnabled?.transportation ?? school.settings?.transportEnabled ?? false,
        libraryManagement: school.featuresEnabled?.libraryManagement ?? false,
        inventoryAndAssets: school.featuresEnabled?.inventoryAndAssets ?? false,
        payrollAndHr: school.featuresEnabled?.payrollAndHr ?? false,
        messagingAndSms: school.featuresEnabled?.messagingAndSms ?? true,
        medicalAndHealth: school.featuresEnabled?.medicalAndHealth ?? false,
        eventsAndCalendar: school.featuresEnabled?.eventsAndCalendar ?? true,
        assignmentsAndLms: school.featuresEnabled?.assignmentsAndLms ?? true,
        alumniManagement: school.featuresEnabled?.alumniManagement ?? false,
        idCardGenerator: school.featuresEnabled?.idCardGenerator ?? true,
        resultProcessing: school.featuresEnabled?.resultProcessing ?? true
      },

      payments: {
        allowPartialPayments: school.paymentConfig?.allowPartialPayments ?? true,
        allowInstallments: school.paymentConfig?.allowInstallments ?? false,
        enabledGateways: school.paymentConfig?.enabledGateways || ['paystack'],
        publicKeys: {
          paystackPublicKey: school.paymentConfig?.publicKeys?.paystackPublicKey || '',
          flutterwavePublicKey: school.paymentConfig?.publicKeys?.flutterwavePublicKey || '',
          stripePublicKey: school.paymentConfig?.publicKeys?.stripePublicKey || '',
          remitaMerchantId: school.paymentConfig?.publicKeys?.remitaMerchantId || ''
        },
        bankTransferDetails: bankDetails
      },

      communication: {
        supportEmail: school.communication?.supportEmail || school.email || '',
        supportPhone: school.communication?.supportPhone || school.phone || '',
        helpdeskUrl: school.communication?.helpdeskUrl || '',
        activeAnnouncementBanner: {
          enabled: school.communication?.announcementBanner?.enabled ?? false,
          message: school.communication?.announcementBanner?.message || '',
          type: school.communication?.announcementBanner?.type || 'info',
          link: school.communication?.announcementBanner?.link || ''
        },
        socialLinks: {
          facebook: school.communication?.socialLinks?.facebook || '',
          twitter: school.communication?.socialLinks?.twitter || '',
          instagram: school.communication?.socialLinks?.instagram || '',
          linkedin: school.communication?.socialLinks?.linkedin || '',
          youtube: school.communication?.socialLinks?.youtube || '',
          whatsappSupport: school.communication?.socialLinks?.whatsappSupport || ''
        }
      },

      pwa: {
        name: school.pwaSettings?.name || school.schoolName,
        shortName: school.pwaSettings?.shortName || school.abbreviation || school.schoolName,
        themeColor: school.pwaSettings?.themeColor || school.branding?.primaryColor || '#1E3A8A',
        backgroundColor: school.pwaSettings?.backgroundColor || '#FFFFFF',
        displayMode: school.pwaSettings?.displayMode || 'standalone',
        icon192: school.pwaSettings?.icon192 || school.branding?.logo || '',
        icon512: school.pwaSettings?.icon512 || school.branding?.logo || ''
      },

    };

    return res.json({
      success: true,
      data: config
    });

  } catch (error) {
    console.error('[SCHOOL CONFIG ERROR]', error);

    return res.status(500).json({
      success: false,
      error: 'Unable to load school configuration.'
    });
  }
});



/* ============================================================
 * PUBLIC WEBSITE / HOMEPAGE ENDPOINTS
 * ============================================================ */

const HOMEPAGE_SECTIONS = new Set([
  'navigation',
  'announcementBar',
  'admissionModal',
  'hero',
  'quickCards',
  'proprietor',
  'foundations',
  'services',
  'academics',
  'metrics',
  'gallery',
  'updates',
  'testimonials',
  'enquiry',
  'footer',
  'seo'
]);

// Legacy frontend names remain accepted so older admin clients do not break.
const HOMEPAGE_SECTION_ALIASES = Object.freeze({
  nav: 'navigation',
  modal: 'admissionModal',
  academicFramework: 'academics',
  stats: 'metrics',
  news: 'updates'
});

const HOMEPAGE_FORBIDDEN_KEYS = new Set([
  '__proto__',
  'prototype',
  'constructor'
]);

const HOMEPAGE_LIMITS = {
  maxDepth: 20,
  maxArrayItems: 100,
  maxObjectKeys: 100,
  maxStringLength: 10000
};

const SCHOOL_BASE_DOMAIN = String(
  process.env.SCHOOL_BASE_DOMAIN || 'goldlincschools.com.ng'
).replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase();

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSafeHomepageString(value) {
  if (typeof value !== 'string') return true;
  return !/^\s*(javascript:|vbscript:|data:text\/html)/i.test(value);
}

function sanitizeHomepageValue(value, depth = 0) {
  if (depth > HOMEPAGE_LIMITS.maxDepth) {
    throw new Error('Homepage configuration is too deeply nested.');
  }

  if (typeof value === 'string') {
    if (value.length > HOMEPAGE_LIMITS.maxStringLength) {
      throw new Error(`Homepage text exceeds the ${HOMEPAGE_LIMITS.maxStringLength}-character limit.`);
    }
    if (!isSafeHomepageString(value)) {
      throw new Error('Homepage contains an unsafe URL or executable protocol.');
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > HOMEPAGE_LIMITS.maxArrayItems) {
      throw new Error(`Homepage arrays cannot contain more than ${HOMEPAGE_LIMITS.maxArrayItems} items.`);
    }
    return value.map(item => sanitizeHomepageValue(item, depth + 1));
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length > HOMEPAGE_LIMITS.maxObjectKeys) {
      throw new Error(`Homepage objects cannot contain more than ${HOMEPAGE_LIMITS.maxObjectKeys} fields.`);
    }

    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (HOMEPAGE_FORBIDDEN_KEYS.has(key)) {
        throw new Error(`Invalid homepage configuration key: ${key}`);
      }
      out[key] = sanitizeHomepageValue(item, depth + 1);
    }
    return out;
  }

  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  throw new Error('Homepage contains an unsupported value type.');
}

function deepMergeHomepage(base, patch) {
  if (!isPlainObject(patch)) return base;
  const output = isPlainObject(base) ? { ...base } : {};

  for (const [key, value] of Object.entries(patch)) {
    if (HOMEPAGE_FORBIDDEN_KEYS.has(key)) continue;
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = deepMergeHomepage(output[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function canonicalHomepageSection(section) {
  const key = String(section || '').trim();
  return HOMEPAGE_SECTION_ALIASES[key] || key;
}

function normalizeHomepageAliases(input = {}) {
  const homepage = isPlainObject(input) ? { ...input } : {};

  for (const [legacy, canonical] of Object.entries(HOMEPAGE_SECTION_ALIASES)) {
    if (homepage[canonical] === undefined && homepage[legacy] !== undefined) {
      homepage[canonical] = homepage[legacy];
    }
  }

  // announcementBar historically also existed under communication. Keep the
  // homepage API self-contained while remaining backward compatible.
  if (homepage.announcementBar === undefined) {
    homepage.announcementBar = {};
  }

  return homepage;
}

function buildSchoolCanonicalUrl(school) {
  const custom = String(school?.customDomain || '').trim().toLowerCase();
  const subdomain = String(school?.subdomain || '').trim().toLowerCase();

  if (custom) return `https://${custom}`;
  if (subdomain) return `https://${subdomain}.${SCHOOL_BASE_DOMAIN}`;

  const website = String(school?.website || '').trim();
  if (/^https?:\/\//i.test(website)) return website.replace(/\/$/, '');
  return '';
}

function buildDefaultSchoolSeo(school, homepage = {}) {
  const loc = school?.location || {};
  const name = school?.schoolName || 'School';
  const motto = school?.motto || school?.tagline || '';
  const hero = homepage?.hero?.slides?.[0] || {};

  const fallbackDescription = [
    school?.description,
    hero?.description,
    `${name} provides quality education, character development and a supportive learning environment${loc.city ? ` in ${loc.city}` : ''}${loc.state ? `, ${loc.state}` : ''}.`
  ].find(value => typeof value === 'string' && value.trim());

  const canonical = buildSchoolCanonicalUrl(school);
  const logo = school?.branding?.logo || school?.logoUrl || '';

  return {
    title: `${name}${motto ? ` | ${motto}` : ''}`.slice(0, 70),
    description: String(fallbackDescription || '').replace(/\s+/g, ' ').trim().slice(0, 300),
    keywords: [
      name,
      school?.abbreviation,
      'school',
      'education',
      'admissions',
      'students',
      loc.city,
      loc.state,
      loc.country
    ].filter(Boolean).join(', ').slice(0, 500),
    canonical,
    ogImage: logo,
    robots: 'index,follow',
    ogType: 'website',
    twitterCard: 'summary_large_image'
  };
}

function normalizeHomepageForSchool(homepage, school) {
  const normalized = normalizeHomepageAliases(homepage || {});

  // The school model historically stored announcements under communication.
  // Promote that value into the homepage CMS contract when no homepage-level
  // announcement has been configured.
  const legacyAnnouncement = school?.communication?.announcementBanner;
  if (isPlainObject(legacyAnnouncement) && Object.keys(normalized.announcementBar || {}).length === 0) {
    normalized.announcementBar = { ...legacyAnnouncement };
  }

  const defaultSeo = buildDefaultSchoolSeo(school, normalized);
  const explicitSeo = isPlainObject(normalized.seo) ? normalized.seo : {};

  normalized.seo = {
    ...defaultSeo,
    ...explicitSeo,
    title: String(explicitSeo.title || defaultSeo.title).slice(0, 70),
    description: String(explicitSeo.description || defaultSeo.description).slice(0, 300),
    keywords: String(explicitSeo.keywords || defaultSeo.keywords).slice(0, 500),
    canonical: String(explicitSeo.canonical || defaultSeo.canonical || '').slice(0, 500),
    ogImage: String(explicitSeo.ogImage || defaultSeo.ogImage || '').slice(0, 1000),
    robots: String(explicitSeo.robots || defaultSeo.robots).slice(0, 100),
    ogType: String(explicitSeo.ogType || defaultSeo.ogType).slice(0, 50),
    twitterCard: String(explicitSeo.twitterCard || defaultSeo.twitterCard).slice(0, 50)
  };

  return normalized;
}

function buildPublicSchoolPayload(school, homepage, homepageSettings) {
  const branding = school?.branding || {};
  const normalizedHomepage = normalizeHomepageForSchool(homepage || {}, school);

  return {
    school: {
      id: school._id,
      schoolId: school.schoolId,
      name: school.schoolName,
      shortName: school.shortName || '',
      abbreviation: school.abbreviation || '',
      motto: school.motto || school.settings?.motto || '',
      tagline: school.tagline || school.settings?.tagline || '',
      description: school.description || '',
      seoTitle: normalizedHomepage.seo?.title || '',
      seoDescription: normalizedHomepage.seo?.description || '',
      seoKeywords: normalizedHomepage.seo?.keywords || '',
      domains: {
        subdomain: school.subdomain || '',
        customDomain: school.customDomain || ''
      },
      subdomain: school.subdomain || '',
      customDomain: school.customDomain || '',
      schoolType: school.schoolType || 'secondary',
      ownershipType: school.ownershipType || 'Private',
      establishedYear: school.establishedYear || null,
      registrationNumber: school.registrationNumber || '',
      contact: {
        email: school.email || '',
        phone: school.phone || '',
        altPhone: school.altPhone || '',
        website: school.website || ''
      },
      location: {
        country: school.country || '',
        state: school.state || '',
        city: school.city || '',
        address: school.address || '',
        postalCode: school.postalCode || '',
        coordinates: {
          latitude: school.coordinates?.latitude ?? null,
          longitude: school.coordinates?.longitude ?? null
        }
      },
      principal: {
        name: typeof school.principal === 'object' ? (school.principal?.name || '') : (school.principal || ''),
        title: school.principal?.title || 'Principal',
        email: school.principal?.email || '',
        signatureUrl: school.principal?.signatureUrl || ''
      },
      logoUrl: school.logoUrl || branding.logo || '',
      socialLinks: {
        facebook: school.communication?.socialLinks?.facebook || '',
        twitter: school.communication?.socialLinks?.twitter || '',
        instagram: school.communication?.socialLinks?.instagram || '',
        linkedin: school.communication?.socialLinks?.linkedin || '',
        youtube: school.communication?.socialLinks?.youtube || '',
        whatsappSupport: school.communication?.socialLinks?.whatsappSupport || ''
      }
    },
    branding: {
      logos: {
        main: branding.logo || school.logoUrl || '',
        dark: branding.darkLogo || branding.logo || school.logoUrl || '',
        light: branding.lightLogo || branding.logo || school.logoUrl || '',
        monochrome: branding.monochromeLogo || school.logoUrl || '',
        watermark: branding.watermark || branding.logo || school.logoUrl || '',
        stamp: branding.schoolStamp || ''
      },
      favicon: branding.favicon || '',
      colors: {
        primary: branding.primaryColor || '#1E3A8A',
        secondary: branding.secondaryColor || '#F59E0B',
        accent: branding.accentColor || '#10B981',
        dark: branding.darkColor || '#111827',
        light: branding.lightColor || '#F9FAFB',
        sidebarBg: branding.sidebarBg || '#1E293B',
        headerBg: branding.headerBg || '#FFFFFF'
      },
      typography: {
        fontFamily: branding.fontFamily || 'Inter, sans-serif',
        headingFont: branding.headingFont || 'Inter, sans-serif'
      },
      customCssUrl: branding.customCssUrl || ''
    },
    homepage: normalizedHomepage,
    homepageSettings: {
      enabled: homepageSettings?.enabled ?? true,
      published: homepageSettings?.published ?? true,
      revision: homepageSettings?.revision ?? 1,
      lastPublishedAt: homepageSettings?.lastPublishedAt || null
    }
  };
}

function isPlatformAdmin(user) {
  const roles = [
    user?.role,
    user?.userType,
    user?.accountType,
    user?.type
  ]
    .filter(Boolean)
    .map(value => String(value).toLowerCase().trim());

  // IMPORTANT: `superadmin` is school-scoped. It must NEVER be treated as
  // a global/platform administrator. Only an explicitly defined system or
  // platform role may bypass tenant isolation.
  return roles.some(role => [
    'systemadmin',
    'system_admin',
    'platformadmin',
    'platform_admin'
  ].includes(role));
}

function getUserSchoolIdentifiers(user) {
  const values = [
    user?.schoolId,
    user?.schoolKey,
    user?.schoolCode,
    typeof user?.school === 'string' ? user.school : null,
    user?.school?.schoolId,
    user?.school?._id
  ].filter(Boolean).map(value => String(value).trim());

  return [...new Set(values)];
}

function userBelongsToSchool(user, school) {
  const identifiers = getUserSchoolIdentifiers(user);

  return identifiers.some(identifier =>
    identifier === String(school.schoolId) ||
    identifier === String(school._id)
  );
}

function requirePlatformAdmin(req, res) {
  if (isPlatformAdmin(req.user)) return true;

  res.status(403).json({
    success: false,
    error: 'This operation is restricted to a system/platform administrator.'
  });

  return false;
}

async function resolveSchoolForAdminRequest(req, res, options = {}) {
  const { allowInactive = false } = options;
  const user = req.user || {};
  const platformAdmin = isPlatformAdmin(user);
  const requestedId = String(req.params?.id || req.body?.schoolId || req.query?.schoolId || '').trim();

  if (!requestedId) {
    return {
      errorResponse: res.status(400).json({
        success: false,
        error: 'A school identifier is required.'
      })
    };
  }

  const query = {
    isDeleted: { $ne: true }
  };

  if (!allowInactive) query.status = 'active';

  if (mongoose.Types.ObjectId.isValid(requestedId)) {
    query._id = requestedId;
  } else {
    query.schoolId = requestedId;
  }

  const school = await School.findOne(query);

  if (!school) {
    return {
      errorResponse: res.status(404).json({
        success: false,
        error: 'School not found or inactive.'
      })
    };
  }

  // System/platform admins may operate across schools. A school-scoped
  // superadmin must match the target school exactly.
  if (!platformAdmin && !userBelongsToSchool(user, school)) {
    return {
      errorResponse: res.status(403).json({
        success: false,
        error: 'You are not authorized to manage this school.'
      })
    };
  }

  return { school, platformAdmin };
}

async function resolveHomepageSchool(req, res) {
  const user = req.user || {};
  const platformAdmin = isPlatformAdmin(user);
  const identifiers = getUserSchoolIdentifiers(user);

  // Accept the active school from the request, but always fall back to the
  // school attached to the authenticated user. This is important for
  // superadmins who are acting on behalf of a specific school.
  const requestCandidates = [
    req.body?.schoolId,
    req.query?.schoolId,
    req.headers?.['x-school-id'],
    req.headers?.['x-school-code'],
    req.headers?.['x-schoolid']
  ];

  let requestedSchool = requestCandidates
    .find(value => value !== undefined && value !== null && String(value).trim() !== '');

  // If the frontend did not explicitly provide a school, use the school
  // associated with the authenticated user. Prefer the schoolId field that
  // auth middleware normally attaches, then the other known identifiers.
  if (requestedSchool === undefined || requestedSchool === null || String(requestedSchool).trim() === '') {
    requestedSchool = identifiers[0] || '';
  }

  requestedSchool = String(requestedSchool || '').trim();

  if (!requestedSchool) {
    return {
      errorResponse: res.status(400).json({
        success: false,
        error: 'A schoolId is required or must be associated with the authenticated user.'
      })
    };
  }

  // Resolve the requested school first. For a non-platform admin, make sure
  // the resolved School belongs to the authenticated user's school before
  // allowing the request to continue.
  const query = {
    status: 'active',
    isDeleted: { $ne: true }
  };

  if (/^SCH-[A-Z0-9]+-[A-Z0-9]+$/i.test(requestedSchool)) {
    query.schoolId = requestedSchool.toUpperCase();
  } else if (mongoose.Types.ObjectId.isValid(requestedSchool)) {
    query._id = requestedSchool;
  } else {
    // Preserve compatibility with installations where schoolId is not using
    // the SCH-... format.
    query.schoolId = requestedSchool;
  }

  const school = await School.findOne(query);

  if (!school) {
    return {
      errorResponse: res.status(404).json({
        success: false,
        error: 'School not found or inactive.'
      })
    };
  }

  if (!platformAdmin) {
    if (identifiers.length === 0) {
      return {
        errorResponse: res.status(403).json({
          success: false,
          error: 'The authenticated user is not associated with a school.'
        })
      };
    }

    const schoolMatches = identifiers.some(identifier =>
      identifier === String(school.schoolId) ||
      identifier === String(school._id)
    );

    if (!schoolMatches) {
      return {
        errorResponse: res.status(403).json({
          success: false,
          error: 'You are not authorized to manage this school homepage.'
        })
      };
    }
  }

  return { school, platformAdmin };
}

/**
 * GET /api/schools/homepage
 * Public homepage configuration.
 *
 * Query:
 *   schoolId OR subdomain OR domain
 */
router.get('/homepage', async (req, res) => {
  try {
    const { schoolId, domain, subdomain } = req.query;

    if (!schoolId && !domain && !subdomain) {
      return res.status(400).json({
        success: false,
        error: 'A schoolId, domain, or subdomain query parameter is required.'
      });
    }

    const query = {
      status: 'active',
      isDeleted: { $ne: true }
    };

    if (schoolId) {
      query.schoolId = String(schoolId).trim();
    } else if (subdomain) {
      query.subdomain = String(subdomain).trim().toLowerCase();
    } else {
      const cleanDomain = String(domain).trim().toLowerCase();
      query.$or = [
        { customDomain: cleanDomain },
        { subdomain: cleanDomain }
      ];
    }

    const school = await School.findOne(query)
      .select(`
        _id
        schoolId
        schoolName
        abbreviation
        motto
        tagline
        subdomain
        customDomain
        email
        phone
        website
        description
        country
        state
        city
        address
        principal
        logoUrl
        branding
        communication
        homepage
        homepageSettings
      `)
      .lean();

    if (!school) {
      return res.status(404).json({
        success: false,
        error: 'School homepage not found or account is inactive.'
      });
    }

    const settings = school.homepageSettings || {};
    const isPublished =
      settings.enabled !== false &&
      settings.published !== false;

    const publicPayload = buildPublicSchoolPayload(
      school,
      isPublished ? (school.homepage || {}) : {},
      settings
    );

    return res.json({
      success: true,
      data: publicPayload
    });
  } catch (error) {
    console.error('[PUBLIC HOMEPAGE ERROR]', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to load homepage configuration.'
    });
  }
});

/**
 * POST /api/schools/enquiries
 * Public school enquiry submission.
 *
 * The school is resolved by schoolId or subdomain. The endpoint intentionally
 * does not require authentication because this form is public-facing.
 */
const enquiryRateBucket = new Map();
const ENQUIRY_RATE_WINDOW_MS = 10 * 60 * 1000;
const ENQUIRY_RATE_MAX = 8;

function getRequestFingerprint(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || 'unknown';
}

function allowPublicEnquiry(req) {
  const key = getRequestFingerprint(req);
  const now = Date.now();
  const previous = enquiryRateBucket.get(key) || [];
  const recent = previous.filter(timestamp => now - timestamp < ENQUIRY_RATE_WINDOW_MS);

  if (recent.length >= ENQUIRY_RATE_MAX) {
    enquiryRateBucket.set(key, recent);
    return false;
  }

  recent.push(now);
  enquiryRateBucket.set(key, recent);

  // Opportunistic cleanup to keep the in-memory map small on long-running servers.
  if (enquiryRateBucket.size > 5000) {
    for (const [fingerprint, timestamps] of enquiryRateBucket.entries()) {
      if (!timestamps.some(timestamp => now - timestamp < ENQUIRY_RATE_WINDOW_MS)) {
        enquiryRateBucket.delete(fingerprint);
      }
    }
  }

  return true;
}

function cleanPublicEnquiryString(value, max = 500) {
  return String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max);
}

router.post('/enquiries', async (req, res) => {
  try {
    if (!allowPublicEnquiry(req)) {
      return res.status(429).json({
        success: false,
        error: 'Too many enquiries from this connection. Please try again later.'
      });
    }

    // Honeypot field for simple automated spam.
    if (String(req.body?.website || '').trim()) {
      return res.status(201).json({
        success: true,
        message: 'Enquiry received.'
      });
    }

    const firstName = cleanPublicEnquiryString(req.body?.firstName, 80);
    const lastName = cleanPublicEnquiryString(req.body?.lastName, 80);
    const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 160);
    const phone = cleanPublicEnquiryString(req.body?.phone, 40);
    const grade = cleanPublicEnquiryString(req.body?.grade, 100);
    const comments = cleanPublicEnquiryString(req.body?.comments, 2000);
    const requestedSchool = cleanPublicEnquiryString(
      req.body?.schoolId || req.body?.schoolSubdomain || req.body?.subdomain,
      100
    ).toLowerCase();

    if (!firstName || !lastName || !email || !phone || !grade || !requestedSchool) {
      return res.status(400).json({
        success: false,
        error: 'First name, last name, email, phone, grade and school are required.'
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid email address.'
      });
    }

    const query = { status: 'active', isDeleted: { $ne: true } };
    if (mongoose.Types.ObjectId.isValid(requestedSchool)) {
      query._id = requestedSchool;
    } else if (/^SCH-[A-Z0-9]+-[A-Z0-9]+$/i.test(requestedSchool)) {
      query.schoolId = requestedSchool.toUpperCase();
    } else {
      query.subdomain = requestedSchool;
    }

    const school = await School.findOne(query)
      .select('_id schoolId schoolName subdomain email communication.supportEmail')
      .lean();

    if (!school) {
      return res.status(404).json({
        success: false,
        error: 'School could not be identified.'
      });
    }

    const enquiry = await SchoolEnquiry.create({
      school: school._id,
      schoolId: school.schoolId,
      schoolName: school.schoolName,
      schoolSubdomain: school.subdomain || '',
      firstName,
      lastName,
      email,
      phone,
      grade,
      comments,
      source: cleanPublicEnquiryString(req.body?.source || 'school-homepage', 60),
      status: 'new'
    });

    return res.status(201).json({
      success: true,
      message: 'Thank you. Your enquiry has been received.',
      data: {
        id: enquiry._id,
        schoolId: school.schoolId,
        status: enquiry.status
      }
    });
  } catch (error) {
    console.error('[PUBLIC SCHOOL ENQUIRY ERROR]', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to submit your enquiry at this time.'
    });
  }
});

/**
 * GET /api/schools/enquiries/admin
 * School/platform admin view of enquiries.
 */
router.get('/enquiries/admin', authMiddleware, adminAuth, async (req, res) => {
  try {
    const resolved = await resolveHomepageSchool(req, res);
    if (resolved.errorResponse) return resolved.errorResponse;

    const { school } = resolved;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const skip = (page - 1) * limit;
    const status = String(req.query.status || '').trim().toLowerCase();

    const filter = { school: school._id };
    if (['new', 'contacted', 'closed', 'spam'].includes(status)) {
      filter.status = status;
    }

    const [items, total] = await Promise.all([
      SchoolEnquiry.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SchoolEnquiry.countDocuments(filter)
    ]);

    return res.json({
      success: true,
      data: items,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[ADMIN SCHOOL ENQUIRIES GET ERROR]', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to load school enquiries.'
    });
  }
});

/**
 * PATCH /api/schools/enquiries/admin/:id/status
 * Update enquiry workflow status.
 */
router.patch('/enquiries/admin/:id/status', authMiddleware, adminAuth, async (req, res) => {
  try {
    const resolved = await resolveHomepageSchool(req, res);
    if (resolved.errorResponse) return resolved.errorResponse;

    const status = String(req.body?.status || '').trim().toLowerCase();
    if (!['new', 'contacted', 'closed', 'spam'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid enquiry status.'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid enquiry ID.'
      });
    }

    const enquiry = await SchoolEnquiry.findOneAndUpdate(
      { _id: req.params.id, school: resolved.school._id },
      { $set: { status, updatedBy: req.user?._id || null } },
      { new: true }
    ).lean();

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        error: 'Enquiry not found.'
      });
    }

    return res.json({
      success: true,
      message: 'Enquiry status updated.',
      data: enquiry
    });
  } catch (error) {
    console.error('[ADMIN SCHOOL ENQUIRY STATUS ERROR]', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to update enquiry status.'
    });
  }
});

/**
 * GET /api/schools/homepage/admin
 * Authenticated school/platform admin reads editable homepage.
 */
router.get('/homepage/admin', authMiddleware, adminAuth, async (req, res) => {
  try {
    const resolved = await resolveHomepageSchool(req, res);
    if (resolved.errorResponse) return resolved.errorResponse;

    const { school } = resolved;

    return res.json({
      success: true,
      data: {
        school: {
          id: school._id,
          _id: school._id,
          schoolId: school.schoolId,
          name: school.schoolName,
          schoolName: school.schoolName,
          motto: school.motto || school.settings?.motto || '',
          tagline: school.tagline || school.settings?.tagline || '',
          description: school.description || '',
          subdomain: school.subdomain || '',
          customDomain: school.customDomain || '',
          country: school.country || '',
          state: school.state || '',
          city: school.city || '',
          address: school.address || '',
          postalCode: school.postalCode || '',
          email: school.email || '',
          phone: school.phone || '',
          secondaryEmail: school.secondaryEmail || '',
          altPhone: school.altPhone || '',
          website: school.website || '',
          adminName: school.adminName || '',
          adminEmail: school.adminEmail || '',
          adminPhone: school.adminPhone || '',
          logoUrl: school.logoUrl || school.branding?.logo || '',
          branding: school.branding || {},
          communication: school.communication || {},
          portalAccess: school.portalAccess || {},
          featuresEnabled: school.featuresEnabled || {},
          principal: school.principal || {
            name: '',
            title: 'Principal',
            email: ''
          }
        },
        branding: school.branding || {},
        communication: school.communication || {},
        homepage: normalizeHomepageForSchool(school.homepage || {}, school),
        homepageSettings: school.homepageSettings || {
          enabled: true,
          published: true,
          revision: 1,
          lastPublishedAt: null
        }
      }
    });
  } catch (error) {
    console.error('[ADMIN HOMEPAGE GET ERROR]', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to load homepage editor configuration.'
    });
  }
});

/**
 * POST /api/schools/homepage/admin/upload-image
 * Upload a homepage editor image to the Supabase editor bucket.
 *
 * Form field:
 *   image: image file (max 5 MB)
 *
 * The image is not written into MongoDB by this endpoint. The returned
 * public URL is placed into the homepage field by the editor, then saved
 * with the normal homepage draft workflow.
 */
router.post(
  '/homepage/admin/upload-image',
  authMiddleware,
  adminAuth,
  homepageImageUpload.single('image'),
  async (req, res) => {
    try {
      const resolved = await resolveHomepageSchool(req, res);
      if (resolved.errorResponse) return resolved.errorResponse;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No image file was uploaded.'
        });
      }

      const supabase = getHomepageSupabase();
      const schoolId = String(resolved.school.schoolId || resolved.school._id);
      const filename = safeHomepageImageName(req.file.originalname);
      const storagePath = `homepage/${schoolId}/${filename}`;

      const { error: uploadError } = await supabase.storage
        .from(HOMEPAGE_EDITOR_BUCKET)
        .upload(storagePath, req.file.buffer, {
          contentType: req.file.mimetype,
          cacheControl: '31536000',
          upsert: false
        });

      if (uploadError) {
        console.error('[HOMEPAGE IMAGE SUPABASE UPLOAD ERROR]', uploadError);
        return res.status(500).json({
          success: false,
          error: uploadError.message || 'Unable to upload homepage image.'
        });
      }

      const { data: publicData } = supabase.storage
        .from(HOMEPAGE_EDITOR_BUCKET)
        .getPublicUrl(storagePath);

      const url = publicData?.publicUrl || '';

      if (!url) {
        return res.status(500).json({
          success: false,
          error: 'Image uploaded but a public URL could not be generated.'
        });
      }

      return res.json({
        success: true,
        message: 'Homepage image uploaded successfully.',
        data: {
          url,
          path: storagePath,
          filename,
          purpose: String(req.body?.purpose || 'homepage')
        }
      });
    } catch (error) {
      console.error('[HOMEPAGE IMAGE UPLOAD ERROR]', error);
      return res.status(400).json({
        success: false,
        error: error.message || 'Unable to upload homepage image.'
      });
    }
  }
);

/**
 * PUT /api/schools/homepage/admin
 * Save the complete homepage as a draft.
 *
 * Body:
 * {
 *   "schoolId": "SCH-...",
 *   "homepage": { ... },
 *   "enabled": true
 * }
 */
router.put('/homepage/admin', authMiddleware, adminAuth, async (req, res) => {
  try {
    const resolved = await resolveHomepageSchool(req, res);
    if (resolved.errorResponse) return resolved.errorResponse;

    const { school } = resolved;

    if (req.body?.homepage === undefined || req.body?.homepage === null) {
      return res.status(400).json({
        success: false,
        error: 'homepage is required.'
      });
    }

    const homepage = normalizeHomepageAliases(sanitizeHomepageValue(req.body.homepage));

    if (!isPlainObject(homepage)) {
      return res.status(400).json({
        success: false,
        error: 'homepage must be a JSON object.'
      });
    }

    school.homepage = homepage;
    school.homepageSettings = {
      ...(school.homepageSettings || {}),
      enabled: req.body?.enabled ?? school.homepageSettings?.enabled ?? true,
      published: false,
      revision: Number(school.homepageSettings?.revision || 0) + 1
    };
    school.lastModifiedBy = req.user?._id || null;

    await school.save();

    return res.json({
      success: true,
      message: 'Homepage saved as draft.',
      data: {
        school: {
          id: school._id,
          _id: school._id,
          schoolId: school.schoolId,
          name: school.schoolName,
          schoolName: school.schoolName,
          subdomain: school.subdomain || '',
          customDomain: school.customDomain || '',
          country: school.country || '',
          state: school.state || '',
          city: school.city || '',
          address: school.address || '',
          email: school.email || '',
          phone: school.phone || '',
          logoUrl: school.logoUrl || school.branding?.logo || '',
          branding: school.branding || {},
          principal: school.principal || {}
        },
        branding: school.branding || {},
        homepage: normalizeHomepageForSchool(school.homepage || {}, school),
        homepageSettings: school.homepageSettings
      }
    });
  } catch (error) {
    console.error('[ADMIN HOMEPAGE PUT ERROR]', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'Unable to save homepage configuration.'
    });
  }
});

/**
 * PATCH /api/schools/homepage/admin/section/:section
 * Update only one homepage section.
 */
router.patch('/homepage/admin/section/:section', authMiddleware, adminAuth, async (req, res) => {
  try {
    const requestedSection = String(req.params.section || '').trim();
    const section = canonicalHomepageSection(requestedSection);

    if (!HOMEPAGE_SECTIONS.has(section)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported homepage section: ${section}`,
        allowedSections: [...HOMEPAGE_SECTIONS]
      });
    }

    const resolved = await resolveHomepageSchool(req, res);
    if (resolved.errorResponse) return resolved.errorResponse;

    const { school } = resolved;
    const rawSectionData = req.body?.section ?? req.body;
    const sectionData = sanitizeHomepageValue(rawSectionData);

    if (!isPlainObject(sectionData)) {
      return res.status(400).json({
        success: false,
        error: 'Section data must be a JSON object.'
      });
    }

    const currentHomepage =
      isPlainObject(school.homepage) ? school.homepage : {};

    school.homepage = {
      ...currentHomepage,
      [section]: deepMergeHomepage(
        currentHomepage[section] || {},
        sectionData
      )
    };

    school.homepageSettings = {
      ...(school.homepageSettings || {}),
      published: false,
      revision: Number(school.homepageSettings?.revision || 0) + 1
    };
    school.lastModifiedBy = req.user?._id || null;

    await school.save();

    return res.json({
      success: true,
      message: `${section} section saved as draft.`,
      data: {
        section,
        value: normalizeHomepageForSchool(school.homepage || {}, school)[section],
        homepageSettings: school.homepageSettings
      }
    });
  } catch (error) {
    console.error('[ADMIN HOMEPAGE SECTION PATCH ERROR]', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'Unable to update homepage section.'
    });
  }
});

/**
 * GET /api/schools/homepage/admin/preview
 * Return the unpublished/draft homepage for the authenticated school admin.
 * This endpoint never changes publication state.
 */
router.get('/homepage/admin/preview', authMiddleware, adminAuth, async (req, res) => {
  try {
    const resolved = await resolveHomepageSchool(req, res);
    if (resolved.errorResponse) return resolved.errorResponse;

    const { school } = resolved;

    return res.json({
      success: true,
      data: {
        school: {
          id: school._id,
          schoolId: school.schoolId,
          name: school.schoolName,
          subdomain: school.subdomain || '',
          customDomain: school.customDomain || ''
        },
        homepage: normalizeHomepageForSchool(school.homepage || {}, school),
        homepageSettings: school.homepageSettings || {
          enabled: true,
          published: false,
          revision: 1,
          lastPublishedAt: null
        },
        preview: true
      }
    });
  } catch (error) {
    console.error('[ADMIN HOMEPAGE PREVIEW ERROR]', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to load homepage preview.'
    });
  }
});

/**
 * POST /api/schools/homepage/admin/publish
 * Publish the current saved homepage.
 */
router.post('/homepage/admin/publish', authMiddleware, adminAuth, async (req, res) => {
  try {
    const resolved = await resolveHomepageSchool(req, res);
    if (resolved.errorResponse) return resolved.errorResponse;

    const { school } = resolved;

    school.homepageSettings = {
      ...(school.homepageSettings || {}),
      enabled: true,
      published: true,
      lastPublishedAt: new Date(),
      lastPublishedBy: req.user?._id || null,
      revision: Number(school.homepageSettings?.revision || 0) + 1
    };
    school.lastModifiedBy = req.user?._id || null;

    await school.save();

    return res.json({
      success: true,
      message: 'Homepage published successfully.',
      data: {
        homepage: normalizeHomepageForSchool(school.homepage || {}, school),
        homepageSettings: school.homepageSettings
      }
    });
  } catch (error) {
    console.error('[ADMIN HOMEPAGE PUBLISH ERROR]', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to publish homepage.'
    });
  }
});

/**
 * POST /api/schools/homepage/admin/reset
 * Clear custom homepage content and save the result as a draft.
 * The live published homepage is not changed until /publish is called.
 */
router.post('/homepage/admin/reset', authMiddleware, adminAuth, async (req, res) => {
  try {
    const resolved = await resolveHomepageSchool(req, res);
    if (resolved.errorResponse) return resolved.errorResponse;

    const { school } = resolved;

    school.homepage = {};
    school.homepageSettings = {
      ...(school.homepageSettings || {}),
      enabled: true,
      published: false,
      revision: Number(school.homepageSettings?.revision || 0) + 1
    };
    school.lastModifiedBy = req.user?._id || null;

    await school.save();

    return res.json({
      success: true,
      message: 'Homepage reset saved as a draft. Publish it when you are ready to make the reset live.',
      data: {
        homepage: {},
        homepageSettings: school.homepageSettings
      }
    });
  } catch (error) {
    console.error('[ADMIN HOMEPAGE RESET ERROR]', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to reset homepage.'
    });
  }
});


router.get('/admin/all', authMiddleware, adminAuth, async (req, res) => {
  try {
    if (!requirePlatformAdmin(req, res)) return;

    const { status, subscriptionStatus, search, page = 1, limit = 10 } = req.query;

    let query = {};

    if (status) {
      query.status = status;
    }

    if (subscriptionStatus) {
      query.subscriptionStatus = subscriptionStatus;
    }

    if (search) {
      query.$or = [
        { schoolName: { $regex: search, $options: 'i' } },
        { schoolId: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const schools = await School.find(query)
      .populate('accountManager', 'name email')
      .populate('demoRequestId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await School.countDocuments(query);

    res.json({
      success: true,
      data: schools,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching schools:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching schools',
      error: error.message
    });
  }
});

router.post('/', authMiddleware, adminAuth, validateSchool, async (req, res) => {
  try {
    if (!requirePlatformAdmin(req, res)) return;
    const {
      schoolName,
      schoolType,
      studentCount,
      staffCount,
      foundedYear,
      regNumber,
      motto,
      abbreviation,
      country,
      state,
      city,
      address,
      postalCode,
      email,
      phone,
      secondaryEmail,
      altPhone,
      website,
      principal,
      principalEmail,
      adminName,
      adminEmail,
      adminPhone,
      description,
      programs = [],
      logoUrl,
      subscriptionPlan,
      subscriptionStatus
    } = req.body;

    const requiredFields = [
      'schoolName',
      'country',
      'email',
      'phone',
      'adminName',
      'adminEmail',
      'adminPhone'
    ];

    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid school email format'
      });
    }

    if (!emailRegex.test(adminEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid admin email format'
      });
    }

    if (principalEmail && !emailRegex.test(principalEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid principal email format'
      });
    }

    if (secondaryEmail && !emailRegex.test(secondaryEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid secondary email format'
      });
    }

    const existingEmail = await School.findOne({
      email: email.toLowerCase().trim()
    });

    if (existingEmail) {
      return res.status(409).json({
        success: false,
        error: 'Email already registered'
      });
    }

    const existingAdminEmail = await School.findOne({
      adminEmail: adminEmail.toLowerCase().trim()
    });

    if (existingAdminEmail) {
      return res.status(409).json({
        success: false,
        error: 'This admin email is already associated with another school'
      });
    }

    const newSchool = new School({
      schoolName: schoolName.trim(),
      schoolType: schoolType || 'secondary',
      studentCount: parseInt(studentCount) || 0,
      staffCount: parseInt(staffCount) || 0,
      foundedYear: foundedYear ? parseInt(foundedYear) : null,
      regNumber: regNumber?.trim() || '',
      motto: motto?.trim() || '',
      abbreviation: (abbreviation || schoolName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3)).trim().toUpperCase(),
      country: country.trim(),
      state: state?.trim() || '',
      city: city?.trim() || '',
      address: address?.trim() || '',
      postalCode: postalCode?.trim() || '',
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      secondaryEmail: secondaryEmail?.toLowerCase().trim() || '',
      altPhone: altPhone?.trim() || '',
      website: website?.trim() || '',
      principal: principal?.trim() || '',
      principalEmail: principalEmail?.toLowerCase().trim() || '',
      adminName: adminName.trim(),
      adminEmail: adminEmail.toLowerCase().trim(),
      adminPhone: adminPhone.trim(),
      description: description?.trim() || '',
      programs: Array.isArray(programs) ? programs : [],
      logoUrl: logoUrl?.trim() || '',
      subscriptionPlan: subscriptionPlan || 'starter',
      subscriptionStatus: subscriptionStatus || 'trial',
      createdBy: req.user._id,
      status: 'active'
    });

    newSchool.generateSchoolId();
    await newSchool.save();

    res.status(201).json({
      success: true,
      message: 'School created successfully',
      data: newSchool
    });
  } catch (err) {
    console.error('Error creating school:', err);

    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      return res.status(409).json({
        success: false,
        error: `${field} already exists`
      });
    }

    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(error => error.message);
      return res.status(400).json({
        success: false,
        error: `Validation error: ${messages.join(', ')}`
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating school',
      error: err.message
    });
  }
});


/**
 * GET /api/schools/:id
 * Get single school details (Admin)
 */
router.get('/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const resolved = await resolveSchoolForAdminRequest(req, res);
    if (resolved.errorResponse) return resolved.errorResponse;

    const school = await School.findById(resolved.school._id)
      .populate('accountManager', 'name email')
      .populate('demoRequestId')
      .populate('createdBy', 'name email');

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    res.json({
      success: true,
      data: school
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching school details',
      error: error.message
    });
  }
});

/**
 * PUT /api/schools/:id
 * Update school details (Admin)
 */
router.put('/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const updates = req.body;

    // Remove fields that shouldn't be updated
    delete updates.schoolId;
    delete updates.apiKey;
    delete updates.createdBy;
    delete updates.createdAt;
    delete updates.isDeleted;
    delete updates.deletedAt;
    delete updates.deletedBy;

    // Validate email if provided
    if (updates.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format'
        });
      }
      updates.email = updates.email.toLowerCase();

      // Check if email is already used
      const existing = await School.findOne({
        email: updates.email,
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'Email already in use'
        });
      }
    }

    const resolved = await resolveSchoolForAdminRequest(req, res);
    if (resolved.errorResponse) return resolved.errorResponse;

    updates.lastModifiedBy = req.user._id;

    const school = await School.findByIdAndUpdate(
      resolved.school._id,
      updates,
      { new: true, runValidators: true }
    ).populate('accountManager', 'name email');

    if (!school) {
      return res.status(404).json({
        success: false,
        error: 'School not found'
      });
    }

    res.json({
      success: true,
      message: 'School updated successfully',
      data: school
    });
  } catch (err) {
    console.error('Error updating school:', err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(409).json({
        success: false,
        error: `${field} already exists`
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error updating school',
      error: err.message
    });
  }
});

/**
 * DELETE /api/schools/:id
 * Soft delete a school (Admin)
 */
router.delete('/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const resolved = await resolveSchoolForAdminRequest(req, res);
    if (resolved.errorResponse) return resolved.errorResponse;

    const school = await School.findById(resolved.school._id);
    if (!school) {
      return res.status(404).json({
        success: false,
        error: 'School not found'
      });
    }

    await school.softDelete(req.user._id);

    res.json({
      success: true,
      message: 'School deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting school:', err);
    res.status(500).json({
      success: false,
      message: 'Error deleting school',
      error: err.message
    });
  }
});

/**
 * POST /api/schools/:id/generate-api-key
 * Generate API key for a school (Admin)
 */
router.post('/:id/generate-api-key', authMiddleware, adminAuth, async (req, res) => {
  try {
    const resolved = await resolveSchoolForAdminRequest(req, res);
    if (resolved.errorResponse) return resolved.errorResponse;

    const school = await School.findById(resolved.school._id);
    if (!school) {
      return res.status(404).json({
        success: false,
        error: 'School not found'
      });
    }

    const apiKey = school.generateApiKey();
    await school.save();

    res.json({
      success: true,
      message: 'API key generated successfully',
      data: {
        schoolId: school.schoolId,
        apiKey,
        isApiEnabled: true
      }
    });
  } catch (err) {
    console.error('Error generating API key:', err);
    res.status(500).json({
      success: false,
      message: 'Error generating API key',
      error: err.message
    });
  }
});

/**
 * POST /api/schools/from-request/:requestId
 * Create new school from approved demo request (Admin)
 */
router.post('/from-request/:requestId', authMiddleware, adminAuth, async (req, res) => {
  try {
    if (!requirePlatformAdmin(req, res)) return;
    const demoRequest = await DemoRequest.findById(req.params.requestId);

    if (!demoRequest || demoRequest.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Invalid or non-approved demo request'
      });
    }

    // Check if school already exists
    const existingSchool = await School.findOne({ email: demoRequest.email });
    if (existingSchool) {
      return res.status(400).json({
        success: false,
        message: 'School with this email already exists'
      });
    }

    const newSchool = new School({
      schoolName: demoRequest.schoolName,
      schoolType: demoRequest.schoolType,
      studentCount: parseInt(demoRequest.studentCount.split('-')[0]) || 0,
      country: demoRequest.country,
      state: demoRequest.state || null,
      city: demoRequest.city || null,
      email: demoRequest.email,
      phone: demoRequest.phone,
      website: demoRequest.schoolWebsite || null,
      adminName: demoRequest.contactPerson,
      adminEmail: demoRequest.email,
      adminPhone: demoRequest.phone,
      subscriptionPlan: 'starter',
      subscriptionStatus: 'trial',
      demoRequestId: demoRequest._id,
      createdBy: req.user._id,
      status: 'active'
    });

    // Generate schoolId
    newSchool.generateSchoolId();

    await newSchool.save();

    // Update demo request
    demoRequest.status = 'school_created';
    demoRequest.schoolId = newSchool._id;
    await demoRequest.save();

    res.status(201).json({
      success: true,
      message: 'School created successfully from demo request',
      data: newSchool
    });
  } catch (err) {
    console.error('Error creating school from request:', err);
    res.status(500).json({
      success: false,
      message: 'Error creating school',
      error: err.message
    });
  }
});

/**
 * POST /api/schools/bulk-import
 * Bulk import schools (Admin)
 */
router.post('/bulk-import', authMiddleware, adminAuth, async (req, res) => {
  try {
    if (!requirePlatformAdmin(req, res)) return;
    const { schools } = req.body;

    if (!Array.isArray(schools) || schools.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or empty schools array'
      });
    }

    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };

    for (let i = 0; i < schools.length; i++) {
      try {
        const schoolData = schools[i];

        if (!schoolData.schoolName || !schoolData.email || !schoolData.adminName || !schoolData.country) {
          results.errors.push({
            row: i + 1,
            error: 'Missing required fields'
          });
          results.failed++;
          continue;
        }

        // Check if email exists
        const existing = await School.findOne({ email: schoolData.email.toLowerCase() });
        if (existing) {
          results.errors.push({
            row: i + 1,
            error: 'Email already exists'
          });
          results.failed++;
          continue;
        }

        const newSchool = new School({
          schoolName: schoolData.schoolName.trim(),
          schoolType: schoolData.schoolType || 'secondary',
          studentCount: parseInt(schoolData.studentCount) || 0,
          country: schoolData.country.trim(),
          state: schoolData.state?.trim() || null,
          city: schoolData.city?.trim() || null,
          email: schoolData.email.toLowerCase().trim(),
          phone: schoolData.phone?.trim() || '',
          adminName: schoolData.adminName.trim(),
          adminEmail: schoolData.adminEmail?.trim() || schoolData.email.toLowerCase().trim(),
          adminPhone: schoolData.adminPhone?.trim() || schoolData.phone?.trim() || '',
          createdBy: req.user._id,
          status: 'active'
        });

        newSchool.generateSchoolId();
        await newSchool.save();
        results.successful++;
      } catch (err) {
        results.errors.push({
          row: i + 1,
          error: err.message
        });
        results.failed++;
      }
    }

    res.json({
      success: true,
      message: `Import completed: ${results.successful} successful, ${results.failed} failed`,
      data: results
    });
  } catch (err) {
    console.error('Error in bulk import:', err);
    res.status(500).json({
      success: false,
      message: 'Error in bulk import',
      error: err.message
    });
  }
});

module.exports = router;
