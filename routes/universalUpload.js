const express = require('express');
const router = express.Router();
const UniversalUpload = require('../models/UniversalUpload');
const School = require('../models/School');
const Result = require('../models/Result');
const { authMiddleware } = require('./auth');
const crypto = require('crypto');

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

// ===== ASYNC PROCESSING FUNCTION =====
async function processUploadAsync(uploadId, school, results) {
  try {
    const upload = await UniversalUpload.findById(uploadId);
    
    let successCount = 0;
    let failureCount = 0;
    const errors = [];

    for (let i = 0; i < results.length; i++) {
      try {
        const record = results[i];
        
        // Upsert logic
        const query = { 
          student_id: record.student_id,
          schoolId: school.schoolId,
          session: upload.session,
          class: upload.class,
          subject: upload.subject
        };

        const updateData = {
          student_id: record.student_id,
          student_name: record.student_name,
          schoolId: school.schoolId,
          schoolName: school.schoolName,
          session: upload.session,
          term: upload.term,
          class: upload.class,
          subject: upload.subject,
          ca1_score: record.ca1_score || 0,
          ca2_score: record.ca2_score || 0,
          midterm_score: record.midterm_score || 0,
          exam_score: record.exam_score || 0,
          grade: record.grade || 'N/A',
          remarks: record.remarks || '',
          lastUpdated: new Date(),
          sourceUploadId: upload.uploadId
        };

        await Result.findOneAndUpdate(query, updateData, { 
          upsert: true,
          new: true 
        });

        upload.results[i].recordStatus = 'processed';
        successCount++;
      } catch (err) {
        failureCount++;
        errors.push({
          recordIndex: i,
          studentId: results[i]?.student_id,
          error: err.message
        });
        upload.results[i].recordStatus = 'invalid';
        upload.results[i].errorMessage = err.message;
      }
    }

    // Update upload document with results
    upload.status = failureCount > 0 ? 'partially_failed' : 'completed';
    upload.processingStats.successCount = successCount;
    upload.processingStats.failureCount = failureCount;
    upload.processingStats.processingCompletedAt = new Date();
    upload.processingStats.processingDurationMs = 
      upload.processingStats.processingCompletedAt - upload.processingStats.processingStartedAt;
    upload.errors = errors;

    await upload.save();

    console.log(`✓ Upload ${upload.uploadId} completed: ${successCount} success, ${failureCount} failed`);
  } catch (err) {
    console.error('Error in processUploadAsync:', err);
    await UniversalUpload.findByIdAndUpdate(uploadId, { 
      status: 'failed',
      errors: [{ error: err.message }]
    });
  }
}

module.exports = router;
