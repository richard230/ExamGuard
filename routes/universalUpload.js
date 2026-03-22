const express = require('express');
const router = express.Router();
const UniversalUpload = require('../models/UniversalUpload');
const School = require('../models/School');
const Result = require('../models/Result');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const Session = require('../models/Session');
const Term = require('../models/Term');
const Class = require('../models/Class');
const { authMiddleware } = require('./auth');

// ===== HELPER: NORMALIZE TERM VALUE =====
function normalizeTerm(term) {
  const termMap = {
    'FIRST TERM': 'First Term',
    'SECOND TERM': 'Second Term',
    'THIRD TERM': 'Third Term',
    'first term': 'First Term',
    'second term': 'Second Term',
    'third term': 'Third Term'
  };
  
  return termMap[term] || term;
}

// ===== VALIDATION MIDDLEWARE =====
const validateUniversalUpload = (req, res, next) => {
  const { schoolId, schoolName, session, term, class: className, subject, resultType, results } = req.body;

  if (!schoolId || !schoolName || !session || !term || !className || !subject || !resultType || !Array.isArray(results)) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: schoolId, schoolName, session, term, class, subject, resultType, results (array)'
    });
  }

  if (results.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Results array cannot be empty'
    });
  }

  next();
};

/**
 * POST /api/cloud/sync
 * Universal Cloud Sync - From School Backend
 */
router.post('/sync', validateUniversalUpload, async (req, res) => {
  try {
    const {
      schoolId,
      schoolName,
      session,
      term,
      class: className,
      subject,
      resultType,
      results,
      sourceType = 'school_backend',
      upsert = true,
      metadata = {}
    } = req.body;

    // ===== STEP 1: VERIFY SCHOOL =====
    const school = await School.findOne({ 
      schoolId: schoolId,
      status: 'active'
    });

    if (!school) {
      return res.status(404).json({
        success: false,
        error: 'School not found or inactive',
        code: 'SCHOOL_NOT_FOUND'
      });
    }

    // Verify school name matches
    if (school.schoolName !== schoolName) {
      return res.status(400).json({
        success: false,
        error: 'School name does not match registered school',
        code: 'SCHOOL_NAME_MISMATCH'
      });
    }

    // ===== STEP 2: NORMALIZE TERM =====
    const normalizedTerm = normalizeTerm(term);

    // ===== STEP 3: CREATE UNIVERSAL UPLOAD DOCUMENT =====
    const uploadDoc = new UniversalUpload({
      sourceType,
      schoolId,
      schoolName,
      schoolRef: school._id,
      session,
      term: normalizedTerm,
      class: className,
      subject,
      resultType,
      results: results.map(r => ({
        student_id: r.student_id,
        student_name: r.student_name,
        ca1_score: r.ca1_score || null,
        ca2_score: r.ca2_score || null,
        midterm_score: r.midterm_score || null,
        exam_score: r.exam_score || null,
        grade: r.grade || null,
        remarks: r.remarks || null,
        subject: r.subject || null,
        recordStatus: 'valid'
      })),
      status: 'processing',
      uploadSource: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        backendUrl: metadata.backendUrl || null
      },
      metadata: {
        ...metadata,
        retryCount: 0
      },
      upsertConfig: {
        shouldUpdate: upsert,
        shouldCreate: upsert
      },
      processingStats: {
        totalRecords: results.length,
        processingStartedAt: new Date()
      }
    });

    await uploadDoc.save();

    console.log('✓ Universal upload created:', uploadDoc.uploadId);

    // ===== STEP 4: PROCESS RESULTS IN BACKGROUND =====
    processUploadAsync(uploadDoc._id, school, results).catch(err => {
      console.error('Error processing upload:', err);
      UniversalUpload.findByIdAndUpdate(uploadDoc._id, { status: 'failed' });
    });

    // ===== STEP 5: RETURN RESPONSE =====
    res.status(202).json({
      success: true,
      message: 'Upload received and queued for processing',
      uploadId: uploadDoc.uploadId,
      status: 'processing',
      totalRecords: results.length,
      estimatedProcessingTime: `${Math.ceil(results.length / 100)} seconds`
    });

  } catch (err) {
    console.error('Error in universal upload:', err);
    res.status(500).json({
      success: false,
      message: 'Error processing upload',
      error: err.message,
      code: 'UPLOAD_FAILED'
    });
  }
});

/**
 * GET /api/cloud/sync/:uploadId
 * Get Upload Status
 */
