const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
  recipientType: {
    type: String,
    enum: ['promotor', 'seller'],
    required: true
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'recipientModel'
  },
  recipientModel: {
    type: String,
    required: true,
    enum: ['Promotor', 'Seller']
  },
  recipientName: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  orderIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  }],
  orderCount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'paid', 'failed'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'upi', 'cheque', 'cash', 'other'],
    default: null
  },
  paymentDate: {
    type: Date,
    default: null
  },
  transactionId: {
    type: String,
    default: null
  },
  notes: {
    type: String,
    default: null
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  bankDetails: {
    accountNumber: String,
    ifscCode: String,
    bankName: String,
    accountHolder: String
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
payoutSchema.index({ recipientId: 1, status: 1 });
payoutSchema.index({ status: 1, createdAt: -1 });
payoutSchema.index({ recipientType: 1, status: 1 });

module.exports = mongoose.model('Payout', payoutSchema);