const express = require('express');
const authController = require('../controllers/authController');
const rateLimiter = require('../Middleware/rateLimiter');

const router = express.Router();

router.use(rateLimiter.globalAuthLimiter);

router.post('/register', authController.register);
router.post('/verify-otp', authController.verifyOTP);
router.post('/login', rateLimiter.loginLimiter, authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.patch('/reset-password', authController.resetPassword);

module.exports = router;