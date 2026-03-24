const express = require('express');
const router = express.Router();
const UniversalUpload = require('../models/UniversalUpload');

/**
 * POST: Check if upload already exists
 */
router.post('/check-duplicate', async (req, res) => {
  try {
    const { schoolId, session, term, class: classLevel, subject } = req.body;

    if (!schoolId || !session || !term || !classLevel || !subject) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields for duplicate check'
      });
    }

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
 * POST: Update existing upload (replace data)
 */
router.post('/update-upload/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const { results, metadata } = req.body;

    const existingUpload = await UniversalUpload.findOne({ uploadId });

    if (!existingUpload) {
      return res.status(404).json({
        success: false,
        error: 'Upload not found'
      });
    }

    // Update results and metadata
    existingUpload.results = results;
    existingUpload.metadata = { ...existingUpload.metadata, ...metadata };
    existingUpload.processingStats.totalRecords = results.length;
    existingUpload.status = 'pending'; // Reset to pending for reprocessing
    existingUpload.metadata.retryCount = (existingUpload.metadata.retryCount || 0) + 1;

    await existingUpload.save();

    res.json({
      success: true,
      message: 'Upload updated successfully',
      uploadId: existingUpload.uploadId
    });

  } catch (err) {
    console.error('Error updating upload:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
