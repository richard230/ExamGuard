const crypto = require('crypto');
const mongoose = require('mongoose');
const ApiKey = require('../models/ApiKey');
const School = require('../models/School');

const apiKeyAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing or invalid API key'
      });
    }

    const plainKey = authHeader.slice('Bearer '.length).trim();
    if (!plainKey) {
      return res.status(401).json({
        error: 'Missing or invalid API key'
      });
    }

    const keyHash = crypto
      .createHash('sha256')
      .update(plainKey)
      .digest('hex');

    // ApiKey.school is a string identifier, not a School ObjectId reference.
    const apiKey = await ApiKey.findOne({ keyHash })
      .populate('createdBy', 'name email');

    if (!apiKey) {
      return res.status(401).json({
        error: 'Invalid API key'
      });
    }

    if (apiKey.status !== 'active') {
      return res.status(403).json({
        error: 'API key is inactive or revoked'
      });
    }

    if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
      return res.status(403).json({
        error: 'API key has expired'
      });
    }

    // Resolve the key's school string (Mongo ID, public school ID, or subdomain)
    // to the canonical School document. Result.schoolId is an ObjectId, so
    // downstream queries must use school._id rather than the original string.
    const schoolKey = String(apiKey.school || '').trim();

    if (!schoolKey) {
      return res.status(403).json({
        error: 'API key is not associated with a school.'
      });
    }

    const schoolConditions = [
      { schoolId: schoolKey.toUpperCase() },
      { subdomain: schoolKey.toLowerCase() },
      { customDomain: schoolKey.toLowerCase() }
    ];

    if (mongoose.Types.ObjectId.isValid(schoolKey)) {
      schoolConditions.unshift({ _id: schoolKey });
    }

    const school = await School.findOne({
      $or: schoolConditions,
      status: 'active',
      isDeleted: { $ne: true }
    }).select('_id schoolId schoolName subdomain customDomain');

    if (!school) {
      return res.status(403).json({
        error: 'API key school was not found or is inactive.'
      });
    }

    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    if (!apiKey.usage) {
      apiKey.usage = {
        totalRequests: 0,
        requestsThisHour: 0
      };
    }

    if (!apiKey.rateLimit) {
      apiKey.rateLimit = {
        requestsPerHour: 1000,
        requestsPerDay: 10000
      };
    }

    if (!apiKey.usage.lastUsedAt || apiKey.usage.lastUsedAt < hourAgo) {
      apiKey.usage.requestsThisHour = 0;
    }

    if (
      apiKey.usage.requestsThisHour >=
      apiKey.rateLimit.requestsPerHour
    ) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Maximum ${apiKey.rateLimit.requestsPerHour} requests per hour`
      });
    }

    if (
      apiKey.usage.totalRequests >=
      apiKey.rateLimit.requestsPerDay
    ) {
      return res.status(429).json({
        error: 'Daily limit exceeded',
        message: `Maximum ${apiKey.rateLimit.requestsPerDay} requests per day`
      });
    }

    if (
      req.requiredPermission &&
      !apiKey.permissions.includes(req.requiredPermission)
    ) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: req.requiredPermission
      });
    }

    apiKey.usage.lastUsedAt = now;
    apiKey.usage.requestsThisHour += 1;
    apiKey.usage.totalRequests += 1;
    await apiKey.save();

    req.apiKey = apiKey;
    req.school = school;
    req.schoolId = school._id;

    return next();
  } catch (err) {
    console.error('API key authentication error:', err);
    return res.status(500).json({
      error: 'API key authentication failed.'
    });
  }
};

module.exports = apiKeyAuth;
