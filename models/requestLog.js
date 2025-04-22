const mongoose = require('mongoose');

const requestLogSchema = new mongoose.Schema({
  endpoint: String,
  method: String,
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  ip: String,
  userAgent: String,
  statusCode: Number,
  responseTime: Number,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('RequestLog', requestLogSchema);
