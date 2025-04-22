const stripe = require('../config/stripe');
const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');

exports.createStripeCustomer = async (user) => {
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: {
      userId: user._id.toString()
    }
  });
  
  await User.findByIdAndUpdate(user._id, { stripeCustomerId: customer.id });
  return customer;
};

exports.createPaymentIntent = async (userId, amount, currency = 'usd') => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Convert to cents
    currency,
    customer: user.stripeCustomerId,
    metadata: { userId: user._id.toString() },
    description: `Payment from ${user.email}`
  });
  
  return paymentIntent;
};

exports.confirmPayment = async (paymentIntentId) => {
  const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId);
  return paymentIntent;
};

