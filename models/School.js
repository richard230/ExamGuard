const mongoose = require('mongoose');
const crypto = require('crypto');

const { Schema, model } = mongoose;

const schoolSchema = new Schema(
  {
    schoolId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      trim: true,
      match: /^SCH-[A-Z0-9]+-[A-Z0-9]+$/
    },

    abbreviation: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 10,
      sparse: true
    },

    schoolName: {
      type: String,
      required: true,
      trim: true,
      index: true
    },

    motto: {
      type: String,
      trim: true,
      default: ''
    },

    tagline: {
      type: String,
      trim: true,
      default: ''
    },

    schoolType: {
      type: String,
      required: true,
      enum: ['primary', 'secondary', 'tertiary', 'private', 'other'],
      default: 'secondary'
    },

    ownershipType: {
      type: String,
      enum: ['Private', 'Public', 'Government', 'Mission', 'Community', 'Other'],
      default: 'Private'
    },

    establishedYear: {
      type: Number,
      min: 1800,
      max: 2099,
      alias: 'foundedYear'
    },

    registrationNumber: {
      type: String,
      trim: true,
      default: '',
      alias: 'regNumber'
    },

    studentCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },

    staffCount: {
      type: Number,
      default: 0,
      min: 0
    },

    classCount: {
      type: Number,
      default: 0,
      min: 0
    },

    subdomain: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      unique: true,
      index: true
    },

    customDomain: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      unique: true,
      index: true
    },

    country: {
      type: String,
      required: true,
      trim: true
    },

    state: {
      type: String,
      trim: true,
      default: ''
    },

    city: {
      type: String,
      trim: true,
      default: ''
    },

    address: {
      type: String,
      trim: true,
      default: ''
    },

    postalCode: {
      type: String,
      trim: true,
      default: ''
    },

    coordinates: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null }
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      index: true
    },

    phone: {
      type: String,
      required: true,
      trim: true
    },

    secondaryEmail: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true
    },

    altPhone: {
      type: String,
      trim: true,
      default: ''
    },

    website: {
      type: String,
      trim: true,
      sparse: true
    },

    principal: {
      name: { type: String, trim: true, default: '' },
      title: { type: String, trim: true, default: 'Principal' },
      email: { type: String, lowercase: true, trim: true, default: '' },
      signatureUrl: { type: String, trim: true, default: '' }
    },

    principalEmail: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true
    },

    adminName: {
      type: String,
      required: true,
      trim: true
    },

    adminEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      index: true
    },

    adminPhone: {
      type: String,
      required: true,
      trim: true
    },

    logoUrl: {
      type: String,
      default: ''
    },

    logoFileName: {
      type: String,
      default: ''
    },

    branding: {
      logo: { type: String, default: '' },
      darkLogo: { type: String, default: '' },
      lightLogo: { type: String, default: '' },
      monochromeLogo: { type: String, default: '' },
      watermark: { type: String, default: '' },
      schoolStamp: { type: String, default: '' },
      favicon: { type: String, default: '' },
      primaryColor: { type: String, default: '#1E3A8A' },
      secondaryColor: { type: String, default: '#F59E0B' },
      accentColor: { type: String, default: '#10B981' },
      darkColor: { type: String, default: '#111827' },
      lightColor: { type: String, default: '#F9FAFB' },
      sidebarBg: { type: String, default: '#1E293B' },
      headerBg: { type: String, default: '#FFFFFF' },
      fontFamily: { type: String, default: 'Inter, sans-serif' },
      headingFont: { type: String, default: 'Inter, sans-serif' },
      customCssUrl: { type: String, default: '' }
    },

    description: {
      type: String,
      trim: true,
      default: ''
    },

    programs: [
      {
        type: String,
        enum: ['english', 'mathematics', 'sciences', 'arts', 'vocational', 'sports']
      }
    ],

    academicConfig: {
      currentSession: { type: String, default: '' },
      currentTerm: { type: String, default: '' },
      termStartDate: { type: Date, default: null },
      termEndDate: { type: Date, default: null },
      nextTermBeginDate: { type: Date, default: null },
      assessmentStructure: {
        caWeight: { type: Number, default: 30 },
        examWeight: { type: Number, default: 70 },
        caBreakdown: {
          type: [{ name: String, maxScore: Number }],
          default: [
            { name: 'CA 1', maxScore: 15 },
            { name: 'CA 2', maxScore: 15 }
          ]
        }
      },
      gradingScale: {
        type: [{ grade: String, minScore: Number, maxScore: Number, remark: String }],
        default: [
          { grade: 'A', minScore: 70, maxScore: 100, remark: 'Excellent' },
          { grade: 'B', minScore: 60, maxScore: 69, remark: 'Very Good' },
          { grade: 'C', minScore: 50, maxScore: 59, remark: 'Good' },
          { grade: 'D', minScore: 45, maxScore: 49, remark: 'Fair' },
          { grade: 'E', minScore: 40, maxScore: 44, remark: 'Pass' },
          { grade: 'F', minScore: 0, maxScore: 39, remark: 'Fail' }
        ]
      },
      attendanceMode: {
        type: String,
        enum: ['daily', 'period', 'both'],
        default: 'daily'
      },
      reportCardSettings: {
        showPosition: { type: Boolean, default: true },
        showClassAverage: { type: Boolean, default: true },
        showPrincipalComment: { type: Boolean, default: true },
        showTeacherComment: { type: Boolean, default: true },
        showPsychomotorDomain: { type: Boolean, default: true }
      }
    },

    localization: {
      timezone: { type: String, default: 'Africa/Lagos' },
      currency: {
        code: { type: String, default: 'NGN' },
        symbol: { type: String, default: '₦' },
        name: { type: String, default: 'Nigerian Naira' }
      },
      dateFormat: { type: String, default: 'DD/MM/YYYY' },
      timeFormat: { type: String, default: '12h' },
      primaryLanguage: { type: String, default: 'en' },
      supportedLanguages: { type: [String], default: ['en'] }
    },

    authSettings: {
      allowStudentRegistration: { type: Boolean, default: false },
      allowParentRegistration: { type: Boolean, default: false },
      loginMethods: {
        email: { type: Boolean, default: true },
        usernameOrRegNo: { type: Boolean, default: true },
        phone: { type: Boolean, default: false }
      },
      passwordPolicy: {
        minLength: { type: Number, default: 8 },
        requireNumbers: { type: Boolean, default: true },
        requireSymbols: { type: Boolean, default: false }
      },
      sessionTimeoutMinutes: { type: Number, default: 120 },
      mfaRequired: { type: Boolean, default: false }
    },

    portalAccess: {
      studentPortal: { type: Boolean, default: true },
      parentPortal: { type: Boolean, default: true },
      teacherPortal: { type: Boolean, default: true },
      staffPortal: { type: Boolean, default: true },
      alumniPortal: { type: Boolean, default: false },
      applicantPortal: { type: Boolean, default: true }
    },

    featuresEnabled: {
      studentManagement: { type: Boolean, default: true },
      grading: { type: Boolean, default: true },
      feeManagement: { type: Boolean, default: false },
      attendance: { type: Boolean, default: true },
      parentPortal: { type: Boolean, default: false },
      staffManagement: { type: Boolean, default: false },
      analytics: { type: Boolean, default: false },
      mobileApps: { type: Boolean, default: false },
      onlineExamsAndCbt: { type: Boolean, default: true },
      feesAndAccounting: { type: Boolean, default: true },
      onlinePayments: { type: Boolean, default: true },
      hostelAndBoarding: { type: Boolean, default: false },
      transportation: { type: Boolean, default: false },
      libraryManagement: { type: Boolean, default: false },
      inventoryAndAssets: { type: Boolean, default: false },
      payrollAndHr: { type: Boolean, default: false },
      messagingAndSms: { type: Boolean, default: true },
      medicalAndHealth: { type: Boolean, default: false },
      eventsAndCalendar: { type: Boolean, default: true },
      assignmentsAndLms: { type: Boolean, default: true },
      alumniManagement: { type: Boolean, default: false },
      idCardGenerator: { type: Boolean, default: true },
      resultProcessing: { type: Boolean, default: true }
    },

    paymentConfig: {
      allowPartialPayments: { type: Boolean, default: true },
      allowInstallments: { type: Boolean, default: false },
      enabledGateways: { type: [String], default: ['paystack'] },
      publicKeys: {
        paystackPublicKey: { type: String, default: '' },
        flutterwavePublicKey: { type: String, default: '' },
        stripePublicKey: { type: String, default: '' },
        remitaMerchantId: { type: String, default: '' }
      },
      bankTransferDetails: {
        type: [
          {
            bankName: { type: String, default: '' },
            accountName: { type: String, default: '' },
            accountNumber: { type: String, default: '' },
            sortCode: { type: String, default: '' }
          }
        ],
        default: []
      },
      bankName: { type: String, default: '' },
      accountName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      sortCode: { type: String, default: '' }
    },

    communication: {
      supportEmail: { type: String, default: '' },
      supportPhone: { type: String, default: '' },
      helpdeskUrl: { type: String, default: '' },
      announcementBanner: {
        enabled: { type: Boolean, default: false },
        message: { type: String, default: '' },
        type: {
          type: String,
          enum: ['info', 'success', 'warning', 'danger'],
          default: 'info'
        },
        link: { type: String, default: '' }
      },
      socialLinks: {
        facebook: { type: String, default: '' },
        twitter: { type: String, default: '' },
        instagram: { type: String, default: '' },
        linkedin: { type: String, default: '' },
        youtube: { type: String, default: '' },
        whatsappSupport: { type: String, default: '' }
      }
    },

    pwaSettings: {
      name: { type: String, default: '' },
      shortName: { type: String, default: '' },
      themeColor: { type: String, default: '#1E3A8A' },
      backgroundColor: { type: String, default: '#FFFFFF' },
      displayMode: { type: String, default: 'standalone' },
      icon192: { type: String, default: '' },
      icon512: { type: String, default: '' }
    },

    settings: {
      tagline: { type: String, default: '' },
      motto: { type: String, default: '' },
      studentPortalEnabled: { type: Boolean, default: true },
      parentPortalEnabled: { type: Boolean, default: true },
      onlineExamsEnabled: { type: Boolean, default: true },
      feesEnabled: { type: Boolean, default: true },
      hostelEnabled: { type: Boolean, default: false },
      transportEnabled: { type: Boolean, default: false }
    },

    subscriptionPlan: {
      type: String,
      enum: ['starter', 'professional', 'enterprise'],
      default: 'starter'
    },

    subscriptionStatus: {
      type: String,
      enum: ['trial', 'active', 'inactive', 'suspended'],
      default: 'trial'
    },

    subscriptionStartDate: {
      type: Date,
      required: true,
      default: Date.now
    },

    subscriptionEndDate: {
      type: Date,
      sparse: true
    },

    storageUsed: { type: Number, default: 0 },
    storageLimit: { type: Number, default: 5000 },
    maxUsers: { type: Number, default: 100 },
    currentUsers: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'pending'],
      default: 'active',
      index: true
    },

    suspensionReason: {
      type: String,
      trim: true,
      default: ''
    },

    apiKey: {
      type: String,
      sparse: true,
      unique: true,
      index: true
    },

    isApiEnabled: {
      type: Boolean,
      default: false
    },

    demoRequestId: {
      type: Schema.Types.ObjectId,
      ref: 'DemoRequest',
      sparse: true
    },

    accountManager: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      sparse: true
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      sparse: true
    },

    lastModifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      sparse: true
    },

    tags: [String],

    internalNotes: {
      type: String,
      trim: true,
      default: ''
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },

    deletedAt: {
      type: Date,
      sparse: true
    },

    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      sparse: true
    }
  },
  { timestamps: true }
);

