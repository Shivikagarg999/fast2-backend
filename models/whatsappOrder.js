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
    deliveryCharges: { type: Number, default: 0 },
    handlingCharge: { type: Number, default: 0 },
    totalGst: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    finalAmount: { type: Number, default: 0 },
    couponCode: { type: String, default: null },
    couponDiscount: { type: Number, default: 0 },
    couponBenefitType: { type: String, default: null },
    razorpayPaymentLinkId: { type: String, unique: true, sparse: true },
    paymentLinkUrl: { type: String },
    shippingAddress: {
      name: { type: String },
      addressLine: { type: String },
      city: { type: String },
      state: { type: String },
      pinCode: { type: String },
      phone: { type: String },
      lat: { type: Number },
      lng: { type: Number }
    },
    status: {
      type: String,
      enum: [
        "awaiting_address",
        "awaiting_payment_method",
        "awaiting_coupon",
        "pending",
        "paid",
        "cod_confirmed",
        "undeliverable",
        "expired",
        "cancelled"
      ],
      default: "pending"
    },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model("WhatsappOrder", whatsappOrderSchema);
