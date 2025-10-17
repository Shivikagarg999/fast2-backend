const Order = require("../../models/order");
const Cart = require("../../models/cart");

exports.createOrder = async (req, res) => {
  try {
    const { shippingAddress, paymentMethod, couponCode } = req.body;
    const userId = req.user._id;

    const cart = await Cart.findOne({ user: userId }).populate("items.product");
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    let discount = 0;
    let couponData = null;

    if (couponCode) {
      try {
        const coupon = await Coupon.validateCoupon(couponCode, userId, cart.total);
        
        const userCouponUsage = await Order.countDocuments({
          user: userId,
          "coupon.code": couponCode.toUpperCase()
        });

        if (userCouponUsage >= coupon.perUserLimit) {
          return res.status(400).json({ message: "You have already used this coupon" });
        }

        discount = coupon.calculateDiscount(cart.total);
        couponData = {
          code: coupon.code,
          discount: discount
        };

        coupon.usedCount += 1;
        await coupon.save();

      } catch (couponError) {
        return res.status(400).json({ message: couponError.message });
      }
    }

    const finalAmount = cart.total - discount;

    const order = new Order({
      user: userId,
      items: cart.items,
      total: cart.total,
      coupon: couponData,
      finalAmount,
      shippingAddress, 
      paymentMethod
    });

    await order.save();

    cart.items = [];
    cart.total = 0;
    await cart.save();

    res.status(201).json(order);
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const userId = req.user._id;
    const orders = await Order.find({ user: userId }).populate("items.product");
    res.json(orders);
  } catch (err) {
    console.error("Get my orders error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied, admin only" });
    }

    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.orderId,
      { status },
      { new: true }
    ).populate("items.product");

    if (!order) return res.status(404).json({ message: "Order not found" });

    res.json(order);
  } catch (err) {
    console.error("Update status error:", err);
    res.status(500).json({ message: "Server error" });
  }
};