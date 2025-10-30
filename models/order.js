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
    orderId: {
      type: String,
      unique: true,
      sparse: true 
    },
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
      enum: ["pending", "confirmed", "picked-up", "delivered", "cancelled"],
      default: "pending"
    },
    shippingAddress: shippingSchema, 
    paymentMethod: { type: String, enum: ["cod", "online"], default: "cod" },
    paymentStatus: { type: String, enum: ["pending", "paid"], default: "pending" },
    
    secretCode: {
      type: String,
      required: true
    },
    isSecretCodeVerified: {
      type: Boolean,
      default: false
    },
    driverMarkedPaid: {
      type: Boolean,
      default: false
    },
    
    estimatedDelivery: Date,
    deliveryNotes: String,
    trackingNumber: String
  },
  { timestamps: true }
);

orderSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      const lastOrder = await this.constructor.findOne(
        { orderId: { $regex: /^FST\d+$/ } },
        { orderId: 1 },
        { sort: { createdAt: -1 } }
      );
      
      let nextNumber = 1;
      if (lastOrder && lastOrder.orderId) {
        const lastNumber = parseInt(lastOrder.orderId.replace('FST', ''));
        nextNumber = lastNumber + 1;
      }
      
      this.orderId = `FST${String(nextNumber).padStart(3, '0')}`;
      
      let secretCode;
      let isUnique = false;
      
      while (!isUnique) {
        secretCode = Math.floor(100000 + Math.random() * 900000).toString();
        const existingOrder = await this.constructor.findOne({ secretCode });
        if (!existingOrder) {
          isUnique = true;
        }
      }
      
      this.secretCode = secretCode;
      
    } catch (error) {
      return next(error);
    }
  }
  next();
});

orderSchema.index({ orderId: 1 });
orderSchema.index({ secretCode: 1 });

module.exports = mongoose.model("Order", orderSchema);