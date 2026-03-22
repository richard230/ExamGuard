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

// ===== ENHANCED VALIDATION MIDDLEWARE =====
const validateUniversalUpload = (req, res, next) => {
  const { schoolId, schoolName, session, term, class: className, subject, resultType, results } = req.body;

  // ===== STEP 1: Check for missing fields =====
  if (!schoolId || !schoolName || !session || !term || !className || !subject || !resultType || !Array.isArray(results)) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: schoolId, schoolName, session, term, class, subject, resultType, results (array)',
      code: 'MISSING_REQUIRED_FIELDS'
    });
  }

  // ===== STEP 2: Check for empty strings and whitespace-only values =====
  const emptyFields = [];
  
  if (typeof schoolId !== 'string' || !schoolId.trim()) {
    emptyFields.push('schoolId');
  }
  if (typeof schoolName !== 'string' || !schoolName.trim()) {
    emptyFields.push('schoolName');
  }
  if (typeof session !== 'string' || !session.trim()) {
    emptyFields.push('session');
  }
  if (typeof term !== 'string' || !term.trim()) {
    emptyFields.push('term');
  }
  if (typeof className !== 'string' || !className.trim()) {
    emptyFields.push('class');
  }
  if (typeof subject !== 'string' || !subject.trim()) {
    emptyFields.push('subject');
  }
  if (typeof resultType !== 'string' || !resultType.trim()) {
    emptyFields.push('resultType');
  }

  if (emptyFields.length > 0) {
    console.warn('Validation failed - Empty fields detected:', emptyFields);
    return res.status(400).json({
      success: false,
      error: `Empty required fields detected: ${emptyFields.join(', ')}`,
      code: 'EMPTY_REQUIRED_FIELDS',
      emptyFields,
      details: 'All required fields must contain non-whitespace values'
    });
  }

  // ===== STEP 3: Validate results array =====
  if (results.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Results array cannot be empty',
      code: 'EMPTY_RESULTS_ARRAY'
    });
  }

  // ===== STEP 4: Validate each result object =====
  const invalidResults = [];
  results.forEach((result, idx) => {
    if (!result.student_id || !result.student_name) {
      invalidResults.push({
        index: idx,
        reason: 'Missing student_id or student_name'
      });
    }
  });

  if (invalidResults.length > 0) {
    return res.status(400).json({
      success: false,
      error: `Invalid result records detected`,
      code: 'INVALID_RESULTS',
      invalidResults: invalidResults.slice(0, 5) // Return first 5 errors
    });
  }

  // ===== STEP 5: All validations passed =====
  console.log('✓ Validation passed for upload with', results.length, 'records');
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

    console.log('=== UNIVERSAL CLOUD SYNC INITIATED ===');
    console.log('School ID:', schoolId);
    console.log('Session:', session);
    console.log('Term:', term);
    console.log('Class:', className);
    console.log('Results count:', results.length);

    // ===== STEP 1: VERIFY SCHOOL =====
    console.log('Step 1: Verifying school...');
    const school = await School.findOne({ 
      schoolId: schoolId,
      status: 'active'
    });

    if (!school) {
      console.warn('School not found:', schoolId);
      return res.status(404).json({
        success: false,
        error: 'School not found or inactive',
        code: 'SCHOOL_NOT_FOUND',
        schoolId
      });
    }

    // Verify school name matches
    if (school.schoolName !== schoolName) {
      console.warn('School name mismatch:', { expected: school.schoolName, received: schoolName });
      return res.status(400).json({
        success: false,
        error: 'School name does not match registered school',
        code: 'SCHOOL_NAME_MISMATCH',
        expectedName: school.schoolName,
        receivedName: schoolName
      });
    }

    console.log('✓ School verified:', school._id);

    // ===== STEP 2: NORMALIZE TERM =====
    console.log('Step 2: Normalizing term...');
    const normalizedTerm = normalizeTerm(term);
    console.log('✓ Term normalized:', { original: term, normalized: normalizedTerm });

    // ===== STEP 3: CREATE UNIVERSAL UPLOAD DOCUMENT =====
    console.log('Step 3: Creating upload document...');
    const uploadDoc = new UniversalUpload({
      sourceType,
      schoolId: schoolId.trim(),
      schoolName: schoolName.trim(),
      schoolRef: school._id,
      session: session.trim(),
      term: normalizedTerm.trim(),
      class: className.trim(),
      subject: subject.trim(),
      resultType: resultType.trim(),
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
        recordStatus: 'pending'
      })),
      status: 'processing',
      uploadSource: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        backendUrl: metadata.backendUrl || null
      },
      metadata: {
        ...metadata,
        retryCount: 0,
        validationPassedAt: new Date()
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
    console.log('✓ Universal upload document created:', uploadDoc.uploadId);

    // ===== STEP 4: PROCESS RESULTS IN BACKGROUND =====
    console.log('Step 4: Queuing async processing...');
    processUploadAsync(uploadDoc._id, school, results).catch(err => {
      console.error('Error in background processing:', err);
      UniversalUpload.findByIdAndUpdate(uploadDoc._id, { 
        status: 'failed',
        errors: [{
          error: 'Background processing error: ' + err.message
        }]
      }).catch(updateErr => console.error('Failed to update status:', updateErr));
    });

    // ===== STEP 5: RETURN RESPONSE =====
    console.log('Step 5: Returning response...');
    res.status(202).json({
      success: true,
      message: 'Upload received and queued for processing',
      uploadId: uploadDoc.uploadId,
      status: 'processing',
      totalRecords: results.length,
      estimatedProcessingTime: `${Math.ceil(results.length / 100)} seconds`,
      schoolId,
      session,
      term: normalizedTerm
    });

  } catch (err) {
    console.error('=== ERROR IN UNIVERSAL UPLOAD ===');
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    
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
        error: 'Upload not found',
        uploadId: req.params.uploadId
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
        errorCount: upload.errors.length,
        upsertConfig: upload.upsertConfig
      }
    });
  } catch (err) {
    console.error('Error fetching upload status:', err);
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
    console.error('Error fetching uploads:', err);
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
        error: 'Upload not found',
        uploadId: req.params.uploadId
      });
    }

    res.json({
      success: true,
      data: {
        uploadId: upload.uploadId,
        status: upload.status,
        totalRecords: upload.processingStats.totalRecords,
        successCount: upload.processingStats.successCount || 0,
        failureCount: upload.processingStats.failureCount || 0,
        errors: upload.errors.slice(0, 10),
        totalErrors: upload.errors.length,
        results: upload.results.map((r, idx) => ({
          index: idx,
          student_id: r.student_id,
          student_name: r.student_name,
          recordStatus: r.recordStatus,
          errorMessage: r.errorMessage
        })).filter(r => r.errorMessage).slice(0, 10)
      }
    });
  } catch (err) {
    console.error('Error fetching errors:', err);
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
        error: 'Upload not found',
        uploadId: req.params.uploadId
      });
    }

    if (upload.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot retry completed upload',
        uploadId: upload.uploadId
      });
    }

    console.log('Retrying upload:', upload.uploadId);

    upload.status = 'processing';
    upload.metadata.retryCount = (upload.metadata.retryCount || 0) + 1;
    upload.processingStats.processingStartedAt = new Date();
    upload.processingStats.successCount = 0;
    upload.processingStats.failureCount = 0;
    upload.errors = [];
    await upload.save();

    const school = await School.findById(upload.schoolRef);
    processUploadAsync(upload._id, school, upload.results);

    res.json({
      success: true,
      message: 'Upload queued for retry',
      uploadId: upload.uploadId,
      retryCount: upload.metadata.retryCount,
      status: 'processing'
    });
  } catch (err) {
    console.error('Error retrying upload:', err);
    res.status(500).json({
      success: false,
      message: 'Error retrying upload',
      error: err.message
    });
  }
});

