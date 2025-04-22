const User = require('../models/userModel');
const LoginAttempt = require('../models/loginAttemptModel');

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find();
    res.status(200).json({
      status: 'success',
      results: users.length,
      data: { users }
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getUserLogs = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('lastLogin loginAttempts accountLocked lockUntil');
    
    if (!user) return res.status(404).json({ message: 'User not found' });

    const attempts = await LoginAttempt.find({ email: user.email })
      .select('ipAddress deviceId attempts lastAttempt blockedUntil');

    res.status(200).json({
      status: 'success',
      data: {
        user: {
          lastLogin: user.lastLogin,
          loginAttempts: user.loginAttempts,
          accountLocked: user.accountLocked,
          lockUntil: user.lockUntil
        },
        loginAttempts: attempts
      }
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.status(200).json({
      status: 'success',
      data: { user }
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    await LoginAttempt.deleteMany({ email: req.user.email });
    res.status(204).json({ status: 'success', data: null });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.forceCancelSubscription = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.stripeSubscriptionId) {
      await stripe.subscriptions.del(user.stripeSubscriptionId);
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.userId,
      {
        isSubscribed: false,
        subscriptionPlan: null,
        stripeSubscriptionId: null
      },
      { new: true }
    );

    res.json({
      success: true,
      user: updatedUser
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getSystemLogs = async (req, res) => {
  try {
    const logs = await RequestLog.find()
      .sort('-createdAt')
      .limit(100)
      .populate('user', 'email name');
    
    res.json({
      success: true,
      logs
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};