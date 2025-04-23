const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  role: {
    type: String,
    enum: ['admin', 'developer', 'user'],
    default: 'user'
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  otp: String,
  otpExpires: Date,
  
  // Subscription Details
  isSubscribed: {
    type: Boolean,
    default: false
  },
  subscriptionId: String,
  subscriptionPlan: {
    type: String,
    enum: [null, 'basic', 'pro', 'enterprise'],
    default: null
  },
  subscriptionStartDate: Date,
  subscriptionEndDate: Date,
  paymentMethodId: String, // Reference to payment method in payment processor
  autoRenew: {
    type: Boolean,
    default: true
  },
  
  // Financial Details
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },
  taxRate: {
    type: Number,
    default: 0.1 // Default 10% tax, varies by plan
  },
  
  // Security and Access
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  accountLocked: {
    type: Boolean,
    default: false
  },
  lockUntil: Date,
  
  // Transaction References
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  paymentMethods: [{
    paymentMethodId: String,
    isDefault: Boolean,
    card: {
      brand: String,
      last4: String,
      expMonth: Number,
      expYear: Number
    }
  }],
  
  // Enhanced financial fields
  walletBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  transactionLimit: {
    type: Number,
    default: 1000 // Default limit in cents
  },
  monthlyTransactionVolume: {
    type: Number,
    default: 0
  },
  stripeCardholderId: String,
  address: {
    street: String,
    city: String,
    state: String,
    zip: String
  },
  cards: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Card'
  }],
  kycStatus: {
    type: String,
    enum: ['unverified', 'pending', 'verified', 'rejected'],
    default: 'unverified'
  }
}, 
 {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.__v;
      delete ret.paymentMethodId;
      return ret;
    }
  }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Method to compare passwords
userSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// Method to check subscription status
userSchema.methods.hasActiveSubscription = function() {
  return this.isSubscribed && (!this.subscriptionEndDate || this.subscriptionEndDate > new Date());
};

// Method to calculate tax based on plan
userSchema.methods.calculateTax = function(amount) {
  let taxRate = this.taxRate;
  
  // Adjust tax rate based on subscription plan
  if (this.subscriptionPlan === 'pro') {
    taxRate = 0.07; // 7% for pro users
  } else if (this.subscriptionPlan === 'enterprise') {
    taxRate = 0.05; // 5% for enterprise
  }
  
  return amount * taxRate;
};

// Method to check if user can perform transaction
userSchema.methods.canTransact = function(amount) {
  if (!this.hasActiveSubscription()) {
    throw new Error('Subscription required to perform transactions');
  }
  
  if (amount <= 0) {
    throw new Error('Transaction amount must be positive');
  }
  
  return true;
};

// Static method to process payment
userSchema.statics.processPayment = async function(userId, amount, description) {
  // In a real implementation, this would integrate with a payment processor
  // This is a simplified version
  
  const user = await this.findById(userId);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  if (!user.hasActiveSubscription()) {
    throw new Error('Active subscription required');
  }
  
  // Deduct balance (in real app, this would be a payment processor call)
  const totalAmount = amount + user.calculateTax(amount);
  
  if (user.balance < totalAmount) {
    throw new Error('Insufficient balance');
  }
  
  user.balance -= totalAmount;
  await user.save();
  
  return {
    success: true,
    amount: amount,
    tax: user.calculateTax(amount),
    newBalance: user.balance
  };
};

module.exports = mongoose.model('User', userSchema);