const mongoose = require('mongoose');

const driverPayoutSchema = new mongoose.Schema({
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: true
  },
  batchId: {
    type: String,
    unique: true,
    required: true
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  numberOfOrders: {
    type: Number,
    required: true,
    min: 0
  },
  earnings: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DriverEarning'
  }],
  status: {
    type: String,
    enum: ['pending', 'processing', 'paid', 'failed', 'cancelled'],
    default: 'pending'
  },
  payoutMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'upi', 'wallet'],
    required: true
  },
  transactionId: {
    type: String
  },
  bankDetails: {
    accountHolder: String,
    accountNumber: String,
    ifscCode: String,
    bankName: String
  },
  upiId: {
    type: String
  },
  walletDetails: {
    walletId: String,
    walletType: String
  },
  paidAt: {
    type: Date
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

driverPayoutSchema.pre('save', async function (next) {
  if (this.isNew && !this.batchId) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    const lastPayout = await this.constructor.findOne(
      { batchId: { $regex: /^DPO-\d{8}-\d+$/ } },
      { batchId: 1 },
      { sort: { createdAt: -1 } }
    );

    let sequence = 1;
    if (lastPayout && lastPayout.batchId) {
      const lastSequence = parseInt(lastPayout.batchId.split('-')[2]);
      sequence = lastSequence + 1;
    }

    this.batchId = `DPO-${year}${month}${day}-${String(sequence).padStart(3, '0')}`;
  }
  next();
});

driverPayoutSchema.index({ driver: 1, status: 1 });

driverPayoutSchema.index({ createdAt: -1 });
driverPayoutSchema.index({ paidAt: 1 });

module.exports = mongoose.model('DriverPayout', driverPayoutSchema);