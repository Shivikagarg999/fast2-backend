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
    },
    payout: {
      seller: {
        payableAmount: { type: Number, default: 0 },
        gstDeduction: { type: Number, default: 0 },
        tdsDeduction: { type: Number, default: 0 },
        netAmount: { type: Number, default: 0 },
        payoutStatus: { 
          type: String, 
          enum: ["pending", "processing", "paid", "failed"], 
          default: "pending" 
        },
        paidAt: { type: Date }
      },
      promotor: {
        commissionAmount: { type: Number, default: 0 },
        commissionType: { type: String, enum: ["percentage", "fixed"], default: "percentage" },
        commissionRate: { type: Number, default: 0 },
        payoutStatus: { 
          type: String, 
          enum: ["pending", "processing", "paid", "failed"], 
          default: "pending" 
        },
        paidAt: { type: Date }
      },
      platform: {
        serviceFee: { type: Number, default: 0 },
        gstCollection: { type: Number, default: 0 }
      }
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

      if (this.walletDeduction > 0 && this.cashOnDelivery === 0) {
        this.cashOnDelivery = this.finalAmount - this.walletDeduction;
      }

      if (this.walletDeduction >= this.finalAmount) {
        this.paymentStatus = "paid";
        this.cashOnDelivery = 0;
      }

      await this.calculatePayouts();
      await this.createPayoutRecords();
      
    } catch (error) {
      return next(error);
    }
  }

  if (this.cashOnDelivery < 0) {
    this.cashOnDelivery = 0;
  }

  next();
});

orderSchema.methods.calculatePayouts = async function() {
  const Product = mongoose.model('Product');
  const Seller = mongoose.model('Seller');
  
  const sellerData = await Seller.findById(this.seller);
  if (!sellerData) return;

  const productIds = this.items.map(item => item.product);
  const products = await Product.find({ _id: { $in: productIds } });

  const platformFeePercentage = 10;
  const gstRate = 18;
  const tdsRate = 1;

  const platformFee = (this.finalAmount * platformFeePercentage) / 100;
  const gstOnPlatformFee = (platformFee * gstRate) / 100;
  const tdsDeduction = (this.finalAmount * tdsRate) / 100;

  const payableAmount = this.finalAmount - platformFee - gstOnPlatformFee;
  const netAmount = payableAmount - tdsDeduction;

  this.payout.seller.payableAmount = payableAmount;
  this.payout.seller.gstDeduction = gstOnPlatformFee;
  this.payout.seller.tdsDeduction = tdsDeduction;
  this.payout.seller.netAmount = netAmount;

  this.payout.platform.serviceFee = platformFee;
  this.payout.platform.gstCollection = gstOnPlatformFee;

  let promotorCommission = 0;
  for (const item of this.items) {
    const product = products.find(p => p._id.toString() === item.product.toString());
    if (product && product.promotor && product.promotor.id) {
      const commissionRate = product.promotor.commissionRate || 5;
      const commissionType = product.promotor.commissionType || 'percentage';
      
      let commissionAmount = 0;
      if (commissionType === 'percentage') {
        commissionAmount = (item.price * item.quantity * commissionRate) / 100;
      } else if (commissionType === 'fixed') {
        commissionAmount = product.promotor.commissionAmount * item.quantity;
      }
      
      promotorCommission += commissionAmount;
    }
  }

  this.payout.promotor.commissionAmount = promotorCommission;
  this.payout.promotor.commissionRate = 5;
};

orderSchema.methods.createPayoutRecords = async function() {
  const SellerPayout = mongoose.model('SellerPayout');
  const PromotorPayout = mongoose.model('PromotorPayout');
  const Product = mongoose.model('Product');
  const Seller = mongoose.model('Seller');
  
  const seller = await Seller.findById(this.seller);
  if (!seller) return;
  
  const productIds = this.items.map(item => item.product);
  const products = await Product.find({ _id: { $in: productIds } });
  
  const platformFeePercentage = 10;
  const gstRate = 18;
  const tdsRate = 1;
  
  const platformFee = (this.finalAmount * platformFeePercentage) / 100;
  const gstOnPlatformFee = (platformFee * gstRate) / 100;
  const tdsDeduction = (this.finalAmount * tdsRate) / 100;
  
  const payableAmount = this.finalAmount - platformFee - gstOnPlatformFee;
  const netAmount = payableAmount - tdsDeduction;
  
  const sellerPayout = new SellerPayout({
    order: this._id,
    seller: this.seller,
    orderAmount: this.finalAmount,
    platformFee: platformFee,
    platformFeePercentage: platformFeePercentage,
    gstOnPlatformFee: gstOnPlatformFee,
    gstRate: gstRate,
    tdsDeduction: tdsDeduction,
    tdsRate: tdsRate,
    payableAmount: payableAmount,
    netAmount: netAmount,
    status: "pending"
  });
  
  await sellerPayout.save();
  
  for (const item of this.items) {
    const product = products.find(p => p._id.toString() === item.product.toString());
    if (product && product.promotor && product.promotor.id) {
      const commissionRate = product.promotor.commissionRate || 5;
      const commissionType = product.promotor.commissionType || 'percentage';
      
      let commissionAmount = 0;
      if (commissionType === 'percentage') {
        commissionAmount = (item.price * item.quantity * commissionRate) / 100;
      } else if (commissionType === 'fixed') {
        commissionAmount = product.promotor.commissionAmount * item.quantity;
      }
      
      const promotorPayout = new PromotorPayout({
        order: this._id,
        promotor: product.promotor.id,
        seller: this.seller,
        commissionType: commissionType,
        commissionRate: commissionRate,
        orderAmount: item.price * item.quantity,
        commissionAmount: commissionAmount,
        status: "pending"
      });
      
      await promotorPayout.save();
    }
  }
};

orderSchema.virtual('displayAmount').get(function() {
  return this.cashOnDelivery > 0 ? this.cashOnDelivery : this.finalAmount;
});

orderSchema.virtual('paymentMethodDisplay').get(function() {
  if (this.walletDeduction > 0 && this.cashOnDelivery > 0) {
    return 'Wallet + COD';
  } else if (this.walletDeduction > 0) {
    return 'Wallet';
  } else {
    return this.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online';
  }
});

orderSchema.methods.canCancel = function() {
  const nonCancellableStatuses = ['picked-up', 'delivered'];
  return !nonCancellableStatuses.includes(this.status);
};

orderSchema.methods.processCancellation = async function(reason = '') {
  if (!this.canCancel()) {
    throw new Error('Order cannot be cancelled at this stage');
  }

  this.status = 'cancelled';
  this.cancelledAt = new Date();
  this.cancellationReason = reason;

  if (this.walletDeduction > 0) {
    this.refundAmount = this.walletDeduction;
    this.refundStatus = 'pending';
    
    const User = mongoose.model('User');
    await User.findByIdAndUpdate(this.user, {
      $inc: { wallet: this.walletDeduction }
    });

    this.refundStatus = 'processed';
    this.refundedAt = new Date();
  }

  return this.save();
};

orderSchema.statics.findByUserWithWallet = function(userId) {
  return this.find({ user: userId })
    .populate('items.product')
    .sort({ createdAt: -1 });
};

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

orderSchema.index({ orderId: 1 });
orderSchema.index({ secretCode: 1 });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ 'shippingAddress.pinCode': 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ walletDeduction: 1 });

module.exports = mongoose.model("Order", orderSchema);