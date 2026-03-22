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
// ===== ASYNC PROCESSING FUNCTION - WITH PROPER AWAIT =====
// ===== ASYNC PROCESSING FUNCTION - WITH PROPER AWAIT & ERROR HANDLING =====
async function processUploadAsync(uploadId, school, results) {
  try {
    const upload = await UniversalUpload.findById(uploadId);
    
    let successCount = 0;
    let failureCount = 0;
    const errors = [];

    try {
      console.log('=== Starting Upload Processing ===');
      console.log('Upload ID:', upload.uploadId);
      console.log('Session:', upload.session);
      console.log('Term:', upload.term);
      console.log('Class:', upload.class);

      // ✅ STEP 1: Get or create Session FIRST
      console.log('Step 1: Creating/fetching Session...');
      let sessionDoc = await Session.findOne({ name: upload.session });
      
      if (!sessionDoc) {
        console.log('Session not found, creating:', upload.session);
        sessionDoc = await Session.create({ 
          name: upload.session,
          is_active: true 
        });
        console.log('✓ Created session:', sessionDoc._id);
      } else {
        console.log('✓ Found existing session:', sessionDoc._id);
      }
      
      // ✅ VALIDATE Session document exists and has _id
      if (!sessionDoc || !sessionDoc._id) {
        throw new Error('Failed to create/fetch Session - no _id returned');
      }

      // ✅ STEP 2: Get or create Term (with session reference)
      console.log('Step 2: Creating/fetching Term...');
      
      // ✅ CRITICAL: Ensure sessionDoc._id is a valid ObjectId string
      const sessionRefId = sessionDoc._id.toString();
      console.log('Using session reference:', sessionRefId);
      
      let termDoc = await Term.findOne({ 
        name: upload.term, 
        session: sessionRefId 
      });
      
      if (!termDoc) {
        console.log('Term not found, creating:', upload.term);
        const termPayload = {
          name: upload.term,
          session: sessionRefId, // ✅ Use explicit string reference
          startDate: new Date(),
          endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        };
        console.log('Term payload:', JSON.stringify(termPayload));
        
        termDoc = await Term.create(termPayload);
        
        if (!termDoc) {
          throw new Error('Term.create() returned null or undefined');
        }
        console.log('✓ Created term:', termDoc._id);
      } else {
        console.log('✓ Found existing term:', termDoc._id);
      }

      // ✅ VALIDATE Term document exists and has _id
      if (!termDoc || !termDoc._id) {
        throw new Error('Failed to create/fetch Term - no _id returned. Session ref: ' + sessionRefId);
      }

      // ✅ STEP 3: Get or create Class
      console.log('Step 3: Creating/fetching Class...');
      let classDoc = await Class.findOne({ name: upload.class });
      
      if (!classDoc) {
        console.log('Class not found, creating:', upload.class);
        classDoc = await Class.create({ 
          name: upload.class,
          arms: [],
          teachers: [],
          subjects: []
        });
        console.log('✓ Created class:', classDoc._id);
      } else {
        console.log('✓ Found existing class:', classDoc._id);
      }

      if (!classDoc || !classDoc._id) {
        throw new Error('Failed to create/fetch Class');
      }

      // ✅ STEP 4: Process each result record
      console.log(`Step 4: Processing ${results.length} records...`);
      
      for (let i = 0; i < results.length; i++) {
        try {
          const record = results[i];
          const studentId = record.student_id;
          const studentName = record.student_name;
          const subjectName = record.subject || upload.subject;

          console.log(`  [${i + 1}/${results.length}] Processing: ${studentName} - ${subjectName}`);

          // ✅ GET OR CREATE STUDENT
          let studentDoc = await Student.findOne({ 
            $or: [
              { _id: studentId },
              { regNo: studentId }
            ]
          });
          
          if (!studentDoc) {
            studentDoc = await Student.create({
              name: studentName,
              regNo: studentId,
              school: school._id
            });
          }

          // ✅ GET OR CREATE SUBJECT
          let subjectDoc = await Subject.findOne({ name: subjectName });
          if (!subjectDoc) {
            subjectDoc = await Subject.create({ name: subjectName });
          }

          // ✅ UPSERT RESULT
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

          await Result.findOneAndUpdate(
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
              runValidators: false
            }
          );

          upload.results[i].recordStatus = 'processed';
          successCount++;
          console.log(`    ✓ Success`);
          
        } catch (recordErr) {
          failureCount++;
          console.error(`    ✗ Error:`, recordErr.message);
          
          errors.push({
            recordIndex: i,
            studentId: results[i]?.student_id,
            error: recordErr.message,
            timestamp: new Date()
          });
          
          if (upload.results[i]) {
            upload.results[i].recordStatus = 'invalid';
            upload.results[i].errorMessage = recordErr.message;
          }
        }
      }

      console.log(`\n=== Processing Complete ===`);
      console.log(`Success: ${successCount}, Failed: ${failureCount}`);

    } catch (setupErr) {
      // Error during setup phase
      console.error('ERROR DURING SETUP:', setupErr.message);
      console.error('Stack:', setupErr.stack);
      
      failureCount = results.length;
      errors.push({
        error: `Setup error: ${setupErr.message}`,
        stack: setupErr.stack,
        timestamp: new Date()
      });
    }

    // ✅ UPDATE UPLOAD DOCUMENT
    upload.status = failureCount === 0 ? 'completed' : failureCount === results.length ? 'failed' : 'partially_failed';
    upload.processingStats.successCount = successCount;
    upload.processingStats.failureCount = failureCount;
    upload.processingStats.processingCompletedAt = new Date();
    upload.processingStats.processingDurationMs = 
      upload.processingStats.processingCompletedAt - upload.processingStats.processingStartedAt;
    upload.errors = errors;

    await upload.save();

    console.log(`\n✓✓✓ UPLOAD COMPLETE: ${upload.uploadId}`);
    console.log(`Status: ${upload.status}`);
    console.log(`Success: ${successCount}/${results.length}`);

  } catch (fatalErr) {
    console.error('\n!!! FATAL ERROR !!!');
    console.error('Error:', fatalErr.message);
    console.error('Stack:', fatalErr.stack);
    
    try {
      await UniversalUpload.findByIdAndUpdate(uploadId, { 
        status: 'failed',
        errors: [{
          error: `Fatal error: ${fatalErr.message}`,
          stack: fatalErr.stack,
          timestamp: new Date()
        }]
      });
    } catch (updateErr) {
      console.error('Failed to update upload status:', updateErr.message);
    }
  }
}

module.exports = router;
