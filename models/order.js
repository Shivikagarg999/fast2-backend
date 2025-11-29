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
    
    // Wallet Payment Fields
    walletDeduction: {
      type: Number,
      default: 0
    },
    cashOnDelivery: {
      type: Number,
      default: 0
    },
    
    status: {
      type: String,
      default: "pending"
    },
    shippingAddress: shippingSchema, 
    paymentMethod: { 
      type: String, 
      enum: ["cod", "online"], 
      default: "cod" 
    },
    paymentStatus: { 
      type: String, 
      enum: ["pending", "paid", "failed", "refunded"], 
      default: "pending" 
    },
    
    secretCode: {
      type: String,
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
    trackingNumber: String,

    cancelledAt: {
      type: Date
    },
    cancellationReason: {
      type: String
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      required: true
    },
    refundAmount: {
      type: Number,
      default: 0
    },
    refundStatus: {
      type: String,
      enum: ["none", "pending", "processed", "failed"],
      default: "none"
    },
    refundedAt: {
      type: Date
    }
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
      
      // Generate unique secret code
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

      // Auto-calculate cashOnDelivery if not set
      if (this.walletDeduction > 0 && this.cashOnDelivery === 0) {
        this.cashOnDelivery = this.finalAmount - this.walletDeduction;
      }

      // Update payment status if fully paid by wallet
      if (this.walletDeduction >= this.finalAmount) {
        this.paymentStatus = "paid";
        this.cashOnDelivery = 0;
      }
      
    } catch (error) {
      return next(error);
    }
  }

  // Ensure cashOnDelivery is never negative
  if (this.cashOnDelivery < 0) {
    this.cashOnDelivery = 0;
  }

  next();
});

// Virtual for display amount (final amount after all deductions)
orderSchema.virtual('displayAmount').get(function() {
  return this.cashOnDelivery > 0 ? this.cashOnDelivery : this.finalAmount;
});

// Virtual for payment method display
orderSchema.virtual('paymentMethodDisplay').get(function() {
  if (this.walletDeduction > 0 && this.cashOnDelivery > 0) {
    return 'Wallet + COD';
  } else if (this.walletDeduction > 0) {
    return 'Wallet';
  } else {
    return this.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online';
  }
});

// Method to check if order can be cancelled
orderSchema.methods.canCancel = function() {
  const nonCancellableStatuses = ['picked-up', 'delivered'];
  return !nonCancellableStatuses.includes(this.status);
};

// Method to process cancellation with wallet refund
orderSchema.methods.processCancellation = async function(reason = '') {
  if (!this.canCancel()) {
    throw new Error('Order cannot be cancelled at this stage');
  }

  this.status = 'cancelled';
  this.cancelledAt = new Date();
  this.cancellationReason = reason;

  // Refund wallet amount if any was deducted
  if (this.walletDeduction > 0) {
    this.refundAmount = this.walletDeduction;
    this.refundStatus = 'pending';
    
    // Refund to user's wallet
    const User = mongoose.model('User');
    await User.findByIdAndUpdate(this.user, {
      $inc: { wallet: this.walletDeduction }
    });

    this.refundStatus = 'processed';
    this.refundedAt = new Date();
  }

  return this.save();
};

// Static method to get orders by user with wallet payments
orderSchema.statics.findByUserWithWallet = function(userId) {
  return this.find({ user: userId })
    .populate('items.product')
    .sort({ createdAt: -1 });
};

// Static method to get wallet payment summary
orderSchema.statics.getWalletPaymentSummary = async function(userId) {
  const result = await this.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(userId),
        walletDeduction: { $gt: 0 }
      }
    },
    {
      $group: {
        _id: null,
        totalWalletSpent: { $sum: "$walletDeduction" },
        totalOrders: { $sum: 1 }
      }
    }
  ]);

  return result.length > 0 ? result[0] : { totalWalletSpent: 0, totalOrders: 0 };
};

// Indexes for better performance
orderSchema.index({ orderId: 1 });
orderSchema.index({ secretCode: 1 });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ 'shippingAddress.pinCode': 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ walletDeduction: 1 });

module.exports = mongoose.model("Order", orderSchema);