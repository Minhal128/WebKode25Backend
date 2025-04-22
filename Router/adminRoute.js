const express = require('express');
const adminController = require('../controllers/adminController');
const authMiddleware = require('../Middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware.protect);
router.use(authMiddleware.restrictTo('admin'));

router.get('/users', adminController.getAllUsers);
router.get('/users/:id/logs', adminController.getUserLogs);
router.patch('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);
router.post('/subscriptions/cancel/:userId', adminController.forceCancelSubscription);
router.get('/logs', adminController.getSystemLogs);

module.exports = router;