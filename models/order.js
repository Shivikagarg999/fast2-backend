const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  quantity: { 
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true
  }
});

const shippingSchema = new mongoose.Schema({
  addressLine: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  pinCode: { type: String, required: true },
  country: { type: String, default: "India" },
  phone: { type: String }
});

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      default: null
    },
    items: [orderItemSchema],
    total: {
      type: Number,
      required: true
    },
    // Coupon fields
    coupon: {
      code: String,
      discount: {
        type: Number,
        default: 0
      }
    },
    finalAmount: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      default: "pending"
    },
    shippingAddress: shippingSchema, 
    paymentMethod: { type: String, enum: ["cod", "online"], default: "cod" },
    paymentStatus: { type: String, enum: ["pending", "paid"], default: "pending" },
    
    // Delivery tracking fields
    estimatedDelivery: Date,
    deliveryNotes: String,
    trackingNumber: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);