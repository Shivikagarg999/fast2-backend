const mongoose = require("mongoose");

const onlinePaymentIntentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    gateway: {
      type: String,
      enum: ["razorpay", "cashfree"],
      required: true,
      index: true
    },
    gatewayOrderId: {
      type: String,
      required: true,
      unique: true
    },
    gatewayPaymentSessionId: {
      type: String,
      default: null
    },
    amount: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: "INR"
    },
    status: {
      type: String,
      enum: ["pending", "paid", "failed", "placed"],
      default: "pending",
      index: true
    },
    orderData: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    sellerPayouts: [
      {
        seller: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Seller",
          required: true
        },
        amount: {
          type: Number,
          required: true
        },
        percentage: {
          type: Number,
          default: 30
        }
      }
    ],
    scratchCouponOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null
    },
    placedOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null
    },
    failureReason: {
      type: String,
      default: null
    },
    paidAt: {
      type: Date,
      default: null
    },
    placedAt: {
      type: Date,
      default: null
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
      index: true
    }
  },
  { timestamps: true }
);

onlinePaymentIntentSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("OnlinePaymentIntent", onlinePaymentIntentSchema);
