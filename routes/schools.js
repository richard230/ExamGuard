const express = require('express');
const router = express.Router();
const School = require('../models/School');
const DemoRequest = require('../models/DemoRequest');
const { authMiddleware } = require('./auth');
const adminAuth = require('../middleware/adminAuth');
const crypto = require('crypto');

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

    const config = {
      school: {
        id: school._id,
        schoolId: school.schoolId,
        name: school.schoolName,
        abbreviation: school.abbreviation || '',
        motto: school.motto || school.settings?.motto || '',
        tagline: school.tagline || school.settings?.tagline || '',
        schoolType: school.schoolType || 'K-12',
        ownershipType: school.ownershipType || 'Private',
        establishedYear: school.establishedYear || null,
        registrationNumber: school.registrationNumber || '',
        domains: {
          subdomain: school.subdomain || '',
          customDomain: school.customDomain || ''
        },
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
        }
      },

      branding: {
        logos: {
          main: school.branding?.logo || '',
          dark: school.branding?.darkLogo || school.branding?.logo || '',
          light: school.branding?.lightLogo || school.branding?.logo || '',
          monochrome: school.branding?.monochromeLogo || '',
          watermark: school.branding?.watermark || school.branding?.logo || '',
          stamp: school.branding?.schoolStamp || ''
        },
        favicon: school.branding?.favicon || '',
        colors: {
          primary: school.branding?.primaryColor || '#1E3A8A',
          secondary: school.branding?.secondaryColor || '#F59E0B',
          accent: school.branding?.accentColor || '#10B981',
          dark: school.branding?.darkColor || '#111827',
          light: school.branding?.lightColor || '#F9FAFB',
          sidebarBg: school.branding?.sidebarBg || '#1E293B',
          headerBg: school.branding?.headerBg || '#FFFFFF'
        },
        typography: {
          fontFamily: school.branding?.fontFamily || 'Inter, sans-serif',
          headingFont: school.branding?.headingFont || 'Inter, sans-serif'
        },
        customCssUrl: school.branding?.customCssUrl || ''
      },

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
      }
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



router.get('/admin/all', authMiddleware, adminAuth, async (req, res) => {
  try {
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

/**
 * POST /api/schools
 * Create new school (Admin)
 */
router.post('/', authMiddleware, adminAuth, validateSchool, async (req, res) => {
  try {
    const {
      schoolName,
      schoolType,
      studentCount,
      staffCount,
      country,
      state,
      city,
      address,
      email,
      phone,
      website,
      adminName,
      adminEmail,
      adminPhone,
      principal,
      abbreviation,
      subscriptionPlan,
      subscriptionStatus
    } = req.body;

    // Check if email already exists
    const existingEmail = await School.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        error: 'Email already registered'
      });
    }

    // Create new school
    const newSchool = new School({
      schoolName: schoolName.trim(),
      schoolType: schoolType || 'secondary',
      studentCount: parseInt(studentCount) || 0,
      staffCount: parseInt(staffCount) || 0,
      country: country.trim(),
      state: state?.trim() || null,
      city: city?.trim() || null,
      address: address?.trim() || null,
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      website: website?.trim() || null,
      adminName: adminName.trim(),
      adminEmail: adminEmail.toLowerCase().trim(),
      adminPhone: adminPhone.trim(),
      principal: principal?.trim() || null,
      abbreviation: (abbreviation || schoolName.substring(0, 3)).trim().toUpperCase(),
      subscriptionPlan: subscriptionPlan || 'starter',
      subscriptionStatus: subscriptionStatus || 'trial',
      createdBy: req.user._id,
      status: 'active'
    });

    // Generate schoolId
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
      const field = Object.keys(err.keyPattern)[0];
      return res.status(409).json({
        success: false,
        error: `${field} already exists`
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
    const school = await School.findById(req.params.id)
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

    updates.lastModifiedBy = req.user._id;

    const school = await School.findByIdAndUpdate(
      req.params.id,
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
    const school = await School.findById(req.params.id);
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
    const school = await School.findById(req.params.id);
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
