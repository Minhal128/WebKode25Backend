const rateLimit = require('express-rate-limit');

exports.apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 requests per windowMs
  message: 'Too many requests, please try again after a minute',
  skip: req => req.user?.role === 'admin' // Admins are exempt
});