schoolSchema.index({ schoolName: 1, email: 1 });
schoolSchema.index({ subscriptionStatus: 1 });
schoolSchema.index({ status: 1 });
schoolSchema.index({ schoolId: 1, status: 1 });
schoolSchema.index({ email: 1 });
schoolSchema.index({ createdAt: -1 });
schoolSchema.index({ subdomain: 1, status: 1 });
schoolSchema.index({ customDomain: 1, status: 1 });

schoolSchema.virtual('displayName').get(function () {
  return `${this.schoolName}${this.abbreviation ? ` (${this.abbreviation})` : ''}`;
});

schoolSchema.methods.generateSchoolId = function () {
  if (!this.abbreviation && !this.schoolName) {
    throw new Error('School name or abbreviation is required to generate ID');
  }

  const abbrev = (this.abbreviation || this.schoolName.substring(0, 3)).toUpperCase();
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  this.schoolId = `SCH-${abbrev}-${random}`;
  return this.schoolId;
};

schoolSchema.methods.generateApiKey = function () {
  this.apiKey = `sch_${crypto.randomBytes(32).toString('hex')}`;
  this.isApiEnabled = true;
  return this.apiKey;
};

schoolSchema.methods.softDelete = function (userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  this.status = 'inactive';
  return this.save();
};

