const mongoose = require('mongoose');

const paymentSettingsSchema = new mongoose.Schema({
  activeGateway: {
    type: String,
    enum: ['razorpay', 'cashfree', 'none'],
    default: 'razorpay'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  }
}, { timestamps: true });

paymentSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

module.exports = mongoose.model('PaymentSettings', paymentSettingsSchema);