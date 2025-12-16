const mongoose = require("mongoose");

const sellerPayoutSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    required: true
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Seller",
    required: true
  },
  orderAmount: {
    type: Number,
    required: true
  },
  platformFee: {
    type: Number,
    default: 0
  },
  platformFeePercentage: {
    type: Number,
    default: 10
  },
  gstOnPlatformFee: {
    type: Number,
    default: 0
  },
  gstRate: {
    type: Number,
    default: 18
  },
  tdsDeduction: {
    type: Number,
    default: 0
  },
  tdsRate: {
    type: Number,
    default: 1
  },
  payableAmount: {
    type: Number,
    required: true
  },
  netAmount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ["pending", "processing", "paid", "failed", "cancelled"],
    default: "pending"
  },
  paidAt: {
    type: Date
  },
  paymentMethod: {
    type: String,
    enum: ["bank_transfer", "upi", "cash"],
    default: "bank_transfer"
  },
  transactionId: {
    type: String
  },
  remarks: {
    type: String
  }
}, { timestamps: true });

sellerPayoutSchema.index({ seller: 1, status: 1 });
sellerPayoutSchema.index({ order: 1 });
sellerPayoutSchema.index({ createdAt: -1 });

module.exports = mongoose.model("SellerPayout", sellerPayoutSchema);