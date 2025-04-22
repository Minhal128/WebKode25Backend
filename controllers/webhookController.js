const stripe = require('../config/stripe');
const User = require('../models/userModel');

exports.handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'invoice.payment_succeeded':
      await handleSubscriptionPayment(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionCancel(event.data.object);
      break;
    // Add more webhook events as needed
  }

  res.json({ received: true });
};

async function handleSubscriptionPayment(invoice) {
  await User.findOneAndUpdate(
    { stripeCustomerId: invoice.customer },
    { 
      subscriptionEndDate: new Date(invoice.period_end * 1000),
      isSubscribed: true 
    }
  );
}

async function handleSubscriptionCancel(subscription) {
  await User.findOneAndUpdate(
    { stripeSubscriptionId: subscription.id },
    { 
      isSubscribed: false,
      subscriptionPlan: null,
      stripeSubscriptionId: null 
    }
  );
}