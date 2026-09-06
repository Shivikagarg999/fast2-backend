const Coupon = require("../../../models/coupon");
const Order = require("../../../models/order");
const Product = require("../../../models/product");

const normalizeCouponPayload = (body) => {
  const benefitType = body.benefitType || "amount_discount";
  const payload = {
    code: body.code?.toUpperCase(),
    description: body.description,
    benefitType,
    minOrderAmount: body.minOrderAmount || 0,
    maxDiscountAmount: benefitType === "amount_discount" ? body.maxDiscountAmount || null : null,
    startDate: new Date(body.startDate),
    endDate: new Date(body.endDate),
    usageLimit: body.usageLimit || null,
    perUserLimit: body.perUserLimit || 1,
    isActive: body.isActive !== undefined ? body.isActive : true,
    applicableCategories: body.applicableCategories || [],
    applicableProducts: body.applicableProducts || [],
    excludedProducts: body.excludedProducts || []
  };

  if (benefitType === "free_quantity") {
    payload.discountType = "fixed";
    payload.discountValue = 0;
    payload.freebieRule = {
      buyQuantity: Number(body.freebieRule?.buyQuantity),
      buyUnit: body.freebieRule?.buyUnit || "kg",
      freeQuantity: Number(body.freebieRule?.freeQuantity),
      freeUnit: body.freebieRule?.freeUnit || "kg"
    };

    if (!payload.freebieRule.buyQuantity || !payload.freebieRule.freeQuantity) {
      throw new Error("Buy quantity and free quantity are required");
    }
  } else {
    payload.discountType = body.discountType;
    payload.discountValue = Number(body.discountValue);
    payload.freebieRule = undefined;

    if (!payload.discountType || !Number.isFinite(payload.discountValue) || payload.discountValue <= 0) {
      throw new Error("Discount type and discount value are required");
    }
  }

  return payload;
};

const getCouponResponse = (coupon, discount = 0, extra = {}) => ({
  code: coupon.code,
  description: coupon.description,
  benefitType: coupon.benefitType,
  discountType: coupon.discountType,
  discountValue: coupon.discountValue,
  discountAmount: discount,
  minOrderAmount: coupon.minOrderAmount,
  maxDiscountAmount: coupon.maxDiscountAmount,
  applicableCategories: coupon.applicableCategories,
  applicableProducts: coupon.applicableProducts,
  freebieRule: coupon.freebieRule,
  ...extra
});

exports.createCoupon = async (req, res) => {
  try {

    const {
      code,
      description,
      benefitType,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      startDate,
      endDate,
      usageLimit,
      perUserLimit,
      applicableCategories,
      applicableProducts,
      freebieRule,
      excludedProducts
    } = req.body;

    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
      return res.status(400).json({ message: "Coupon code already exists" });
    }

    const coupon = new Coupon(normalizeCouponPayload({
      code,
      description,
      benefitType,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      startDate,
      endDate,
      usageLimit,
      perUserLimit,
      applicableCategories,
      applicableProducts,
      freebieRule,
      excludedProducts
    }));

    await coupon.save();
    res.status(201).json({
      message: "Coupon created successfully",
      coupon
    });
  } catch (err) {
    console.error("Create coupon error:", err);
    res.status(400).json({ message: err.message || "Server error" });
  }
};

exports.getAllCoupons = async (req, res) => {
  try {
  

    const coupons = await Coupon.find()
      .populate("applicableCategories", "name")
      .populate("applicableProducts", "name unit unitValue")
      .sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err) {
    console.error("Get coupons error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateCoupon = async (req, res) => {
  try {
   

    const updatePayload = normalizeCouponPayload(req.body);
    delete updatePayload.code;

    const coupon = await Coupon.findByIdAndUpdate(
      req.params.couponId,
      updatePayload,
      { new: true, runValidators: true }
    );

    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    res.json({
      message: "Coupon updated successfully",
      coupon
    });
  } catch (err) {
    console.error("Update coupon error:", err);
    res.status(400).json({ message: err.message || "Server error" });
  }
};

exports.deleteCoupon = async (req, res) => {
  try {
  
    const coupon = await Coupon.findByIdAndDelete(req.params.couponId);
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    res.json({ message: "Coupon deleted successfully" });
  } catch (err) {
    console.error("Delete coupon error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.toggleCouponStatus = async (req, res) => {
  try {
   

    const coupon = await Coupon.findById(req.params.couponId);
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    res.json({
      message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'} successfully`,
      coupon
    });
  } catch (err) {
    console.error("Toggle coupon status error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.applyCoupon = async (req, res) => {
  try {
    const { code, orderAmount, items = [] } = req.body;
    const userId = req.user._id;

    if (!code || !orderAmount) {
      return res.status(400).json({ message: "Coupon code and order amount are required" });
    }

    const userCouponUsage = await Order.countDocuments({
      user: userId,
      "coupon.code": code.toUpperCase()
    });

    const coupon = await Coupon.validateCoupon(code, userId, orderAmount);

    if (userCouponUsage >= coupon.perUserLimit) {
      return res.status(400).json({ message: "You have already used this coupon" });
    }

    const productIds = items.map((item) => item.product).filter(Boolean);
    const products = productIds.length
      ? await Product.find({ _id: { $in: productIds } }).populate("category")
      : [];

    let discount = coupon.calculateScopedDiscount(items, products, orderAmount);
    let freebieDetails = null;

    if (coupon.benefitType === "free_quantity") {
      const result = coupon.calculateFreeQuantityDiscount(items, products);
      discount = result.discount;
      freebieDetails = { appliedItems: result.appliedItems };
    }

    if (discount <= 0) {
      return res.status(400).json({ message: "Coupon is not applicable on selected products" });
    }

    const finalAmount = orderAmount - discount;

    res.json({
      valid: true,
      coupon: getCouponResponse(coupon, discount, freebieDetails || {}),
      orderAmount,
      discount,
      finalAmount
    });
  } catch (err) {
    res.status(400).json({
      valid: false,
      message: err.message
    });
  }
};

exports.getActiveCoupons = async (req, res) => {
  try {
    const now = new Date();
    const coupons = await Coupon.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      $or: [
        { usageLimit: null },
        { usageLimit: { $gt: { $expr: "$usedCount" } } }
      ]
    }).select('code description benefitType discountType discountValue minOrderAmount maxDiscountAmount endDate applicableCategories applicableProducts freebieRule');

    res.json(coupons);
  } catch (err) {
    console.error("Get active coupons error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
