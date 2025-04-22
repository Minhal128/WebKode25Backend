const express = require('express');
const router = express.Router();
const { protect } = require('../Middleware/authMiddleware');
const {
  createSubscription,
  cancelSubscription,
  getSubscriptionPlans
} = require('../controllers/subscriptionController');

router.use(protect);

router.get('/plans', getSubscriptionPlans);
router.post('/', createSubscription);
router.delete('/', cancelSubscription);

module.exports = router;