// ===== ASYNC PROCESSING FUNCTION - WITH FULL VALIDATION & ERROR HANDLING =====
async function processUploadAsync(uploadId, school, results) {
  let upload;
  
  try {
    upload = await UniversalUpload.findById(uploadId);
    
    if (!upload) {
      console.error('Upload document not found for ID:', uploadId);
      return;
    }

    let successCount = 0;
    let failureCount = 0;
    const errors = [];

    try {
      console.log('\n========================================');
      console.log('=== STARTING UPLOAD PROCESSING ===');
      console.log('========================================');
      console.log('Upload ID:', upload.uploadId);
      console.log('Session:', upload.session);
      console.log('Term:', upload.term);
      console.log('Class:', upload.class);
      console.log('Subject:', upload.subject);
      console.log('Total Records:', results.length);
      console.log('========================================\n');

      // ✅ VALIDATE CRITICAL FIELDS BEFORE PROCESSING
      console.log('Pre-processing validation...');
      const criticalFields = {
        session: upload.session,
        term: upload.term,
        class: upload.class,
        subject: upload.subject
      };

      const missingCriticalFields = [];
      for (const [field, value] of Object.entries(criticalFields)) {
        if (!value || (typeof value === 'string' && !value.trim())) {
          missingCriticalFields.push(field);
        }
      }

      if (missingCriticalFields.length > 0) {
        throw new Error(`Critical fields are empty or invalid: ${missingCriticalFields.join(', ')}. This error should have been caught by validation middleware.`);
      }

      console.log('✓ Pre-processing validation passed\n');

      // ✅ STEP 1: Get or create Session FIRST
      console.log('STEP 1: Creating/fetching Session...');
      let sessionDoc = await Session.findOne({ name: upload.session.trim() });
      
      if (!sessionDoc) {
        console.log(`  → Session "${upload.session}" not found, creating...`);
        sessionDoc = await Session.create({ 
          name: upload.session.trim(),
          is_active: true 
        });
        console.log(`  ✓ Created session with ID: ${sessionDoc._id}`);
      } else {
        console.log(`  ✓ Found existing session with ID: ${sessionDoc._id}`);
      }
      
      if (!sessionDoc || !sessionDoc._id) {
        throw new Error('Failed to create or fetch Session document');
      }

      // ✅ STEP 2: Get or create Term (with session reference)
      console.log('STEP 2: Creating/fetching Term...');
      let termDoc = await Term.findOne({ 
        name: upload.term.trim(),
        session: sessionDoc._id 
      });

      if (!termDoc) {
        console.log(`  → Term "${upload.term}" not found, creating...`);
        const termPayload = {
          name: upload.term.trim(),
          session: sessionDoc._id,
          startDate: new Date(),
          endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        };
        console.log(`  → Payload:`, JSON.stringify(termPayload, null, 2));
        
        termDoc = await Term.create(termPayload);
        console.log(`  ✓ Created term with ID: ${termDoc._id}`);
      } else {
        console.log(`  ✓ Found existing term with ID: ${termDoc._id}`);
      }

      if (!termDoc || !termDoc._id) {
        throw new Error('Failed to create or fetch Term document');
      }

      // ✅ STEP 3: Get or create Class
      console.log('STEP 3: Creating/fetching Class...');
      let classDoc = await Class.findOne({ name: upload.class.trim() });
      
      if (!classDoc) {
        console.log(`  → Class "${upload.class}" not found, creating...`);
        classDoc = await Class.create({ 
          name: upload.class.trim(),
          arms: [],
          teachers: [],
          subjects: []
        });
        console.log(`  ✓ Created class with ID: ${classDoc._id}`);
      } else {
        console.log(`  ✓ Found existing class with ID: ${classDoc._id}`);
      }

      if (!classDoc || !classDoc._id) {
        throw new Error('Failed to create or fetch Class document');
      }

      // ✅ STEP 4: Process each result record
      console.log(`\nSTEP 4: Processing ${results.length} student records...\n`);
      
      for (let i = 0; i < results.length; i++) {
        try {
          const record = results[i];
          const studentId = record.student_id;
          const studentName = record.student_name;
          const subjectName = (record.subject || upload.subject).trim();

          console.log(`  [${i + 1}/${results.length}] ${studentName} → ${subjectName}`);

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
            console.log(`      → Created student: ${studentDoc._id}`);
          } else {
            console.log(`      → Found existing student: ${studentDoc._id}`);
          }

          // ✅ GET OR CREATE SUBJECT
          let subjectDoc = await Subject.findOne({ name: subjectName });
          if (!subjectDoc) {
            subjectDoc = await Subject.create({ name: subjectName });
            console.log(`      → Created subject: ${subjectDoc._id}`);
          } else {
            console.log(`      → Found existing subject: ${subjectDoc._id}`);
          }

          // ✅ UPSERT RESULT
          const ca1 = parseFloat(record.ca1_score) || 0;
          const ca2 = parseFloat(record.ca2_score) || 0;
          const midterm = parseFloat(record.midterm_score) || 0;
          const exam = parseFloat(record.exam_score) || 0;

          const updateData = {
            student: studentDoc._id,
            session: sessionDoc._id,
            term: termDoc._id,
            class: classDoc._id,
            subject: subjectDoc._id,
            ca1_score: ca1,
            ca2_score: ca2,
            midterm_score: midterm,
            exam_score: exam,
            score: ca1 + ca2 + midterm + exam,
            grade: record.grade || '',
            remarks: record.remarks || '',
            status: 'Published'
          };

          const result = await Result.findOneAndUpdate(
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
          console.log(`      ✓ Upserted result: ${result._id}`);
          
        } catch (recordErr) {
          failureCount++;
          const errorMsg = recordErr.message || 'Unknown error';
          console.error(`      ✗ FAILED: ${errorMsg}`);
          
          errors.push({
            recordIndex: i,
            studentId: results[i]?.student_id,
            studentName: results[i]?.student_name,
            error: errorMsg,
            timestamp: new Date()
          });
          
          if (upload.results[i]) {
            upload.results[i].recordStatus = 'failed';
            upload.results[i].errorMessage = errorMsg;
          }
        }
      }

      console.log('\n========================================');
      console.log('=== PROCESSING COMPLETE ===');
      console.log('========================================');
      console.log(`Success: ${successCount}/${results.length}`);
      console.log(`Failed: ${failureCount}/${results.length}`);
      console.log('========================================\n');

    } catch (setupErr) {
      // Error during setup phase (Session, Term, Class creation)
      console.error('\n❌ ERROR DURING SETUP PHASE ❌');
      console.error('Error message:', setupErr.message);
      console.error('Error stack:', setupErr.stack);
      
      failureCount = results.length;
      errors.push({
        phase: 'setup',
        error: `Setup error: ${setupErr.message}`,
        stack: setupErr.stack,
        timestamp: new Date()
      });
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

    console.log('\n✓✓✓ UPLOAD FINALIZED ✓✓��');
    console.log(`Upload ID: ${upload.uploadId}`);
    console.log(`Status: ${upload.status}`);
    console.log(`Success: ${successCount}/${results.length}`);
    console.log(`Failed: ${failureCount}/${results.length}`);
    console.log('✓✓✓ ═════════════════════ ✓✓✓\n');

  } catch (fatalErr) {
    console.error('\n!!! FATAL ERROR !!!');
    console.error('Error message:', fatalErr.message);
    console.error('Error stack:', fatalErr.stack);
    
    try {
      if (upload) {
        await UniversalUpload.findByIdAndUpdate(uploadId, { 
          status: 'failed',
          'processingStats.processingCompletedAt': new Date(),
          errors: [{
            phase: 'fatal',
            error: `Fatal error: ${fatalErr.message}`,
            stack: fatalErr.stack,
            timestamp: new Date()
          }]
        });
        console.log('✓ Upload status updated to failed');
      }
    } catch (updateErr) {
      console.error('Failed to update upload status:', updateErr.message);
    }
  }
}

module.exports = router;
