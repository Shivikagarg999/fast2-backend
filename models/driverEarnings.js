const mongoose = require('mongoose');

const driverEarningSchema = new mongoose.Schema({
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: true
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  orderId: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  type: {
    type: String,
    enum: ['delivery', 'bonus', 'penalty', 'other'],
    default: 'delivery'
  },
  description: {
    type: String,
    required: true
  },
  customerAddress: {
    addressLine: String,
    city: String,
    state: String,
    pinCode: String,
    phone: String
  },
  status: {
    type: String,
    enum: ['earned', 'payout_processing', 'payout_paid', 'cancelled'],
    default: 'earned'
  },
  payoutBatch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DriverPayout'
  },
  transactionDate: {
    type: Date,
    default: Date.now
  },
  payoutDate: {
    type: Date
  },
  payoutMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'upi', 'wallet'],
    default: 'upi'
  },
  transactionId: {
    type: String
  }
}, {
  timestamps: true
});

driverEarningSchema.index({ driver: 1, status: 1 });
driverEarningSchema.index({ order: 1 });
driverEarningSchema.index({ transactionDate: -1 });
driverEarningSchema.index({ payoutBatch: 1 });

module.exports = mongoose.model('DriverEarning', driverEarningSchema);