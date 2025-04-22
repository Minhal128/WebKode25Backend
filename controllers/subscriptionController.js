const User = require('../models/userModel');
const { createSubscription, cancelSubscription } = require('../services/subscriptionService');

exports.createSubscription = async (req, res) => {
  try {
    const { plan, paymentMethodId } = req.body;
    const userId = req.user.id;
    
    const { subscription, user } = await createSubscription(userId, plan, paymentMethodId);
    
    res.json({
      success: true,
      subscription,
      user: {
        id: user._id,
        email: user.email,
        isSubscribed: user.isSubscribed,
        subscriptionPlan: user.subscriptionPlan
      }
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.cancelSubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    
    if (!user.isSubscribed) {
      return res.status(400).json({ message: 'No active subscription' });
    }
    
    await cancelSubscription(user.stripeSubscriptionId);
    
    const updatedUser = await User.findByIdAndUpdate(userId, {
      isSubscribed: false,
      subscriptionPlan: null,
      stripeSubscriptionId: null,
      subscriptionEndDate: null
    }, { new: true });
    
    res.json({
      success: true,
      user: {
        id: updatedUser._id,
        isSubscribed: updatedUser.isSubscribed,
        subscriptionPlan: updatedUser.subscriptionPlan
      }
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getSubscriptionPlans = async (req, res) => {
  try {
    const plans = await stripe.prices.list({
      active: true,
      type: 'recurring',
      expand: ['data.product']
    });
    
    res.json({
      success: true,
      plans: plans.data.map(plan => ({
        id: plan.id,
        name: plan.product.name,
        amount: plan.unit_amount / 100,
        currency: plan.currency,
        interval: plan.recurring.interval,
        features: plan.product.metadata.features
      }))
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};