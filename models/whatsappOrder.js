const mongoose = require("mongoose");

const whatsappOrderSchema = new mongoose.Schema(
  {
    whatsappPhone: {
      type: String,
      required: true,
      index: true
    },
    items: [{
      product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
      quantity: { type: Number, required: true, min: 1 },
      price: { type: Number, required: true }
    }],
    subtotal: { type: Number, required: true },
    razorpayPaymentLinkId: { type: String, unique: true, sparse: true },
    paymentLinkUrl: { type: String },
    shippingAddress: {
      addressLine: { type: String },
      city: { type: String },
      state: { type: String },
      pinCode: { type: String },
      phone: { type: String }
    },
    status: {
      type: String,
      enum: ["awaiting_address", "pending", "paid", "expired", "cancelled"],
      default: "pending"
    },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model("WhatsappOrder", whatsappOrderSchema);
