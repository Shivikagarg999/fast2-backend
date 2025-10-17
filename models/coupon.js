const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },
    description: {
      type: String,
      required: true
    },
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      required: true
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0
    },
    minOrderAmount: {
      type: Number,
      default: 0
    },
    maxDiscountAmount: {
      type: Number,
      default: null
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    usageLimit: {
      type: Number,
      default: null
    },
    usedCount: {
      type: Number,
      default: 0
    },
    perUserLimit: {
      type: Number,
      default: 1
    },
    isActive: {
      type: Boolean,
      default: true
    },
    applicableCategories: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category"
    }],
    excludedProducts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product"
    }]
  },
  { timestamps: true }
);

couponSchema.index({ code: 1 });
couponSchema.index({ startDate: 1, endDate: 1 });
couponSchema.index({ isActive: 1 });

couponSchema.statics.validateCoupon = async function(code, userId, orderAmount) {
  const coupon = await this.findOne({ 
    code: code.toUpperCase(), 
    isActive: true 
  });
  
  if (!coupon) {
    throw new Error("Invalid coupon code");
  }

  const now = new Date();
  if (now < coupon.startDate || now > coupon.endDate) {
    throw new Error("Coupon is expired or not yet active");
  }

  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    throw new Error("Coupon usage limit reached");
  }

  if (orderAmount < coupon.minOrderAmount) {
    throw new Error(`Minimum order amount should be ₹${coupon.minOrderAmount}`);
  }

  return coupon;
};

couponSchema.methods.calculateDiscount = function(orderAmount) {
  let discount = 0;
  
  if (this.discountType === "percentage") {
    discount = (orderAmount * this.discountValue) / 100;
    if (this.maxDiscountAmount && discount > this.maxDiscountAmount) {
      discount = this.maxDiscountAmount;
    }
  } else {
    discount = this.discountValue;
  }
  
  return Math.min(discount, orderAmount);
};

module.exports = mongoose.model("Coupon", couponSchema);