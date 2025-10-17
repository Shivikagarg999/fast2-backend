const Coupon = require("../../../models/coupon");
const Order = require("../../../models/order");

exports.createCoupon = async (req, res) => {
  try {

    const {
      code,
      description,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      startDate,
      endDate,
      usageLimit,
      perUserLimit,
      applicableCategories,
      excludedProducts
    } = req.body;

    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
      return res.status(400).json({ message: "Coupon code already exists" });
    }

    const coupon = new Coupon({
      code: code.toUpperCase(),
      description,
      discountType,
      discountValue,
      minOrderAmount: minOrderAmount || 0,
      maxDiscountAmount: maxDiscountAmount || null,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      usageLimit: usageLimit || null,
      perUserLimit: perUserLimit || 1,
      applicableCategories: applicableCategories || [],
      excludedProducts: excludedProducts || []
    });

    await coupon.save();
    res.status(201).json({
      message: "Coupon created successfully",
      coupon
    });
  } catch (err) {
    console.error("Create coupon error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getAllCoupons = async (req, res) => {
  try {
  

    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err) {
    console.error("Get coupons error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateCoupon = async (req, res) => {
  try {
   

    const coupon = await Coupon.findByIdAndUpdate(
      req.params.couponId,
      req.body,
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
    res.status(500).json({ message: "Server error" });
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
    const { code, orderAmount } = req.body;
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

    const discount = coupon.calculateDiscount(orderAmount);
    const finalAmount = orderAmount - discount;

    res.json({
      valid: true,
      coupon: {
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount: discount,
        minOrderAmount: coupon.minOrderAmount,
        maxDiscountAmount: coupon.maxDiscountAmount
      },
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
    }).select('code description discountType discountValue minOrderAmount maxDiscountAmount endDate');

    res.json(coupons);
  } catch (err) {
    console.error("Get active coupons error:", err);
    res.status(500).json({ message: "Server error" });
  }
};