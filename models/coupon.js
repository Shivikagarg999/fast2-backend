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
    benefitType: {
      type: String,
      enum: ["amount_discount", "free_quantity"],
      default: "amount_discount"
    },
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      required: function () {
        return this.benefitType !== "free_quantity";
      }
    },
    discountValue: {
      type: Number,
      required: function () {
        return this.benefitType !== "free_quantity";
      },
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
    applicableProducts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product"
    }],
    freebieRule: {
      buyQuantity: { type: Number, min: 0 },
      buyUnit: { type: String, enum: ["g", "kg", "ml", "l", "piece"], default: "kg" },
      freeQuantity: { type: Number, min: 0 },
      freeUnit: { type: String, enum: ["g", "kg", "ml", "l", "piece"], default: "kg" }
    },
    excludedProducts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product"
    }]
  },
  { timestamps: true }
);


couponSchema.index({ startDate: 1, endDate: 1 });
couponSchema.index({ isActive: 1 });
couponSchema.index({ benefitType: 1 });

const toId = (value) => value?._id?.toString?.() || value?.toString?.() || "";

const unitGroup = (unit) => {
  const normalized = String(unit || "").toLowerCase();
  if (["kg", "g", "gram", "grams", "kilogram", "kilograms"].includes(normalized)) return "weight";
  if (["l", "ml", "liter", "litre", "liters", "litres"].includes(normalized)) return "volume";
  return "piece";
};

const toBaseQuantity = (quantity, unit) => {
  const value = Number(quantity) || 0;
  const normalized = String(unit || "").toLowerCase();
  if (["kg", "kilogram", "kilograms"].includes(normalized)) return value * 1000;
  if (["l", "liter", "litre", "liters", "litres"].includes(normalized)) return value * 1000;
  return value;
};

couponSchema.statics.validateCoupon = async function (code, userId, orderAmount) {
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

couponSchema.methods.calculateDiscount = function (orderAmount) {
  if (this.benefitType === "free_quantity") {
    return 0;
  }

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

couponSchema.methods.matchesProduct = function (product) {
  const productId = toId(product?._id || product);
  const categoryId = toId(product?.category);

  const isExcluded = this.excludedProducts?.some((id) => toId(id) === productId);
  if (isExcluded) return false;

  const hasProductScope = this.applicableProducts?.length > 0;
  const hasCategoryScope = this.applicableCategories?.length > 0;

  if (!hasProductScope && !hasCategoryScope) return true;

  return (
    this.applicableProducts?.some((id) => toId(id) === productId) ||
    this.applicableCategories?.some((id) => toId(id) === categoryId)
  );
};

couponSchema.methods.calculateScopedDiscount = function (items, products, fallbackAmount) {
  if (this.benefitType === "free_quantity") {
    return 0;
  }

  const hasProductScope = this.applicableProducts?.length > 0;
  const hasCategoryScope = this.applicableCategories?.length > 0;
  if (!hasProductScope && !hasCategoryScope && !this.excludedProducts?.length) {
    return this.calculateDiscount(fallbackAmount);
  }

  const eligibleAmount = (items || []).reduce((sum, item) => {
    const product = (products || []).find((p) => toId(p?._id || p) === toId(item.product));
    if (!product || !this.matchesProduct(product)) return sum;

    const itemPrice = Number(item.price) || Number(product.effectivePrice) || Number(product.price) || 0;
    const itemQuantity = Number(item.quantity) || 0;
    return sum + (itemPrice * itemQuantity);
  }, 0);

  return this.calculateDiscount(Number(eligibleAmount.toFixed(2)));
};

couponSchema.methods.calculateFreeQuantityDiscount = function (items, products) {
  if (this.benefitType !== "free_quantity") {
    return { discount: this.calculateDiscount(0), appliedItems: [] };
  }

  const rule = this.freebieRule || {};
  const buyBase = toBaseQuantity(rule.buyQuantity, rule.buyUnit);
  const freeBase = toBaseQuantity(rule.freeQuantity, rule.freeUnit);
  const buyGroup = unitGroup(rule.buyUnit);
  const freeGroup = unitGroup(rule.freeUnit);

  if (!buyBase || !freeBase || buyGroup !== freeGroup) {
    throw new Error("Invalid free quantity coupon rule");
  }

  let discount = 0;
  const appliedItems = [];

  for (const item of items || []) {
    const product = (products || []).find((p) => toId(p) === toId(item.product));
    if (!product || !this.matchesProduct(product)) continue;

    const productUnit = product.unit || rule.buyUnit;
    if (unitGroup(productUnit) !== buyGroup) continue;

    const itemQuantity = Number(item.quantity) || 0;
    const itemPrice = Number(item.price) || Number(product.effectivePrice) || Number(product.price) || 0;
    const unitValueBase = toBaseQuantity(product.unitValue || 1, productUnit);
    const purchasedBase = unitValueBase * itemQuantity;
    const freeSets = Math.floor(purchasedBase / buyBase);
    if (!freeSets) continue;

    const freeBaseForItem = freeSets * freeBase;
    const discountForItem = Math.min((itemPrice / unitValueBase) * freeBaseForItem, itemPrice * itemQuantity);
    const roundedDiscount = Number(discountForItem.toFixed(2));
    discount += roundedDiscount;
    appliedItems.push({
      product: product._id,
      name: product.name,
      freeQuantity: freeBaseForItem,
      freeUnit: buyGroup === "weight" ? "g" : buyGroup === "volume" ? "ml" : "piece",
      discount: roundedDiscount
    });
  }

  return {
    discount: Number(discount.toFixed(2)),
    appliedItems
  };
};

module.exports = mongoose.model("Coupon", couponSchema);
