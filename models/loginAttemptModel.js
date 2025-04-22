const mongoose = require('mongoose');

const loginAttemptSchema = new mongoose.Schema({
  ipAddress: {
    type: String,
    required: true
  },
  deviceId: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  attempts: {
    type: Number,
    default: 1
  },
  lastAttempt: {
    type: Date,
    default: Date.now
  },
  blockedUntil: Date
}, { timestamps: true });

loginAttemptSchema.index({ ipAddress: 1, deviceId: 1, email: 1 });
loginAttemptSchema.index({ blockedUntil: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('LoginAttempt', loginAttemptSchema);