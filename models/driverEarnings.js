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
    default: 18
  },
  type: {
    type: String,
    enum: ['delivery', 'bonus', 'penalty', 'payout'],
    default: 'delivery'
  },
  description: {
    type: String,
    default: 'Delivery completed'
  },
  customerAddress: {
    addressLine: String,
    city: String,
    state: String,
    pinCode: String
  },
  status: {
    type: String,
    enum: ['earned', 'paid', 'pending'],
    default: 'earned'
  },
  transactionDate: {
    type: Date,
    default: Date.now
  },
  payoutDate: {
    type: Date
  }
}, { timestamps: true });

driverEarningSchema.index({ driver: 1, transactionDate: -1 });
driverEarningSchema.index({ order: 1 });
driverEarningSchema.index({ status: 1 });

module.exports = mongoose.model('DriverEarning', driverEarningSchema);