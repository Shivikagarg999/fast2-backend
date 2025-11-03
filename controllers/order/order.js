const Order = require("../../models/order");
const Cart = require("../../models/cart");
const mongoose = require("mongoose");
const User = require("../../models/user");

exports.createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      items,
      shippingAddress,
      paymentMethod = "cod",
      useWallet = false,
      coupon
    } = req.body;

    const userId = req.user._id;

    console.log('Order creation request:', { items, useWallet, userId });

    // Validate required fields
    if (!items || !items.length) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: "Order items are required"
      });
    }

    if (!shippingAddress) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: "Shipping address is required"
      });
    }

    // Calculate total amount
    let total = 0;
    for (const item of items) {
      total += item.price * item.quantity;
    }

    // Apply coupon discount if any
    let discount = 0;
    let finalAmount = total;
    
    if (coupon && coupon.discount) {
      discount = Math.min(coupon.discount, total); // Ensure discount doesn't exceed total
      finalAmount = total - discount;
    }

    // Check wallet balance and process wallet payment
    let walletDeduction = 0;
    let cashOnDelivery = finalAmount;
    let paymentStatus = "pending";

    if (useWallet) {
      const user = await User.findById(userId).session(session);
      
      if (!user) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          error: "User not found"
        });
      }

      const walletBalance = user.wallet || 0;
      console.log('User wallet balance:', walletBalance);
      
      if (walletBalance > 0) {
        // Deduct from wallet (up to the final amount)
        walletDeduction = Math.min(walletBalance, finalAmount);
        cashOnDelivery = finalAmount - walletDeduction;
        
        console.log('Wallet deduction calculation:', {
          walletBalance,
          finalAmount,
          walletDeduction,
          cashOnDelivery
        });

        // Update user wallet
        user.wallet = parseFloat((walletBalance - walletDeduction).toFixed(2));
        await user.save({ session });

        console.log('Updated user wallet:', user.wallet);

        // If full amount paid from wallet, update payment status
        if (cashOnDelivery === 0) {
          paymentStatus = "paid";
        }
      } else {
        console.log('Wallet balance is 0, skipping wallet deduction');
      }
    }

    // Create order
    const order = new Order({
      user: userId,
      items,
      total,
      coupon: coupon || {},
      finalAmount,
      shippingAddress,
      paymentMethod,
      paymentStatus,
      walletDeduction,
      cashOnDelivery
    });

    await order.save({ session });
    
    // Commit transaction
    await session.commitTransaction();
    session.endSession();
    
    // Populate the order with user details
    await order.populate('user', 'name phone email');

    const response = {
      success: true,
      message: "Order created successfully",
      order: {
        orderId: order.orderId,
        secretCode: order.secretCode,
        total,
        finalAmount,
        walletDeduction,
        cashOnDelivery,
        paymentStatus: order.paymentStatus,
        status: order.status,
        items: order.items,
        shippingAddress: order.shippingAddress,
        createdAt: order.createdAt
      }
    };

    console.log('Order created successfully:', response);
    return res.status(201).json(response);

  } catch (err) {
    // Abort transaction on error
    await session.abortTransaction();
    session.endSession();
    
    console.error("Error in createOrder:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
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