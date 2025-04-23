const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription'
  },
  type: {
    type: String,
    enum: ['subscription', 'card_payment', 'transfer', 'refund', 'withdrawal'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  status: {
    type: String,
    enum: ['pending', 'succeeded', 'failed', 'refunded'],
    default: 'pending'
  },
  description: String,
  failureReason: String,
  metadata: mongoose.Schema.Types.Mixed,
  
  // Stripe references
  stripePaymentIntentId: String,
  stripeInvoiceId: String,
  stripeChargeId: String,
  stripeTransferId: String,
  
  // Card transaction details
  cardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Card'
  },
  last4: String,
  cardBrand: String,
  
  // Transfer details
  sourceAccount: String,
  destinationAccount: String,
  
  // Timestamps
  processedAt: {
    type: Date,
    default: Date.now
  },
  settledAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for faster queries
transactionSchema.index({ userId: 1 });
transactionSchema.index({ processedAt: -1 });
transactionSchema.index({ type: 1, status: 1 });

// Virtual for formatted amount
transactionSchema.virtual('amountFormatted').get(function() {
  return (this.amount / 100).toFixed(2);
});

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;