const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/userModel');
const Card = require('../models/cardModel');
const Subscription = require('../models/subscriptionModel');
const Transaction = require('../models/transactionModel');

const subscriptionController = {
  getSubscriptionPlans: async (req, res) => {
    try {
      const plans = await stripe.prices.list({
        active: true,
        type: 'recurring',
        expand: ['data.product']
      });
      
      const response = {
        success: true,
        plans: plans.data.map(plan => ({
          id: plan.id,
          name: plan.product.name,
          amount: plan.unit_amount / 100,
          currency: plan.currency,
          interval: plan.recurring.interval,
          features: JSON.parse(plan.product.metadata.features || '[]')
        }))
      };

      if (req.user) {
        response.currentPlan = req.user.subscriptionPlan;
      }

      res.json(response);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },

  createSubscription: async (req, res) => {
    try {
      const { plan, paymentMethodId } = req.body;
      const userId = req.user.id;

      if (paymentMethodId) {
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: req.user.stripeCustomerId
        });
        
        await stripe.customers.update(req.user.stripeCustomerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId
          }
        });
      }

      const subscription = await stripe.subscriptions.create({
        customer: req.user.stripeCustomerId,
        items: [{ price: plan }],
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent']
      });

      const user = await User.findByIdAndUpdate(userId, {
        isSubscribed: true,
        subscriptionPlan: plan.includes('pro') ? 'pro' : 
                        plan.includes('enterprise') ? 'enterprise' : 'basic',
        stripeSubscriptionId: subscription.id,
        subscriptionStartDate: new Date(),
        subscriptionEndDate: new Date(subscription.current_period_end * 1000)
      }, { new: true });

      await Subscription.createFromStripe(subscription, user._id);

      let card;
      if (user.subscriptionPlan === 'pro') {
        card = await createVirtualCard(user);
      } else if (user.subscriptionPlan === 'enterprise') {
        card = await createPhysicalCard(user);
      }

      res.json({
        success: true,
        subscription,
        user: user.toJSON(),
        card: card || null
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },

  cancelSubscription: async (req, res) => {
    try {
      const userId = req.user.id;
      
      const subscription = await stripe.subscriptions.update(
        req.user.stripeSubscriptionId,
        { cancel_at_period_end: true }
      );

      const user = await User.findByIdAndUpdate(userId, {
        subscriptionCancelled: true,
        subscriptionEndDate: new Date(subscription.current_period_end * 1000)
      }, { new: true });

      await Subscription.findOneAndUpdate(
        { userId: user._id, stripeSubscriptionId: subscription.id },
        { status: 'canceled', cancelledAt: new Date() }
      );

      res.json({
        success: true,
        message: 'Subscription will cancel at period end',
        subscription
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },

  getActiveCards: async (req, res) => {
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
  },

  updatePaymentMethod: async (req, res) => {
    try {
      const { paymentMethodId } = req.body;
      
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: req.user.stripeCustomerId
      });

      await stripe.customers.update(req.user.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });

      res.json({
        success: true,
        message: 'Payment method updated successfully'
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },

  getSubscriptionStatus: async (req, res) => {
    try {
      const subscription = await stripe.subscriptions.retrieve(
        req.user.stripeSubscriptionId
      );
      
      res.json({
        success: true,
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },

  retryPayment: async (req, res) => {
    try {
      const subscription = await stripe.subscriptions.retrieve(
        req.user.stripeSubscriptionId
      );
      
      const paymentIntent = await stripe.paymentIntents.retrieve(
        subscription.latest_invoice.payment_intent
      );
      
      const updatedPaymentIntent = await stripe.paymentIntents.confirm(
        paymentIntent.id
      );

      res.json({
        success: true,
        paymentIntent: updatedPaymentIntent
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },

  forceCancelSubscription: async (req, res) => {
    try {
      const { userId } = req.params;
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const subscription = await stripe.subscriptions.del(
        user.stripeSubscriptionId
      );

      await User.findByIdAndUpdate(userId, {
        isSubscribed: false,
        subscriptionCancelled: true,
        subscriptionEndDate: new Date()
      });

      await Subscription.findOneAndUpdate(
        { userId: user._id, stripeSubscriptionId: subscription.id },
        { status: 'cancelled', cancelledAt: new Date() }
      );

      res.json({
        success: true,
        message: 'Subscription cancelled immediately',
        subscription
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },

  getAllSubscriptions: async (req, res) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      
      const subscriptions = await Subscription.find()
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
        
      const count = await Subscription.countDocuments();

      res.json({
        success: true,
        subscriptions,
        totalPages: Math.ceil(count / limit),
        currentPage: page
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },

  getInvoices: async (req, res) => {
    try {
      const invoices = await stripe.invoices.list({
        customer: req.user.stripeCustomerId,
        limit: 12
      });

      const formattedInvoices = await Promise.all(invoices.data.map(async invoice => {
        const transaction = await Transaction.findOne({ 
          stripeInvoiceId: invoice.id 
        });
        
        return {
          id: invoice.id,
          number: invoice.number,
          amountDue: invoice.amount_due,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          status: invoice.status,
          periodStart: new Date(invoice.period_start * 1000),
          periodEnd: new Date(invoice.period_end * 1000),
          pdfUrl: invoice.invoice_pdf,
          transactionId: transaction?._id,
          createdAt: new Date(invoice.created * 1000)
        };
      }));

      res.json({
        success: true,
        invoices: formattedInvoices
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },

  getTransactions: async (req, res) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      
      const transactions = await Transaction.find({ userId: req.user._id })
        .sort({ processedAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
        
      const count = await Transaction.countDocuments({ userId: req.user._id });

      res.json({
        success: true,
        transactions,
        totalPages: Math.ceil(count / limit),
        currentPage: page
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }
};

// Helper functions
async function createVirtualCard(user) {
  const card = await stripe.issuing.cards.create({
    cardholder: user.stripeCardholderId,
    currency: 'usd',
    type: 'virtual',
    status: 'active'
  });

  return await Card.create({
    userId: user._id,
    stripeCardId: card.id,
    last4: card.last4,
    type: 'virtual',
    status: 'active'
  });
}

async function createPhysicalCard(user) {
  const card = await stripe.issuing.cards.create({
    cardholder: user.stripeCardholderId,
    currency: 'usd',
    type: 'physical',
    status: 'active',
    shipping: {
      name: user.name,
      address: {
        line1: user.address?.street,
        city: user.address?.city,
        state: user.address?.state,
        postal_code: user.address?.zip,
        country: 'US'
      }
    }
  });

  return await Card.create({
    userId: user._id,
    stripeCardId: card.id,
    last4: card.last4,
    type: 'physical',
    status: 'pending',
    isMastercard: true
  });
}

module.exports = subscriptionController;