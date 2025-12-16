const mongoose = require("mongoose");

const promotorPayoutSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    required: true
  },
  promotor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Promotor",
    required: true
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Seller",
    required: true
  },
  commissionType: {
    type: String,
    enum: ["percentage", "fixed"],
    default: "percentage"
  },
  commissionRate: {
    type: Number,
    required: true
  },
  orderAmount: {
    type: Number,
    required: true
  },
  commissionAmount: {
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

promotorPayoutSchema.index({ promotor: 1, status: 1 });
promotorPayoutSchema.index({ seller: 1 });
promotorPayoutSchema.index({ order: 1 });
promotorPayoutSchema.index({ createdAt: -1 });

module.exports = mongoose.model("PromotorPayout", promotorPayoutSchema);