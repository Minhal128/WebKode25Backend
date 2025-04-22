const rateLimit = require('express-rate-limit');
const LoginAttempt = require('../models/loginAttemptModel');

exports.globalAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

exports.loginLimiter = async (req, res, next) => {
  const deviceId = req.headers['user-agent'] + req.ip;
  const email = req.body.email;
  
  if (!email) return next();
  
  const attempt = await LoginAttempt.findOne({
    ipAddress: req.ip,
    deviceId,
    email
  });
  
  if (attempt?.blockedUntil > Date.now()) {
    const remainingTime = Math.ceil((attempt.blockedUntil - Date.now()) / (60 * 1000));
    return res.status(429).json({ 
      message: `Too many login attempts. Try again after ${remainingTime} minutes`,
      retryAfter: remainingTime
    });
  }
  
  next();
};