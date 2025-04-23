const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const { promisify } = require('util');

exports.protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        message: 'You are not logged in! Please log in to get access.'
      });
    }

    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return res.status(401).json({
        message: 'The user belonging to this token does no longer exist.'
      });
    }

    if (!currentUser.isSubscribed) {
      return res.status(403).json({
        message: 'Please subscribe to access this resource'
      });
    }

    req.user = currentUser;
    next();
  } catch (err) {
    res.status(401).json({
      message: 'Invalid token or session expired'
    });
  }
};

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'You do not have permission to perform this action'
      });
    }
    next();
  };
};

exports.subscriptionRequired = async (req, res, next) => {
    if (!req.user.isSubscribed) {
      return res.status(403).json({ 
        message: 'Subscription required to access this feature',
        upgradeUrl: '/api/subscriptions/plans'
      });
    }
    next();
  };

  exports.optionalAuth = async (req, res, next) => {
    let token;
  
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
  
    if (token) {
      try {
        const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  
        const user = await User.findById(decoded.id);
        if (user) {
          req.user = user; // attach user to request
        }
      } catch (err) {
        return res.status(401).json({
          message: 'Invalid token or session expired'
        });
      }
    }
  
    // Continue whether or not token was found
    next();
  };
  