router.get('/sync/:uploadId', async (req, res) => {
  try {
    const upload = await UniversalUpload.findOne({ uploadId: req.params.uploadId })
      .populate('schoolRef', 'schoolName schoolId')
      .select('-results');

    if (!upload) {
      return res.status(404).json({
        success: false,
        error: 'Upload not found'
      });
    }

    res.json({
      success: true,
      data: {
        uploadId: upload.uploadId,
        status: upload.status,
        schoolId: upload.schoolId,
        schoolName: upload.schoolName,
        session: upload.session,
        term: upload.term,
        class: upload.class,
        subject: upload.subject,
        uploadTimestamp: upload.uploadTimestamp,
        processingStats: upload.processingStats,
        errorCount: upload.errors.length
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error fetching upload status',
      error: err.message
    });
  }
});

/**
 * GET /api/cloud/sync
 * List Universal Uploads (with filters)
 */
router.get('/sync', async (req, res) => {
  try {
    const { schoolId, status, session, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    let query = { isDeleted: false };

    if (schoolId) query.schoolId = schoolId;
    if (status) query.status = status;
    if (session) query.session = session;

    const uploads = await UniversalUpload.find(query)
      .populate('schoolRef', 'schoolName schoolId')
      .select('-results')
      .sort({ uploadTimestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await UniversalUpload.countDocuments(query);

    res.json({
      success: true,
      data: uploads,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error fetching uploads',
      error: err.message
    });
  }
});

/**
 * GET /api/cloud/sync/:uploadId/errors
 * Get detailed errors for an upload
 */
router.get('/sync/:uploadId/errors', async (req, res) => {
  try {
    const upload = await UniversalUpload.findOne({ uploadId: req.params.uploadId });

    if (!upload) {
      return res.status(404).json({
        success: false,
        error: 'Upload not found'
      });
    }

    res.json({
      success: true,
      data: {
        uploadId: upload.uploadId,
        status: upload.status,
        totalRecords: upload.processingStats.totalRecords,
        errors: upload.errors.slice(0, 10),
        totalErrors: upload.errors.length,
        results: upload.results.map((r, idx) => ({
          index: idx,
          student_id: r.student_id,
          student_name: r.student_name,
          recordStatus: r.recordStatus,
          errorMessage: r.errorMessage
        })).filter(r => r.errorMessage)
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error fetching errors',
      error: err.message
    });
  }
});

/**
 * POST /api/cloud/sync/:uploadId/retry
 * Retry Failed Upload
 */
router.post('/sync/:uploadId/retry', async (req, res) => {
  try {
    const upload = await UniversalUpload.findOne({ uploadId: req.params.uploadId });

    if (!upload) {
      return res.status(404).json({
        success: false,
        error: 'Upload not found'
      });
    }

    if (upload.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot retry completed upload'
      });
    }

    upload.status = 'processing';
    upload.metadata.retryCount = (upload.metadata.retryCount || 0) + 1;
    upload.processingStats.processingStartedAt = new Date();
    await upload.save();

    const school = await School.findById(upload.schoolRef);
    processUploadAsync(upload._id, school, upload.results);

    res.json({
      success: true,
      message: 'Upload queued for retry',
      uploadId: upload.uploadId,
      retryCount: upload.metadata.retryCount
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error retrying upload',
      error: err.message
    });
  }
});

// ===== ASYNC PROCESSING FUNCTION - FULLY REFACTORED =====
// ===== ASYNC PROCESSING FUNCTION - FULLY CORRECTED =====
async function processUploadAsync(uploadId, school, results) {
  try {
    const upload = await UniversalUpload.findById(uploadId);
    
    let successCount = 0;
    let failureCount = 0;
    const errors = [];

    // ✅ PRE-FETCH/CREATE ALL LOOKUPS TO AVOID N+1 QUERIES
    console.log('Pre-fetching/creating reference documents...');
    
    // ✅ STEP 1: Get or create Session FIRST
    let sessionDoc = await Session.findOne({ name: upload.session });
    if (!sessionDoc) {
      sessionDoc = await Session.create({ 
        name: upload.session,
        is_active: true 
      });
      console.log(`Created new session: ${upload.session}`);
    }
    console.log(`Using session ID: ${sessionDoc._id}`);
    
    // ✅ STEP 2: Get or create Term (with session reference)
    let termDoc = await Term.findOne({ name: upload.term });
    if (!termDoc) {
      termDoc = await Term.create({ 
        name: upload.term,
        session: sessionDoc._id, // ✅ REFERENCE TO SESSION
        startDate: new Date(),
        endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days from now
      });
      console.log(`Created new term: ${upload.term} (with session: ${sessionDoc._id})`);
    }
    console.log(`Using term ID: ${termDoc._id}`);
    
    // ✅ STEP 3: Get or create Class
    let classDoc = await Class.findOne({ name: upload.class });
    if (!classDoc) {
      classDoc = await Class.create({ 
        name: upload.class,
        arms: [],
        teachers: [],
        subjects: []
      });
      console.log(`Created new class: ${upload.class}`);
    }
    console.log(`Using class ID: ${classDoc._id}`);

    // ✅ STEP 4: Process each result record
    for (let i = 0; i < results.length; i++) {
      try {
        const record = results[i];
        const studentId = record.student_id;
        const studentName = record.student_name;
        const subjectName = record.subject || upload.subject;

        console.log(`Processing ${i + 1}/${results.length}: ${studentName} - ${subjectName}`);

        // ✅ GET OR CREATE STUDENT
        let studentDoc = await Student.findOne({ 
          $or: [
            { _id: studentId }, // If it's already an ObjectId
            { regNo: studentId }  // Or if it's a registration number
          ]
        });
        
        if (!studentDoc) {
          // Create student if doesn't exist
          studentDoc = await Student.create({
            name: studentName,
            regNo: studentId,
            school: school._id
          });
          console.log(`Created new student: ${studentName}`);
        }

        // ✅ GET OR CREATE SUBJECT
        let subjectDoc = await Subject.findOne({ name: subjectName });
        if (!subjectDoc) {
          subjectDoc = await Subject.create({ name: subjectName });
          console.log(`Created new subject: ${subjectName}`);
        }

        // ✅ UPSERT RESULT WITH ALL REQUIRED OBJECTIDS
        const updateData = {
          student: studentDoc._id,
          session: sessionDoc._id,
          term: termDoc._id,
          class: classDoc._id,
          subject: subjectDoc._id,
          ca1_score: parseFloat(record.ca1_score) || 0,
          ca2_score: parseFloat(record.ca2_score) || 0,
          midterm_score: parseFloat(record.midterm_score) || 0,
          exam_score: parseFloat(record.exam_score) || 0,
          score: (parseFloat(record.ca1_score) || 0) + (parseFloat(record.ca2_score) || 0) + (parseFloat(record.midterm_score) || 0) + (parseFloat(record.exam_score) || 0),
          grade: record.grade || '',
          remarks: record.remarks || '',
          status: 'Published'
        };

        const upsertedResult = await Result.findOneAndUpdate(
          {
            student: studentDoc._id,
            session: sessionDoc._id,
            term: termDoc._id,
            class: classDoc._id,
            subject: subjectDoc._id
          },
          updateData,
          { 
            upsert: true,
            new: true,
            runValidators: true
          }
        );

        console.log(`✓ Result upserted for ${studentName} in ${subjectName}`);
        upload.results[i].recordStatus = 'processed';
        successCount++;
      } catch (err) {
        failureCount++;
        console.error(`✗ Record ${i} failed:`, err.message);
        
        errors.push({
          recordIndex: i,
          studentId: results[i]?.student_id,
          error: err.message
        });
        upload.results[i].recordStatus = 'invalid';
        upload.results[i].errorMessage = err.message;
      }
    }

    // ✅ UPDATE UPLOAD DOCUMENT WITH RESULTS
    upload.status = failureCount === 0 ? 'completed' : failureCount === results.length ? 'failed' : 'partially_failed';
    upload.processingStats.successCount = successCount;
    upload.processingStats.failureCount = failureCount;
    upload.processingStats.processingCompletedAt = new Date();
    upload.processingStats.processingDurationMs = 
      upload.processingStats.processingCompletedAt - upload.processingStats.processingStartedAt;
    upload.errors = errors;

    await upload.save();

    console.log(`✓✓✓ Upload ${upload.uploadId} COMPLETED: ${successCount} success, ${failureCount} failed`);
  } catch (err) {
    console.error('FATAL Error in processUploadAsync:', err);
    await UniversalUpload.findByIdAndUpdate(uploadId, { 
      status: 'failed',
      errors: [{ error: err.message }]
    });
  }
}

module.exports = router;
