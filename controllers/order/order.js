const Order = require("../../models/order");
const Cart = require("../../models/cart");
const mongoose = require("mongoose");
const User = require("../../models/user");
const Product = require("../../models/product");

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

    const shippingPincode = shippingAddress.pincode || shippingAddress.pinCode;
    if (!shippingPincode) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: "Shipping address pincode is required",
        debug: {
          availableFields: Object.keys(shippingAddress),
          receivedPinCode: shippingAddress.pinCode,
          receivedPincode: shippingAddress.pincode
        }
      });
    }

    const productIds = items.map(item => item.product);

    const products = await Product.find({ 
      _id: { $in: productIds } 
    }).session(session);

    products.forEach((product, index) => {
      console.log(`  Product ${index + 1}:`, {
        id: product._id.toString(),
        name: product.name,
        serviceablePincodes: product.serviceablePincodes,
        serviceablePincodesCount: product.serviceablePincodes?.length || 0
      });
    });
    
    const nonServiceableProducts = [];
    
    for (const item of items) {
      const product = products.find(p => p._id.toString() === item.product.toString());
      
      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          error: `Product not found: ${item.product}`
        });
      }
      
      if (product.serviceablePincodes && product.serviceablePincodes.length > 0) {

        product.serviceablePincodes.forEach((pincode, idx) => {
          console.log(`  Pincode ${idx + 1}:`, {
            raw: pincode,
            type: typeof pincode,
            length: pincode.length,
            charCodes: Array.from(pincode.toString()).map(c => c.charCodeAt(0)),
            trimmed: pincode.toString().trim(),
            matches: pincode.toString().trim() === shippingPincode.toString().trim()
          });
        });

        const comparisonMethods = {
          direct: product.serviceablePincodes.includes(shippingPincode),
          stringDirect: product.serviceablePincodes.map(p => p.toString()).includes(shippingPincode.toString()),
          trimmed: product.serviceablePincodes.some(p => p.toString().trim() === shippingPincode.toString().trim()),
          loose: product.serviceablePincodes.some(p => p.toString().replace(/\s/g, '') === shippingPincode.toString().replace(/\s/g, '')),
          numberCompare: product.serviceablePincodes.some(p => parseInt(p) === parseInt(shippingPincode))
        };

        const isServiceable = product.serviceablePincodes.some(pincode => 
          pincode.toString().trim() === shippingPincode.toString().trim()
        );
        
        if (!isServiceable) {
          nonServiceableProducts.push({
            productId: product._id,
            productName: product.name,
            serviceablePincodes: product.serviceablePincodes,
            requestedPincode: shippingPincode,
            comparisonDetails: comparisonMethods
          });
        }
      } else {
        console.log('❌ No serviceable pincodes defined for product');
        nonServiceableProducts.push({
          productId: product._id,
          productName: product.name,
          serviceablePincodes: [],
          requestedPincode: shippingPincode
        });
      }
    }

    if (nonServiceableProducts.length > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: "Some products are not serviceable to your pincode",
        nonServiceableProducts,
        shippingPincode,
        debug: {
          pincodeAnalysis: {
            value: shippingPincode,
            type: typeof shippingPincode,
            length: shippingPincode.length,
            charCodes: Array.from(shippingPincode).map(c => c.charCodeAt(0)),
            sourceField: shippingAddress.pincode ? 'pincode' : 'pinCode'
          }
        }
      });
    }

    let total = 0;
    for (const item of items) {
      total += item.price * item.quantity;
    }

    let discount = 0;
    let finalAmount = total;

    if (coupon && coupon.discount) {
      discount = Math.min(coupon.discount, total);
      finalAmount = total - discount;
    }

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
      
      if (walletBalance > 0) {
        walletDeduction = Math.min(walletBalance, finalAmount);
        cashOnDelivery = finalAmount - walletDeduction;

        user.wallet = parseFloat((walletBalance - walletDeduction).toFixed(2));
        await user.save({ session });

        console.log('📊 Updated wallet balance:', user.wallet);

        if (cashOnDelivery === 0) {
          paymentStatus = "paid";
        }
      } else {
        console.log('💸 Wallet balance is 0, skipping wallet deduction');
      }
    }

    const normalizedShippingAddress = {
      ...shippingAddress,
      pincode: shippingPincode
    };

    const order = new Order({
      user: userId,
      items,
      total,
      coupon: coupon || {},
      finalAmount,
      shippingAddress: normalizedShippingAddress,
      paymentMethod,
      paymentStatus,
      walletDeduction,
      cashOnDelivery
    });

    await order.save({ session });
    
    await session.commitTransaction();
    session.endSession();
    
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

    return res.status(201).json(response);

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      debug: err.message
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