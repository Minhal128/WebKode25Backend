const mongoose = require('mongoose');

const cardSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  stripeCardId: {
    type: String,
    required: true,
    unique: true
  },
  stripeCardholderId: {
    type: String,
    required: true
  },
  last4: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['virtual', 'physical'],
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'canceled', 'lost', 'stolen', 'pending', 'created', 'shipped'],
    default: 'active'
  },
  currency: {
    type: String,
    default: 'USD'
  },
  spendingControls: {
    allowedCategories: [String],
    blockedCategories: [String],
    spendingLimits: [{
      amount: Number,
      categories: [String],
      timeInterval: String // 'per_authorization', 'daily', 'weekly', 'monthly', 'yearly', 'all_time'
    }]
  },
  
  // Physical card specific fields
  shippingStatus: String,
  shippingTracking: String,
  shippingCarrier: String,
  estimatedDelivery: Date,
  activationDate: Date,
  cancellationDate: Date,
  
  // Transaction limits
  dailyLimit: {
    type: Number,
    default: 100000 // $1000 in cents
  },
  monthlyLimit: {
    type: Number,
    default: 300000 // $3000 in cents
  },
  
  // Metadata
  isMastercard: {
    type: Boolean,
    default: true
  },
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for card display name
cardSchema.virtual('displayName').get(function() {
  return `${this.type === 'physical' ? 'Physical' : 'Virtual'} Card •••• ${this.last4}`;
});

// Method to check if card can be used
cardSchema.methods.canTransact = function(amount) {
  if (this.status !== 'active') {
    throw new Error(`Card is ${this.status}`);
  }
  
  if (amount > this.dailyLimit) {
    throw new Error('Amount exceeds daily limit');
  }
  
  return true;
};

const Card = mongoose.model('Card', cardSchema);

module.exports = Card;