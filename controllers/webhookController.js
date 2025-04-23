const stripe = require('../config/stripe');
const User = require('../models/userModel');
const Card = require('../models/cardModel');

exports.handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  
  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    switch (event.type) {
      case 'invoice.payment_succeeded':
        await handleSubscriptionPayment(event.data.object);
        break;
      
      case 'customer.subscription.deleted':
        await handleSubscriptionCancel(event.data.object);
        break;
      
      case 'issuing_card.created':
        await handleCardCreated(event.data.object);
        break;
      
      case 'issuing_card.updated':
        await handleCardStatusChange(event.data.object);
        break;
      
      case 'issuing_card.shipped':
        await handleCardShipped(event.data.object);
        break;
    }

    res.json({received: true});
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
};

// Enhanced Handlers
async function handleSubscriptionPayment(invoice) {
  const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
  
  await User.findOneAndUpdate(
    { stripeCustomerId: invoice.customer },
    { 
      isSubscribed: true,
      subscriptionPlan: getPlanFromPrice(invoice.lines.data[0].price.id),
      subscriptionEndDate: new Date(subscription.current_period_end * 1000),
      $inc: { paymentCount: 1 }
    }
  );
}

async function handleSubscriptionCancel(subscription) {
  const user = await User.findOneAndUpdate(
    { stripeSubscriptionId: subscription.id },
    { 
      isSubscribed: false,
      subscriptionPlan: null,
      stripeSubscriptionId: null,
      subscriptionEndDate: null
    }
  );
  
  // Deactivate all cards
  await Card.updateMany(
    { userId: user._id },
    { status: 'canceled' }
  );
}

async function handleCardCreated(card) {
  // Only process physical cards
  if (card.type === 'physical') {
    await Card.findOneAndUpdate(
      { stripeCardId: card.id },
      { 
        status: 'created',
        shippingTracking: card.shipping?.tracking_number,
        estimatedDelivery: card.shipping?.estimated_delivery_date ?
          new Date(card.shipping.estimated_delivery_date * 1000) : null
      }
    );
  }
}

async function handleCardStatusChange(card) {
  await Card.findOneAndUpdate(
    { stripeCardId: card.id },
    { status: card.status.toLowerCase() }
  );
}

async function handleCardShipped(card) {
  await Card.findOneAndUpdate(
    { stripeCardId: card.id },
    { 
      status: 'shipped',
      shippingCarrier: card.shipping?.carrier,
      shippingTracking: card.shipping?.tracking_number,
      estimatedDelivery: card.shipping?.estimated_delivery_date ?
        new Date(card.shipping.estimated_delivery_date * 1000) : null
    }
  );
}

// Helper
function getPlanFromPrice(priceId) {
  if (priceId.includes('pro')) return 'pro';
  if (priceId.includes('enterprise')) return 'enterprise';
  return 'basic';
}

// New Controller Methods
exports.getActiveCards = async (req, res) => {
  try {
    const cards = await Card.find({
      userId: req.user.id,
      status: { $in: ['active', 'shipped'] }
    });
    
    res.json({
      success: true,
      cards
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.forceCancelSubscription = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.stripeSubscriptionId) {
      await stripe.subscriptions.del(user.stripeSubscriptionId);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};