const express = require('express');
const router = express.Router();
const UniversalUpload = require('../models/UniversalUpload');

/**
 * POST: Check if upload already exists (duplicate check)
 */
router.post('/check-duplicate', async (req, res) => {
  try {
    const { schoolId, session, term, class: classLevel, subject } = req.body;

    if (!schoolId || !session || !term || !classLevel || !subject) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: schoolId, session, term, class, subject'
      });
    }

    console.log('Checking duplicate for:', { schoolId, session, term, classLevel, subject });

    // Check for exact duplicate
    const existingUpload = await UniversalUpload.findOne({
      schoolId,
      session,
      term,
      class: classLevel,
      subject,
      status: { $in: ['pending', 'processing', 'completed'] },
      isDeleted: false
    }).select('uploadId status processingStats createdAt results');

    if (existingUpload) {
      console.log('Duplicate found:', existingUpload.uploadId);
      return res.json({
        success: true,
        isDuplicate: true,
        uploadId: existingUpload.uploadId,
        status: existingUpload.status,
        recordCount: existingUpload.results.length,
        createdAt: existingUpload.createdAt,
        message: `This data was already uploaded on ${new Date(existingUpload.createdAt).toLocaleString()}`
      });
    }

    // No duplicate found
    console.log('No duplicate found');
    res.json({
      success: true,
      isDuplicate: false,
      message: 'No existing upload found. Safe to proceed.'
    });

  } catch (err) {
    console.error('Error checking duplicate:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST: Upload data to universal cloud
 */
router.post('/upload', async (req, res) => {
  try {
    const { schoolId, schoolName, session, term, class: classLevel, subject, resultType, results, shouldUpdate, metadata } = req.body;

    if (!schoolId || !schoolName || !session || !term || !classLevel || !subject || !results || results.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    console.log(`Uploading ${results.length} records for ${schoolId}/${session}/${term}/${classLevel}/${subject}`);

    // Check if upload already exists (for update scenario)
    let universalUpload = null;
    if (shouldUpdate) {
      universalUpload = await UniversalUpload.findOne({
        schoolId,
        session,
        term,
        class: classLevel,
        subject,
        isDeleted: false
      });
    }

    if (universalUpload) {
      // Update existing upload
      console.log('Updating existing upload:', universalUpload.uploadId);
      
      universalUpload.results = results;
      universalUpload.status = 'pending';
      universalUpload.processingStats = {
        totalRecords: results.length,
        successCount: 0,
        failureCount: 0,
        duplicateCount: 0,
        processingStartedAt: null,
        processingCompletedAt: null,
        processingDurationMs: 0
      };
      universalUpload.metadata = { ...universalUpload.metadata, ...metadata, operation: 'update' };
      
      await universalUpload.save();

      return res.json({
        success: true,
        message: 'Upload updated successfully',
        uploadId: universalUpload.uploadId,
        status: 'pending',
        recordCount: results.length
      });
    }

    // Create new upload
    const newUpload = new UniversalUpload({
      schoolId,
      schoolName,
      session,
      term,
      class: classLevel,
      subject,
      resultType: resultType || 'combined',
      results: results,
      status: 'pending',
      sourceType: 'school_backend',
      processingStats: {
        totalRecords: results.length,
        successCount: 0,
        failureCount: 0,
        duplicateCount: 0
      },
      metadata: {
        ...metadata,
        operation: 'create'
      }
    });

    await newUpload.save();

    console.log('Upload created:', newUpload.uploadId);

    res.json({
      success: true,
      message: 'Upload received successfully',
      uploadId: newUpload.uploadId,
      status: 'pending',
      recordCount: results.length
    });

  } catch (err) {
    console.error('Error uploading to cloud:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET: Get upload status
 */
router.get('/status/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;

    const upload = await UniversalUpload.findOne({ uploadId }).select('uploadId status processingStats createdAt');

    if (!upload) {
      return res.status(404).json({
        success: false,
        error: 'Upload not found'
      });
    }

    res.json({
      success: true,
      uploadId: upload.uploadId,
      status: upload.status,
      stats: upload.processingStats,
      createdAt: upload.createdAt
    });

  } catch (err) {
    console.error('Error getting upload status:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET: Get upload history for a school
 */
router.get('/history/:schoolId', async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { session, term } = req.query;

    const query = { schoolId, isDeleted: false };
    if (session) query.session = session;
    if (term) query.term = term;

    const uploads = await UniversalUpload.find(query)
      .select('uploadId session term class subject status processingStats createdAt metadata')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      schoolId,
      uploadCount: uploads.length,
      uploads
    });

  } catch (err) {
    console.error('Error fetching upload history:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET: Get all uploads for a school/session/term
 */
router.get('/uploads/:schoolId/:session/:term', async (req, res) => {
  try {
    const { schoolId, session, term } = req.params;

    const uploads = await UniversalUpload.find({
      schoolId,
      session,
      term,
      isDeleted: false
    })
    .select('uploadId class subject status processingStats createdAt')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      schoolId,
      session,
      term,
      uploadCount: uploads.length,
      uploads
    });

  } catch (err) {
    console.error('Error fetching uploads:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST: Delete/soft-delete an upload
 */
router.post('/delete/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;

    const upload = await UniversalUpload.findOne({ uploadId });

    if (!upload) {
      return res.status(404).json({
        success: false,
        error: 'Upload not found'
      });
    }

    await upload.softDelete(req.user?.id || null);

    res.json({
      success: true,
      message: 'Upload deleted successfully',
      uploadId
    });

  } catch (err) {
    console.error('Error deleting upload:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
