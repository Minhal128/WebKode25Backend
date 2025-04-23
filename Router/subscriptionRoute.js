const express = require('express');
const router = express.Router();
const authMiddleware = require('../Middleware/authMiddleware');
const subscriptionController = require('../controllers/subscriptionController');
const webhookController = require("../controllers/webhookController");

// All endpoints use optionalAuth only
router.use(authMiddleware.optionalAuth);

// Public endpoints
router.get('/plans', subscriptionController.getSubscriptionPlans);

// Subscription management endpoints
router.post('/', subscriptionController.createSubscription);
router.delete('/', subscriptionController.cancelSubscription);

// User-specific endpoints (require subscription)
router.get('/cards', checkSubscription, subscriptionController.getActiveCards);
router.post('/payment-method', checkSubscription, subscriptionController.updatePaymentMethod);
router.get('/status', checkSubscription, subscriptionController.getSubscriptionStatus);
router.post('/retry-payment', checkSubscription, subscriptionController.retryPayment);
router.get('/invoices', checkSubscription, subscriptionController.getInvoices);
router.get('/transactions', checkSubscription, subscriptionController.getTransactions);

// Webhook endpoint
router.post('/webhook', express.raw({type: 'application/json'}), webhookController.handleWebhook);

// Admin endpoints
router.post('/cancel/:userId', checkAdmin, subscriptionController.forceCancelSubscription);
router.get('/all', checkAdmin, subscriptionController.getAllSubscriptions);

// Custom middleware functions
function checkSubscription(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  if (!req.user.isSubscribed) {
    return res.status(403).json({ 
      message: 'Subscription required',
      upgradeUrl: '/api/subscriptions/plans'
    });
  }
  next();
}

function checkAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

module.exports = router;