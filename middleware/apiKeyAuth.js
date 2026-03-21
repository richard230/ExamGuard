const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');

const apiKeyAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid API key' });
    }

    const plainKey = authHeader.substring(7); // Remove 'Bearer ' prefix
    const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');

    // Find the API key
    const apiKey = await ApiKey.findOne({ keyHash })
      .populate('school')
      .populate('createdBy', 'name email');

    if (!apiKey) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Check if key is active
    if (apiKey.status !== 'active') {
      return res.status(403).json({ error: 'API key is inactive or revoked' });
    }

    // Check if key has expired
    if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
      return res.status(403).json({ error: 'API key has expired' });
    }

    // Check rate limits
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Reset hourly counter if needed
    if (!apiKey.usage.lastUsedAt || apiKey.usage.lastUsedAt < hourAgo) {
      apiKey.usage.requestsThisHour = 0;
    }

    // Reset daily counter if needed
    // (In production, you'd track this separately)

    // Check limits
    if (apiKey.usage.requestsThisHour >= apiKey.rateLimit.requestsPerHour) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        message: `Maximum ${apiKey.rateLimit.requestsPerHour} requests per hour`
      });
    }

    if (apiKey.usage.totalRequests >= apiKey.rateLimit.requestsPerDay) {
      return res.status(429).json({ 
        error: 'Daily limit exceeded',
        message: `Maximum ${apiKey.rateLimit.requestsPerDay} requests per day`
      });
    }

    // Check permissions
    if (req.requiredPermission && !apiKey.permissions.includes(req.requiredPermission)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: req.requiredPermission
      });
    }

    // Update usage statistics
    apiKey.usage.lastUsedAt = now;
    apiKey.usage.requestsThisHour++;
    apiKey.usage.totalRequests++;
    await apiKey.save();

    // Attach to request
    req.apiKey = apiKey;
    req.school = apiKey.school;

    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = apiKeyAuth;
