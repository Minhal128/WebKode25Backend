const stripe = require('../config/stripe');
const User = require('../models/userModel');

const PLANS = {
  basic: process.env.STRIPE_BASIC_PLAN_ID,
  pro: process.env.STRIPE_PRO_PLAN_ID,
  enterprise: process.env.STRIPE_ENTERPRISE_PLAN_ID
};

exports.createSubscription = async (userId, plan, paymentMethodId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  
  // Attach payment method to customer
  await stripe.paymentMethods.attach(paymentMethodId, {
    customer: user.stripeCustomerId
  });
  
  // Set as default payment method
  await stripe.customers.update(user.stripeCustomerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId
    }
  });
  
  // Create subscription
  const subscription = await stripe.subscriptions.create({
    customer: user.stripeCustomerId,
    items: [{ price: PLANS[plan] }],
    expand: ['latest_invoice.payment_intent'],
    metadata: { userId: user._id.toString() }
  });
  
  // Update user in database
  const updatedUser = await User.findByIdAndUpdate(user._id, {
    isSubscribed: true,
    subscriptionPlan: plan,
    stripeSubscriptionId: subscription.id,
    subscriptionStartDate: new Date(),
    subscriptionEndDate: new Date(subscription.current_period_end * 1000),
    $push: {
      paymentMethods: {
        paymentMethodId,
        isDefault: true,
        card: {
          brand: subscription.latest_invoice.payment_intent.payment_method.card.brand,
          last4: subscription.latest_invoice.payment_intent.payment_method.card.last4,
          expMonth: subscription.latest_invoice.payment_intent.payment_method.card.exp_month,
          expYear: subscription.latest_invoice.payment_intent.payment_method.card.exp_year
        }
      }
    }
  }, { new: true });
  
  return { subscription, user: updatedUser };
};

// ... other subscription methods (cancel, update, etc.)