schoolSchema.methods.toJSON = function () {
  const obj = this.toObject({ virtuals: true });
  delete obj.apiKey;
  delete obj.__v;
  return obj;
};

schoolSchema.query.active = function () {
  return this.where({ isDeleted: false });
};

schoolSchema.pre('validate', function (next) {
  if (typeof this.principal === 'string') {
    const principalName = this.principal;
    this.principal = {
      name: principalName,
      title: 'Principal',
      email: this.principalEmail || '',
      signatureUrl: ''
    };
  }
  next();
});

schoolSchema.pre('save', function (next) {
  if (!this.schoolId) {
    try {
      this.generateSchoolId();
    } catch (err) {
      return next(err);
    }
  }

  if (this.logoUrl && (!this.branding || !this.branding.logo)) {
    if (!this.branding) this.branding = {};
    this.branding.logo = this.logoUrl;
  } else if (this.branding?.logo && !this.logoUrl) {
    this.logoUrl = this.branding.logo;
  }

  if (this.principalEmail && (!this.principal || !this.principal.email)) {
    if (!this.principal) this.principal = {};
    this.principal.email = this.principalEmail;
  } else if (this.principal?.email && !this.principalEmail) {
    this.principalEmail = this.principal.email;
  }

  next();
});

schoolSchema.pre(/^find/, function (next) {
  if (!this.getOptions().includeDeleted) {
    this.where({ isDeleted: false });
  }
  next();
});

schoolSchema.pre(/^countDocuments/, function (next) {
  if (!this.getOptions().includeDeleted) {
    this.where({ isDeleted: false });
  }
  next();
});

const School = model('School', schoolSchema);

module.exports = School;
module.exports.default = School;
