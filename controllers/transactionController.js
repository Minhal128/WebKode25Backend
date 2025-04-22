const Transaction = require('../models/transactionModel');
const User = require('../models/userModel');
const { createPaymentIntent, confirmPayment } = require('../services/paymentServices');

exports.depositFunds = async (req, res) => {
  try {
    const { amount, paymentMethodId } = req.body;
    const userId = req.user.id;
    
    const user = await User.findById(userId);
    if (!user.isSubscribed) {
      return res.status(403).json({ message: 'Subscription required to perform transactions' });
    }
    
    // Create payment intent
    const paymentIntent = await createPaymentIntent(userId, amount);
    
    // Confirm payment
    const confirmedPayment = await confirmPayment(paymentIntent.id);
    
    // Update user balance
    user.walletBalance += amount * 100; // Store in cents
    await user.save();
    
    // Create transaction record
    const transaction = await Transaction.create({
      user: userId,
      amount: amount * 100,
      type: 'deposit',
      status: 'completed',
      stripePaymentIntentId: confirmedPayment.id,
      fee: confirmedPayment.application_fee_amount || 0,
      netAmount: confirmedPayment.amount_received
    });
    
    res.json({
      success: true,
      transaction,
      newBalance: user.walletBalance / 100
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.transferFunds = async (req, res) => {
  try {
    const { amount, recipientEmail, description } = req.body;
    const senderId = req.user.id;
    
    // Check sender subscription
    const sender = await User.findById(senderId);
    if (!sender.isSubscribed) {
      return res.status(403).json({ message: 'Subscription required to perform transactions' });
    }
    
    // Find recipient
    const recipient = await User.findOne({ email: recipientEmail });
    if (!recipient) {
      return res.status(404).json({ message: 'Recipient not found' });
    }
    
    // Check sender balance
    const amountInCents = Math.round(amount * 100);
    if (sender.walletBalance < amountInCents) {
      return res.status(400).json({ message: 'Insufficient funds' });
    }
    
    // Process transfer
    sender.walletBalance -= amountInCents;
    recipient.walletBalance += amountInCents;
    
    await Promise.all([sender.save(), recipient.save()]);
    
    // Create transactions for both parties
    const senderTransaction = await Transaction.create({
      user: senderId,
      amount: amountInCents,
      type: 'transfer',
      status: 'completed',
      description,
      recipient: recipient._id
    });
    
    const recipientTransaction = await Transaction.create({
      user: recipient._id,
      amount: amountInCents,
      type: 'transfer',
      status: 'completed',
      description,
      recipient: senderId
    });
    
    res.json({
      success: true,
      transaction: senderTransaction,
      newBalance: sender.walletBalance / 100
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getTransactionHistory = async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user.id })
      .sort('-createdAt')
      .populate('recipient', 'name email');
    
    res.json({
      success: true,
      transactions
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.generateInvoice = async (req, res) => {
  try {
    const { start, end } = req.query;
    
    const transactions = await Transaction.find({
      user: req.user.id,
      createdAt: {
        $gte: new Date(start),
        $lte: new Date(end)
      }
    }).sort('createdAt');

    const total = transactions.reduce((sum, txn) => sum + txn.amount, 0);
    
    // Simple JSON response - in production use PDF generation
    res.json({
      success: true,
      invoice: {
        period: { start, end },
        transactionsCount: transactions.length,
        totalAmount: total / 100,
        currency: 'USD',
        transactions
      }
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};