const RequestLog = require('../models/requestLog');

module.exports = async (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', async () => {
    await RequestLog.create({
      endpoint: req.path,
      method: req.method,
      user: req.user?._id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      statusCode: res.statusCode,
      responseTime: Date.now() - start
    });
  });

  next();
};