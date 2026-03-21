const mongoose = require('mongoose');
const crypto = require('crypto');

const apiKeySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  school: {
  type: String,
  required: true,
  index: true
},
  key: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  keyHash: {
    type: String,
    required: true,
    index: true
  },
  description: String,
  permissions: {
    type: [String],
    enum: ['results.upload', 'results.read', 'results.delete', 'bulk.operations'],
    default: ['results.upload', 'results.read']
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'revoked'],
    default: 'active'
  },
  rateLimit: {
    requestsPerHour: {
      type: Number,
      default: 1000
    },
    requestsPerDay: {
      type: Number,
      default: 10000
    }
  },
  usage: {
    totalRequests: {
      type: Number,
      default: 0
    },
    lastUsedAt: Date,
    requestsThisHour: {
      type: Number,
      default: 0
    },
    requestsThisDay: {
      type: Number,
      default: 0
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: Date,
  lastRotatedAt: Date
}, { timestamps: true });

// Hash the key before saving
apiKeySchema.pre('save', function(next) {
  if (this.isNew || this.isModified('key')) {
    this.keyHash = crypto.createHash('sha256').update(this.key).digest('hex');
  }
  next();
});

// Generate a new API key
apiKeySchema.statics.generateKey = function() {
  const prefix = 'sk_';
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return prefix + randomBytes;
};

// Verify API key
apiKeySchema.statics.verifyKey = function(plainKey) {
  return crypto.createHash('sha256').update(plainKey).digest('hex');
};

module.exports = mongoose.model('ApiKey', apiKeySchema);
