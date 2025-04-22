const express = require('express');
const router = express.Router();
const { protect, subscriptionRequired } = require('../middleware/authMiddleware');
const {
  depositFunds,
  transferFunds,
  getTransactionHistory,
  generateInvoice
} = require('../controllers/transactionController');

router.use(protect);
router.use(subscriptionRequired);

router.post('/deposit', depositFunds);
router.post('/transfer', transferFunds);
router.get('/history', getTransactionHistory);
router.get('/invoice', generateInvoice);

module.exports = router;