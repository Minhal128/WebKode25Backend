const User = require('../models/userModel');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const otpGenerator = require('otp-generator');
const nodemailer = require('nodemailer');
const { promisify } = require('util');

// JWT sign and verify

const LoginAttempt = require('../models/loginAttemptModel');

// Helper function to get device fingerprint
const getDeviceFingerprint = (req) => {
  return req.headers['user-agent'] + req.ip;
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const deviceId = getDeviceFingerprint(req);

    // 1) Check for empty credentials
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    // 2) Check if this device/IP is blocked
    const attempt = await LoginAttempt.findOne({ 
      ipAddress: req.ip, 
      deviceId,
      email 
    });

    if (attempt && attempt.blockedUntil && attempt.blockedUntil > Date.now()) {
      const remainingTime = Math.ceil((attempt.blockedUntil - Date.now()) / (60 * 1000));
      return res.status(429).json({ 
        message: `Too many attempts. Try again after ${remainingTime} minutes`,
        retryAfter: remainingTime
      });
    }

    // 3) Check if user exists and password is correct
    const user = await User.findOne({ email }).select('+password +isVerified +isSubscribed');

    if (!user || !(await user.correctPassword(password, user.password))) {
      // Record failed attempt
      if (attempt) {
        attempt.attempts += 1;
        attempt.lastAttempt = Date.now();
        
        // Block this device/IP for 30 minutes after 10 failed attempts
        if (attempt.attempts >= 10) {
          attempt.blockedUntil = Date.now() + 30 * 60 * 1000;
        }
        
        await attempt.save();
      } else {
        await LoginAttempt.create({
          ipAddress: req.ip,
          deviceId,
          email,
          attempts: 1
        });
      }
      
      return res.status(401).json({ message: 'Incorrect email or password' });
    }

    // 4) Still check for account-level security (but with higher threshold)
    if (user.loginAttempts >= 20) { // Higher threshold for account lock
      user.accountLocked = true;
      user.lockUntil = Date.now() + 60 * 60 * 1000; // 1 hour lock
      await user.save();
      return res.status(403).json({ 
        message: 'Account locked due to suspicious activity. Contact support.' 
      });
    }

    // 5) Check verification and subscription status
    if (!user.isVerified) {
      return res.status(403).json({ message: 'Please verify your email first' });
    }

    if (!user.isSubscribed) {
      return res.status(403).json({ 
        message: 'Please subscribe to access this service',
        requiresSubscription: true 
      });
    }

    // 6) Reset all attempt counters on successful login
    await LoginAttempt.deleteMany({ 
      $or: [
        { ipAddress: req.ip },
        { deviceId },
        { email }
      ]
    });

    user.loginAttempts = 0;
    user.accountLocked = false;
    user.lockUntil = undefined;
    user.lastLogin = Date.now();
    await user.save();

    // 7) Generate token
    const token = signToken(user._id);

    res.status(200).json({
      status: 'success',
      token,
      data: {
        user
      }
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
const signToken = id => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Register user with OTP
exports.register = async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    // Generate OTP
    const otp = otpGenerator.generate(6, {
      upperCase: false,
      specialChars: false,
      alphabets: false
    });

    // Create unverified user
    const newUser = await User.create({
      email,
      password,
      name,
      otp,
      otpExpires: Date.now() + 10 * 60 * 1000 // OTP expires in 10 mins
    });

    // Send OTP email
    const mailOptions = {
      from: process.env.EMAIL_USERNAME,
      to: email,
      subject: 'Verify Your Account',
      text: `Your OTP is ${otp}. It will expire in 10 minutes.`
    };

    await transporter.sendMail(mailOptions);

    res.status(201).json({
      status: 'success',
      message: 'OTP sent to email'
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Verify OTP
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.otp !== otp || user.otpExpires < Date.now()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Account verified successfully'
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Login with rate limiting

// Forgot password
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate reset token
    const resetToken = otpGenerator.generate(6, {
      upperCase: false,
      specialChars: false,
      alphabets: false
    });

    user.passwordResetToken = resetToken;
    user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    // Send reset email
    const resetURL = `Your password reset token is ${resetToken}. It will expire in 10 minutes.`;

    const mailOptions = {
      from: process.env.EMAIL_USERNAME,
      to: user.email,
      subject: 'Your password reset token',
      text: resetURL
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({
      status: 'success',
      message: 'Token sent to email'
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Reset password
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Token is invalid or has expired' });
    }

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Password updated successfully'
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};