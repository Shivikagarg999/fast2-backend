const Order = require('../../models/order');
const Product = require('../../models/product');
const User = require('../../models/user');
const Seller = require('../../models/seller');
const Promotor = require('../../models/promotor');
const Payout = require('../../models/payout');
const Coupon = require('../../models/coupon');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const imagekit = require('../../utils/imagekit');
const Shop = require('../../models/shop');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

exports.createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let {
      items,
      shippingAddress,
      paymentMethod = "cod",
      useWallet = false,
      coupon,
      scratchCouponCode
    } = req.body;

    if (typeof items === 'string') {
      try {
        items = JSON.parse(items);
      } catch (e) {
        console.error("Failed to parse items:", e);
      }
    }
    if (typeof shippingAddress === 'string') {
      try {
        shippingAddress = JSON.parse(shippingAddress);
      } catch (e) {
        console.error("Failed to parse shippingAddress:", e);
      }
    }

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
        error: "Shipping address pincode is required"
      });
    }

    const productIds = items.map(item => item.product);

    const products = await Product.find({
      _id: { $in: productIds }
    })
      .populate('seller')
      .populate('shop')
      .populate('promotor.id')
      .populate('category')
      .session(session);

    const sellerIds = [...new Set(products.map(p => p.seller?._id || p.seller).filter(id => id))];
    const shops = await Shop.find({ seller: { $in: sellerIds } });
    const medicalSellerIds = shops.filter(s => s.shopType === 'medical').map(s => s.seller.toString());

    console.log('--- Order Prescription Check ---');
    console.log('Items in order:', items);
    console.log('Products found:', products.length);
    console.log('Seller IDs from products:', sellerIds);
    console.log('Shops found for those sellers:', shops.map(s => ({ id: s._id, seller: s.seller, type: s.shopType })));
    console.log('Medical Seller IDs:', medicalSellerIds);

    const involvesMedicalShop = products.some(p => {
      const isDirectShopMedical = p.shop && p.shop.shopType === 'medical';
      const sellerIdStr = (p.seller?._id || p.seller)?.toString();
      const isSellerShopMedical = sellerIdStr && medicalSellerIds.includes(sellerIdStr);
      console.log(`Product ${p._id}: directMedical=${isDirectShopMedical}, sellerMedical=${isSellerShopMedical} (Seller: ${sellerIdStr})`);
      return isDirectShopMedical || isSellerShopMedical;
    });

    console.log('Involves medical shop (robust check):', involvesMedicalShop);
    console.log('Received file:', req.file ? { fieldname: req.file.fieldname, originalname: req.file.originalname } : 'None');

    if (involvesMedicalShop && (!req.file || req.file.fieldname !== 'prescriptionImage')) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: "Prescription image is required for products from medical shops"
      });
    }

    let uploadedPrescription = null;
    if (involvesMedicalShop && req.file) {
      try {
        const uploadResult = await imagekit.upload({
          file: req.file.buffer.toString('base64'),
          fileName: `prescription_${userId}_${Date.now()}.jpg`,
          folder: '/orders/prescriptions',
          useUniqueFileName: true
        });
        uploadedPrescription = {
          url: uploadResult.url,
          fileId: uploadResult.fileId
        };
      } catch (uploadError) {
        await session.abortTransaction();
        session.endSession();
        console.error('Prescription upload error:', uploadError);
        return res.status(500).json({
          success: false,
          error: "Failed to upload prescription image"
        });
      }
    }

    if (products.length !== items.length) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        error: "Some products not found",
        requested: items.length,
        found: products.length
      });
    }

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
        const isServiceable = product.serviceablePincodes.some(pincode =>
          pincode.toString().trim() === shippingPincode.toString().trim()
        );

        if (!isServiceable) {
          nonServiceableProducts.push({
            productId: product._id,
            productName: product.name,
            serviceablePincodes: product.serviceablePincodes,
            requestedPincode: shippingPincode
          });
        }
      }
    }

    if (nonServiceableProducts.length > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: "Some products are not serviceable to your pincode",
        nonServiceableProducts,
        shippingPincode
      });
    }

    // Check shop timing validation
    const shopMap = new Map(shops.map(shop => [shop.seller.toString(), shop]));
    
    const closedShops = [];
    for (const sellerId of sellerIds) {
      const shop = shopMap.get(sellerId);
      if (shop && !shop.isCurrentlyOpen()) {
        const shopStatus = shop.getShopStatus();
        closedShops.push({
          sellerId,
          shopName: shop.shopName,
          currentStatus: shopStatus,
          nextOpenTime: shopStatus.nextOpenTime
        });
      }
    }

    if (closedShops.length > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: "Some shops are currently closed",
        closedShops,
        message: "Cannot place order when shops are closed. Please try again during business hours."
      });
    }

    let subtotal = 0;
    let totalGst = 0;
    let deliveryCharges = 0;
    let isFreeDelivery = false;

    const sellerDeliveryMap = new Map();

    for (const item of items) {
      const product = products.find(p => p._id.toString() === item.product.toString());
      const itemTotal = item.price * item.quantity;
      subtotal += itemTotal;

      const itemGstPercent = product.category?.gstPercent || 0;
      totalGst += parseFloat(((itemTotal * itemGstPercent) / 100).toFixed(2));

      const productDelivery = product.delivery || {};
      const productDeliveryCharges = productDelivery.deliveryCharges || 0;
      const productFreeThreshold = productDelivery.freeDeliveryThreshold || 0;

      if (product.seller) {
        const sellerId = product.seller._id.toString();

        if (sellerDeliveryMap.has(sellerId)) {
          const existing = sellerDeliveryMap.get(sellerId);
          sellerDeliveryMap.set(sellerId, {
            ...existing,
            subtotal: existing.subtotal + itemTotal,
            highestDeliveryCharge: Math.max(existing.highestDeliveryCharge, productDeliveryCharges),
            lowestFreeThreshold: existing.lowestFreeThreshold > 0 ?
              Math.min(existing.lowestFreeThreshold, productFreeThreshold) :
              productFreeThreshold,
            items: [...existing.items, { productId: product._id, itemTotal }]
          });
        } else {
          sellerDeliveryMap.set(sellerId, {
            sellerId: sellerId,
            sellerName: product.seller.name,
            subtotal: itemTotal,
            highestDeliveryCharge: productDeliveryCharges,
            lowestFreeThreshold: productFreeThreshold,
            items: [{ productId: product._id, itemTotal }]
          });
        }
      } else {
        deliveryCharges += productDeliveryCharges;

        if (productFreeThreshold > 0 && itemTotal >= productFreeThreshold) {
          isFreeDelivery = true;
        }
      }
    }

    for (const [sellerId, sellerData] of sellerDeliveryMap.entries()) {
      if (sellerData.lowestFreeThreshold > 0 && sellerData.subtotal >= sellerData.lowestFreeThreshold) {
        continue;
      }

      deliveryCharges += sellerData.highestDeliveryCharge;
    }

    const anySellerFreeDelivery = Array.from(sellerDeliveryMap.values()).some(seller =>
      seller.lowestFreeThreshold > 0 && seller.subtotal >= seller.lowestFreeThreshold
    );

    if (anySellerFreeDelivery) {
      deliveryCharges = 0;
      isFreeDelivery = true;
    }

    // Global Free Delivery Threshold
    if (subtotal > 199) {
      deliveryCharges = 0;
      isFreeDelivery = true;
    }

    const HANDLING_CHARGE_PER_SHOP = 2;
    const numberOfShops = sellerDeliveryMap.size;
    const handlingCharge = numberOfShops * HANDLING_CHARGE_PER_SHOP;

    let total = subtotal + deliveryCharges + handlingCharge;
    totalGst = parseFloat(totalGst.toFixed(2));

    let discount = 0;
    let finalAmount = parseFloat((total + totalGst).toFixed(2));

    if (coupon && coupon.discount) {
      discount = Math.min(coupon.discount, finalAmount);
      finalAmount = parseFloat((finalAmount - discount).toFixed(2));
    }

    let scratchCouponDiscount = 0;
    let scratchCouponOrder = null;
    let scratchCouponDetails = null;

    if (scratchCouponCode) {
      scratchCouponOrder = await Order.findOne({
        user: userId,
        'orderScratchCard.couponCode': scratchCouponCode.toUpperCase(),
        'orderScratchCard.isScratched': true,
        'orderScratchCard.isRedeemed': false
      });

      if (!scratchCouponOrder) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          error: 'Invalid or already redeemed scratch card coupon'
        });
      }

      try {
        const scratchCoupon = await Coupon.validateCoupon(scratchCouponCode, userId, finalAmount);
        scratchCouponDiscount = scratchCoupon.calculateDiscount(finalAmount);
        finalAmount = parseFloat((finalAmount - scratchCouponDiscount).toFixed(2));
        scratchCouponDetails = {
          code: scratchCoupon.code,
          discountType: scratchCoupon.discountType,
          discountValue: scratchCoupon.discountValue,
          discountAmount: scratchCouponDiscount
        };
      } catch (err) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, error: err.message });
      }
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

        if (cashOnDelivery === 0 && paymentMethod === "cod") {
          paymentStatus = "paid";
        }
      }
    }

    let razorpayOrder = null;
    if (paymentMethod === "online") {
      try {
        const razorpayOptions = {
          amount: Math.round(cashOnDelivery * 100),
          currency: "INR",
          receipt: `order_${Date.now()}`,
          notes: {
            userId: userId.toString(),
            orderId: `pending_${Date.now()}`
          }
        };

        razorpayOrder = await razorpay.orders.create(razorpayOptions);

        paymentStatus = "pending";
        cashOnDelivery = 0;
      } catch (razorpayError) {
        await session.abortTransaction();
        session.endSession();
        return res.status(500).json({
          success: false,
          error: "Failed to create Razorpay order",
          debug: razorpayError.message,
          razorpayError: razorpayError.error || {}
        });
      }
    }

    const normalizedShippingAddress = {
      ...shippingAddress,
      pincode: shippingPincode
    };

    const sellerMap = new Map();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const product = products[i];

      if (product.seller) {
        const sellerId = product.seller._id.toString();
        const itemTotal = item.price * item.quantity;
        const sellerAmount = (itemTotal * 30) / 100;

        if (sellerMap.has(sellerId)) {
          const existing = sellerMap.get(sellerId);
          sellerMap.set(sellerId, {
            amount: existing.amount + sellerAmount,
            count: existing.count + 1,
            seller: product.seller
          });
        } else {
          sellerMap.set(sellerId, {
            amount: sellerAmount,
            count: 1,
            seller: product.seller
          });
        }
      }
    }

    const orderItems = items.map(item => {
      const product = products.find(p => p._id.toString() === item.product.toString());
      const gstPercent = product?.category?.gstPercent || 0;
      const gstAmount = parseFloat(((item.price * item.quantity * gstPercent) / 100).toFixed(2));
      return {
        product: item.product,
        quantity: item.quantity,
        price: item.price,
        gstPercent,
        gstAmount
      };
    });
    let orderScratchCard = { isEligible: false, couponCode: null, isScratched: false, scratchedAt: null };
    if (subtotal > 199) {
      const now = new Date();
      const availableCoupons = await Coupon.find({
        isActive: true,
        startDate: { $lte: now },
        endDate: { $gte: now },
        $or: [{ usageLimit: null }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }]
      }).lean();

      if (availableCoupons.length > 0) {
        const picked = availableCoupons[Math.floor(Math.random() * availableCoupons.length)];
        orderScratchCard = { isEligible: true, couponCode: picked.code, isScratched: false, scratchedAt: null };
      }
    }

    const firstSellerEntry = Array.from(sellerMap.values())[0];
    const primarySeller = firstSellerEntry ? firstSellerEntry.seller._id : null;

    if (!primarySeller) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: "No valid sellers found for products"
      });
    }

    const order = new Order({
      user: userId,
      items: orderItems,
      subtotal: subtotal,
      deliveryCharges: deliveryCharges,
      isFreeDelivery: isFreeDelivery,
      handlingCharge: handlingCharge,
      total: total,
      totalGst: totalGst,
      coupon: coupon || {},
      finalAmount: finalAmount,
      shippingAddress: normalizedShippingAddress,
      paymentMethod,
      paymentStatus,
      walletDeduction,
      cashOnDelivery,
      seller: primarySeller,
      orderScratchCard,
      ...(paymentMethod === "online" && razorpayOrder && {
        razorpayOrderId: razorpayOrder.id,
        razorpayReceipt: razorpayOrder.receipt,
        razorpayAmount: razorpayOrder.amount,
        razorpayCurrency: razorpayOrder.currency
      }),
      ...(uploadedPrescription && { prescriptionImage: uploadedPrescription })
    });

    await order.save({ session });

    const payoutPromises = [];

    for (const [sellerId, data] of sellerMap.entries()) {
      const sellerAmount = parseFloat(data.amount.toFixed(2));

      const payout = new Payout({
        seller: sellerId,
        order: order._id,
        orderId: order.orderId,
        amount: sellerAmount,
        percentage: 30,
        status: 'pending'
      });

      payoutPromises.push(payout.save({ session }));

      payoutPromises.push(
        Seller.findByIdAndUpdate(
          sellerId,
          {
            $inc: {
              totalEarnings: sellerAmount,
              totalOrders: 1
            }
          },
          { session }
        )
      );
    }

    await Promise.all(payoutPromises);

    await session.commitTransaction();
    session.endSession();

    if (scratchCouponOrder) {
      scratchCouponOrder.orderScratchCard.isRedeemed = true;
      scratchCouponOrder.orderScratchCard.redeemedAt = new Date();
      await scratchCouponOrder.save();
    }

    const response = {
      success: true,
      message: "Order created successfully",
      order: {
        orderId: order.orderId,
        secretCode: order.secretCode,
        subtotal: subtotal,
        deliveryCharges: deliveryCharges,
        isFreeDelivery: isFreeDelivery,
        handlingCharge: handlingCharge,
        numberOfShops: numberOfShops,
        total: total,
        finalAmount: finalAmount,
        walletDeduction: walletDeduction,
        cashOnDelivery: cashOnDelivery,
        paymentStatus: order.paymentStatus,
        status: order.status,
        items: order.items,
        shippingAddress: order.shippingAddress,
        ...(paymentMethod === "online" && razorpayOrder && {
          razorpay: {
            orderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key: process.env.RAZORPAY_KEY_ID
          }
        }),
        sellerPayouts: Array.from(sellerMap.entries()).map(([sellerId, data]) => ({
          sellerId,
          amount: parseFloat(data.amount.toFixed(2)),
          percentage: 30,
          status: 'pending'
        })),
        orderScratchCard: orderScratchCard.isEligible
          ? { isEligible: true, isScratched: false, message: 'You have a scratch card! Scratch after delivery to reveal your coupon.' }
          : { isEligible: false },
        ...(scratchCouponDetails && { scratchCouponApplied: scratchCouponDetails }),
        createdAt: order.createdAt
      }
    };

    // Send notification to customer
    try {
      const notificationService = require('../../services/notificationService');
      await notificationService.sendNotification(
        userId,
        'Order Placed Successfully',
        `Your order #${order.orderId} has been placed.`,
        'order',
        order.orderId,
        { orderId: order.orderId }
      );
    } catch (notifError) {
      console.error('Notification error:', notifError);
    }

    // FCM wake-up push to all online drivers (works even if app is killed)
    try {
      const { notifyNearbyDrivers } = require('../../services/driverNotificationService');
      notifyNearbyDrivers(null, null, order._id, order.orderId)
        .catch(e => console.error('Driver notify error:', e.message));
    } catch (driverNotifError) {
      console.error('Driver notification setup error:', driverNotifError.message);
    }

    // Socket: start ringing on all connected driver apps
    try {
      const { emitNewOrder, serverLog } = require('../../socketManager');
      serverLog(`Order ${order.orderId} placed by user ${userId} — triggering driver notifications`, 'event');
      emitNewOrder(order._id, order.orderId);
    } catch (socketError) {
      console.error('Socket emit error:', socketError.message);
    }

    return res.status(201).json(response);

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Create order error:', err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      debug: err.message
    });
  }
};

exports.verifyRazorpayPayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId
    } = req.body;

    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: "Invalid payment signature"
      });
    }

    const order = await Order.findOneAndUpdate(
      {
        $or: [
          { razorpayOrderId: razorpay_order_id },
          { orderId: orderId }
        ]
      },
      {
        paymentStatus: "paid",
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        status: "confirmed",
        paidAt: new Date()
      },
      { new: true, session }
    );

    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        error: "Order not found for this payment"
      });
    }

    await session.commitTransaction();
    session.endSession();

    // Send Notification
    try {
      const notificationService = require('../../services/notificationService');
      await notificationService.sendNotification(
        order.user,
        'Payment Successful',
        `Payment for order #${order.orderId} verified successfully.`,
        'payment',
        order.orderId,
        { orderId: order.orderId }
      );
    } catch (notifError) {
      console.error('Notification error:', notifError);
    }

    res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      orderId: order.orderId,
      paymentStatus: order.paymentStatus
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Payment verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify payment'
    });
  }
};

exports.razorpayWebhook = async (req, res) => {
  try {
    const crypto = require('crypto');
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    const shasum = crypto.createHmac('sha256', secret);
    shasum.update(JSON.stringify(req.body));
    const digest = shasum.digest('hex');

    if (digest !== req.headers['x-razorpay-signature']) {
      console.error('Invalid webhook signature received');
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body.event;
    const payload = req.body.payload;
    const timestamp = new Date();

    console.log(`Razorpay webhook received: ${event} at ${timestamp}`);

    if (event === 'payment.captured') {
      await handlePaymentCaptured(payload.payment.entity);
    }
    else if (event === 'payment.failed') {
      await handlePaymentFailed(payload.payment.entity);
    }
    else if (event === 'order.paid') {
      await handleOrderPaid(payload.order.entity);
    }
    else {
      console.log(`Unhandled webhook event: ${event}`);
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

const handlePaymentCaptured = async (payment) => {
  try {
    const order = await Order.findOneAndUpdate(
      { razorpayOrderId: payment.order_id },
      {
        paymentStatus: "paid",
        razorpayPaymentId: payment.id,
        status: "confirmed",
        paidAt: new Date(payment.created_at * 1000)
      },
      { new: true }
    );

    if (order) {
      console.log(`Order ${order.orderId} marked as paid via webhook`);

      // Send Notification
      try {
        const notificationService = require('../../services/notificationService');
        await notificationService.sendNotification(
          order.user,
          'Payment Successful',
          `We have received your payment for order #${order.orderId}.`,
          'payment',
          order.orderId,
          { orderId: order.orderId }
        );
      } catch (notifError) {
        console.error('Notification error:', notifError);
      }
    } else {
      console.warn(`No order found for payment ${payment.id}`);
    }
  } catch (error) {
    console.error('Error handling payment.captured:', error);
  }
};

const handlePaymentFailed = async (payment) => {
  try {
    const order = await Order.findOneAndUpdate(
      { razorpayOrderId: payment.order_id },
      {
        paymentStatus: "failed",
        status: "cancelled",
        paymentFailedAt: new Date(),
        razorpayPaymentId: payment.id
      },
      { new: true }
    );

    if (order) {
      console.log(`Order ${order.orderId} payment failed`);

      // Send Notification
      try {
        const notificationService = require('../../services/notificationService');
        await notificationService.sendNotification(
          order.user,
          'Payment Failed',
          `Payment for order #${order.orderId} failed. Please try again.`,
          'payment',
          order.orderId,
          { orderId: order.orderId }
        );
      } catch (notifError) {
        console.error('Notification error:', notifError);
      }
    } else {
      console.warn(`No order found for failed payment ${payment.id}`);
    }
  } catch (error) {
    console.error('Error handling payment.failed:', error);
  }
};

const handleOrderPaid = async (orderEntity) => {
  try {
    const order = await Order.findOneAndUpdate(
      { razorpayOrderId: orderEntity.id },
      {
        paymentStatus: "paid",
        status: "confirmed",
        paidAt: new Date(orderEntity.created_at * 1000)
      },
      { new: true }
    );

    if (order) {
      console.log(`Order ${order.orderId} confirmed as paid via order.paid webhook`);
    } else {
      console.warn(`No order found for Razorpay order ${orderEntity.id}`);
    }
  } catch (error) {
    console.error('Error handling order.paid:', error);
  }
};

exports.checkPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId })
      .select('paymentStatus razorpayOrderId status paidAt');

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Order not found"
      });
    }

    let razorpayDetails = null;
    if (order.razorpayOrderId) {
      try {
        const razorpayOrder = await razorpay.orders.fetch(order.razorpayOrderId);
        razorpayDetails = {
          status: razorpayOrder.status,
          amount: razorpayOrder.amount,
          amount_paid: razorpayOrder.amount_paid,
          amount_due: razorpayOrder.amount_due,
          attempts: razorpayOrder.attempts
        };
      } catch (razorpayError) {
        console.error('Error fetching Razorpay order:', razorpayError);
      }
    }

    res.status(200).json({
      success: true,
      order: {
        orderId: order.orderId,
        paymentStatus: order.paymentStatus,
        status: order.status,
        paidAt: order.paidAt,
        razorpayOrderId: order.razorpayOrderId,
        razorpayDetails
      }
    });

  } catch (error) {
    console.error('Check payment status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check payment status'
    });
  }
};

exports.getRazorpayOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId })
      .select('razorpayOrderId razorpayAmount razorpayCurrency');

    if (!order || !order.razorpayOrderId) {
      return res.status(404).json({
        success: false,
        error: "Razorpay order not found"
      });
    }

    const razorpayOrder = await razorpay.orders.fetch(order.razorpayOrderId);

    res.status(200).json({
      success: true,
      order: {
        orderId: order.orderId,
        razorpay: {
          orderId: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          status: razorpayOrder.status,
          receipt: razorpayOrder.receipt,
          attempts: razorpayOrder.attempts,
          created_at: razorpayOrder.created_at
        }
      }
    });

  } catch (error) {
    console.error('Get Razorpay order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Razorpay order'
    });
  }
};

exports.refundPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { amount, reason = "Refund requested by customer" } = req.body;

    const order = await Order.findOne({ orderId })
      .select('razorpayPaymentId finalAmount paymentStatus');

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Order not found"
      });
    }

    if (order.paymentStatus !== "paid") {
      return res.status(400).json({
        success: false,
        error: "Cannot refund unpaid order"
      });
    }

    if (!order.razorpayPaymentId) {
      return res.status(400).json({
        success: false,
        error: "No Razorpay payment ID found"
      });
    }

    const refundAmount = amount ? Math.round(amount * 100) : Math.round(order.finalAmount * 100);

    const refund = await razorpay.payments.refund(
      order.razorpayPaymentId,
      {
        amount: refundAmount,
        speed: "normal",
        notes: {
          reason: reason,
          orderId: orderId
        }
      }
    );

    // Update order status
    await Order.findOneAndUpdate(
      { orderId },
      {
        paymentStatus: "refunded",
        refundId: refund.id,
        refundAmount: refund.amount / 100,
        refundStatus: refund.status,
        refundedAt: new Date()
      }
    );

    res.status(200).json({
      success: true,
      message: "Refund initiated successfully",
      refund: {
        id: refund.id,
        amount: refund.amount / 100,
        status: refund.status,
        speed_processed: refund.speed_processed,
        notes: refund.notes
      }
    });

  } catch (error) {
    console.error('Refund payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process refund',
      razorpayError: error.error || {}
    });
  }
};

exports.getTestPaymentDetails = (req, res) => {
  res.status(200).json({
    success: true,
    test_mode: false,
    environment: process.env.RAZORPAY_MODE || 'test',
    test_cards: [
      {
        card_number: "4111 1111 1111 1111",
        expiry: "12/34",
        cvv: "123",
        name: "Test User",
        type: "Visa",
        network: "Visa",
        issuer: "Test Bank"
      },
      {
        card_number: "5104 0600 0000 0008",
        expiry: "12/34",
        cvv: "123",
        name: "Test User",
        type: "MasterCard",
        network: "MasterCard"
      }
    ],
    test_upi: [
      "success@razorpay",
      "failure@razorpay"
    ],
    test_wallets: [
      {
        provider: "Paytm",
        phone: "9999999999",
        otp: "987654"
      }
    ],
    notes: "Use these test details for sandbox testing only"
  });
};

exports.getOrderPayoutDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId)
      .populate('seller', 'name businessName gstNumber panNumber bankDetails')
      .populate('user', 'name email phone')
      .populate({
        path: 'items.product',
        populate: [
          {
            path: 'promotor.id',
            model: 'Promotor',
            select: 'name email phone commissionRate commissionType'
          },
          {
            path: 'seller',
            model: 'Seller',
            select: 'name businessName gstNumber'
          }
        ]
      });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Order not found"
      });
    }

    let itemPayouts = [];
    let totalTaxableValue = 0;
    let totalGST = 0;
    let totalPlatformFee = 0;
    let totalPromotorCommission = 0;
    let totalSellerPayout = 0;

    for (const item of order.items) {
      const product = item.product;
      const itemTotal = item.price * item.quantity;
      const gstRate = product.gstPercent || 0;

      let gstAmount = 0;
      let taxableValue = itemTotal;

      if (product.taxType === 'inclusive' && gstRate > 0) {
        taxableValue = itemTotal / (1 + gstRate / 100);
        gstAmount = itemTotal - taxableValue;
      } else if (gstRate > 0) {
        gstAmount = (taxableValue * gstRate) / 100;
      }

      const platformFeeRate = 10;
      const platformFee = (taxableValue * platformFeeRate) / 100;

      let promotorCommission = 0;
      if (product.promotor && product.promotor.id) {
        if (product.promotor.commissionType === 'percentage') {
          promotorCommission = (taxableValue * product.promotor.commissionRate) / 100;
        } else {
          promotorCommission = product.promotor.commissionAmount;
        }
      }

      const sellerPayable = taxableValue - platformFee - promotorCommission;

      totalTaxableValue += taxableValue;
      totalGST += gstAmount;
      totalPlatformFee += platformFee;
      totalPromotorCommission += promotorCommission;
      totalSellerPayout += sellerPayable;

      itemPayouts.push({
        productName: product.name,
        quantity: item.quantity,
        price: item.price,
        itemTotal,
        gstRate: `${gstRate}%`,
        gstAmount,
        taxableValue,
        platformFee: {
          amount: platformFee,
          rate: `${platformFeeRate}%`
        },
        promotorCommission: {
          amount: promotorCommission,
          rate: product.promotor?.commissionRate ? `${product.promotor.commissionRate}%` : 'Fixed',
          promotorName: product.promotor?.id?.name || 'N/A'
        },
        sellerPayable
      });
    }

    const payoutDetails = {
      orderId: order.orderId,
      orderDate: order.createdAt,
      seller: {
        name: order.seller?.businessName || 'N/A',
        gstNumber: order.seller?.gstNumber || 'N/A',
        payout: {
          totalPayable: totalSellerPayout,
          gstDeduction: totalGST,
          tdsDeduction: totalSellerPayout * 0.01,
          netPayout: totalSellerPayout - (totalSellerPayout * 0.01),
          status: order.payout?.seller?.payoutStatus || 'pending',
          paidAt: order.payout?.seller?.paidAt
        }
      },
      promotor: {
        commissionAmount: totalPromotorCommission,
        status: order.payout?.promotor?.payoutStatus || 'pending',
        paidAt: order.payout?.promotor?.paidAt
      },
      platform: {
        serviceFee: totalPlatformFee,
        gstCollection: totalGST
      },
      itemBreakdown: itemPayouts,
      summary: {
        totalOrderValue: order.total,
        totalTaxableValue,
        totalGST,
        totalPlatformFee,
        totalPromotorCommission,
        totalSellerPayout,
        finalCustomerPayment: order.finalAmount
      }
    };

    res.status(200).json({
      success: true,
      data: payoutDetails
    });

  } catch (error) {
    console.error('Get payout details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payout details'
    });
  }
};

exports.processSellerPayout = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { paymentMethod, transactionId, notes } = req.body;

    const order = await Order.findById(orderId)
      .populate('seller', 'name businessName bankDetails totalEarnings');

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Order not found"
      });
    }

    if (order.payout.seller.payoutStatus === 'paid') {
      return res.status(400).json({
        success: false,
        error: "Payout already processed"
      });
    }

    order.payout.seller.payoutStatus = 'paid';
    order.payout.seller.paidAt = new Date();

    if (order.seller) {
      await Seller.findByIdAndUpdate(order.seller._id, {
        $inc: {
          totalEarnings: order.payout.seller.netAmount,
          totalOrders: 1
        }
      });
    }

    await order.save();

    const payoutRecord = new Payout({
      order: orderId,
      seller: order.seller._id,
      amount: order.payout.seller.netAmount,
      type: 'seller',
      paymentMethod,
      transactionId,
      status: 'completed',
      notes
    });

    await payoutRecord.save();

    res.status(200).json({
      success: true,
      message: "Seller payout processed successfully",
      data: {
        orderId: order.orderId,
        seller: order.seller?.businessName,
        amount: order.payout.seller.netAmount,
        paymentMethod,
        transactionId,
        paidAt: order.payout.seller.paidAt
      }
    });

  } catch (error) {
    console.error('Process seller payout error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process seller payout'
    });
  }
};

exports.processPromotorPayout = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { paymentMethod, transactionId, notes } = req.body;

    const order = await Order.findById(orderId)
      .populate({
        path: 'items.product',
        populate: {
          path: 'promotor.id',
          model: 'Promotor'
        }
      });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Order not found"
      });
    }

    if (order.payout.promotor.payoutStatus === 'paid') {
      return res.status(400).json({
        success: false,
        error: "Promotor payout already processed"
      });
    }

    const promotorIds = [];
    order.items.forEach(item => {
      if (item.product.promotor && item.product.promotor.id) {
        promotorIds.push(item.product.promotor.id._id);
      }
    });

    const uniquePromotorIds = [...new Set(promotorIds)];

    for (const promotorId of uniquePromotorIds) {
      await Promotor.findByIdAndUpdate(promotorId, {
        $inc: { totalCommissionEarned: order.payout.promotor.commissionAmount }
      });
    }

    order.payout.promotor.payoutStatus = 'paid';
    order.payout.promotor.paidAt = new Date();
    await order.save();

    const payoutRecord = new Payout({
      order: orderId,
      promotor: uniquePromotorIds[0],
      amount: order.payout.promotor.commissionAmount,
      type: 'promotor',
      paymentMethod,
      transactionId,
      status: 'completed',
      notes
    });

    await payoutRecord.save();

    res.status(200).json({
      success: true,
      message: "Promotor payout processed successfully",
      data: {
        orderId: order.orderId,
        promotors: uniquePromotorIds,
        commissionAmount: order.payout.promotor.commissionAmount,
        paymentMethod,
        transactionId,
        paidAt: order.payout.promotor.paidAt
      }
    });

  } catch (error) {
    console.error('Process promotor payout error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process promotor payout'
    });
  }
};

exports.getSellerPayouts = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { startDate, endDate, status, page = 1, limit = 10 } = req.query;

    const filter = { seller: sellerId };

    if (status) {
      filter['payout.seller.payoutStatus'] = status;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const orders = await Order.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(filter);

    const payoutSummary = await Order.aggregate([
      {
        $match: filter
      },
      {
        $group: {
          _id: '$payout.seller.payoutStatus',
          totalAmount: { $sum: '$payout.seller.netAmount' },
          totalOrders: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: orders,
      summary: payoutSummary,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalOrders: total
      }
    });

  } catch (error) {
    console.error('Get seller payouts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch seller payouts'
    });
  }
};

exports.getPromotorPayouts = async (req, res) => {
  try {
    const { promotorId } = req.params;
    const { startDate, endDate, status, page = 1, limit = 10 } = req.query;

    const orders = await Order.find({
      'items.product': {
        $in: await Product.find({ 'promotor.id': promotorId }).distinct('_id')
      }
    })
      .populate('user', 'name email')
      .populate('seller', 'businessName')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const filteredOrders = orders.filter(order => {
      return order.items.some(item =>
        item.product &&
        item.product.promotor &&
        item.product.promotor.id &&
        item.product.promotor.id.toString() === promotorId
      );
    });

    const total = filteredOrders.length;

    let totalCommission = 0;
    filteredOrders.forEach(order => {
      totalCommission += order.payout.promotor.commissionAmount;
    });

    res.status(200).json({
      success: true,
      data: filteredOrders,
      summary: {
        totalCommission,
        totalOrders: total
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalOrders: total
      }
    });

  } catch (error) {
    console.error('Get promotor payouts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch promotor payouts'
    });
  }
};

exports.getPayoutSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const matchStage = {};
    if (startDate || endDate) {
      matchStage.createdAt = dateFilter;
    }

    const summary = await Order.aggregate([
      {
        $match: matchStage
      },
      {
        $group: {
          _id: null,
          totalSellerPayout: { $sum: '$payout.seller.netAmount' },
          totalPromotorPayout: { $sum: '$payout.promotor.commissionAmount' },
          totalPlatformFee: { $sum: '$payout.platform.serviceFee' },
          totalGSTCollection: { $sum: '$payout.platform.gstCollection' },
          totalOrders: { $sum: 1 },
          pendingSellerPayouts: {
            $sum: {
              $cond: [{ $eq: ['$payout.seller.payoutStatus', 'pending'] }, '$payout.seller.netAmount', 0]
            }
          },
          pendingPromotorPayouts: {
            $sum: {
              $cond: [{ $eq: ['$payout.promotor.payoutStatus', 'pending'] }, '$payout.promotor.commissionAmount', 0]
            }
          }
        }
      }
    ]);

    const sellerPayoutStats = await Order.aggregate([
      {
        $match: matchStage
      },
      {
        $group: {
          _id: '$payout.seller.payoutStatus',
          totalAmount: { $sum: '$payout.seller.netAmount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const promotorPayoutStats = await Order.aggregate([
      {
        $match: matchStage
      },
      {
        $group: {
          _id: '$payout.promotor.payoutStatus',
          totalAmount: { $sum: '$payout.promotor.commissionAmount' },
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        summary: summary[0] || {
          totalSellerPayout: 0,
          totalPromotorPayout: 0,
          totalPlatformFee: 0,
          totalGSTCollection: 0,
          totalOrders: 0,
          pendingSellerPayouts: 0,
          pendingPromotorPayouts: 0
        },
        sellerPayoutStats,
        promotorPayoutStats
      }
    });

  } catch (error) {
    console.error('Get payout summary error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payout summary'
    });
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const userId = req.user._id;

    const orders = await Order.find({ user: userId })
      .populate('items.product')
      .populate('seller', 'name businessName')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      orders: orders
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders'
    });
  }
};

exports.downloadInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;

    const order = await Order.findOne({ orderId })
      .populate('user', 'name email phone')
      .populate('seller', 'name businessName gstNumber panNumber address bankDetails')
      .populate({
        path: 'items.product',
        populate: [
          {
            path: 'seller',
            model: 'Seller',
            select: 'name businessName gstNumber panNumber address'
          },
          {
            path: 'category',
            model: 'Category',
            select: 'name hsnCode gstPercent'
          }
        ]
      });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Order not found"
      });
    }

    if (order.user._id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        error: "Access denied"
      });
    }

    if (!order.seller) {
      const firstProduct = order.items[0]?.product;
      if (firstProduct?.seller) {
        order.seller = firstProduct.seller;
      } else {
        order.seller = {
          businessName: 'Default Store',
          gstNumber: 'Not Available',
          address: {
            street: 'Not Available',
            city: 'Not Available',
            state: 'Not Available',
            pincode: 'Not Available'
          }
        };
      }
    }

    // Use values already saved on the order — do NOT recalculate
    const orderSubtotal = order.subtotal || order.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const deliveryFee = order.deliveryCharges || 0;
    const handlingFee = order.handlingCharge || 0;
    const savedTotalGST = order.totalGst || 0;
    const couponDiscount = order.coupon?.discount || 0;
    const couponCode = order.coupon?.code || null;

    const shippingState = order.shippingAddress.state;
    let totalCGST = 0;
    let totalSGST = 0;
    let totalIGST = 0;

    const itemsWithGST = order.items.map(item => {
      const itemTotal = item.price * item.quantity;
      const gstRate = item.gstPercent || item.product?.category?.gstPercent || 0;
      const gstAmount = item.gstAmount != null ? item.gstAmount : parseFloat(((itemTotal * gstRate) / 100).toFixed(2));
      const taxableValue = gstRate > 0 ? itemTotal - gstAmount : itemTotal;

      // MRP from product.oldPrice; if not set, MRP equals selling price
      const mrp = item.product?.oldPrice || item.price;
      const discountPerUnit = parseFloat(Math.max(0, mrp - item.price).toFixed(2));
      const mrpTotal = parseFloat((mrp * item.quantity).toFixed(2));
      const discountTotal = parseFloat((discountPerUnit * item.quantity).toFixed(2));

      const sellerState = (item.product?.seller?.address?.state || '').trim().toLowerCase();
      const buyerState = (shippingState || '').trim().toLowerCase();
      const isWithinState = sellerState && buyerState && sellerState === buyerState;

      let cgstAmount = 0;
      let sgstAmount = 0;
      let igstAmount = 0;
      if (gstAmount > 0) {
        if (isWithinState) {
          cgstAmount = parseFloat((gstAmount / 2).toFixed(2));
          sgstAmount = parseFloat((gstAmount / 2).toFixed(2));
        } else {
          igstAmount = gstAmount;
        }
      }

      totalCGST += cgstAmount;
      totalSGST += sgstAmount;
      totalIGST += igstAmount;

      return {
        ...item.toObject(),
        itemTotal,
        taxableValue,
        gstRate,
        gstAmount,
        cgstAmount,
        sgstAmount,
        igstAmount,
        isWithinState,
        mrp,
        discountPerUnit,
        mrpTotal,
        discountTotal
      };
    });

    const totalMRP = parseFloat(itemsWithGST.reduce((s, i) => s + i.mrpTotal, 0).toFixed(2));
    const totalDiscount = parseFloat(itemsWithGST.reduce((s, i) => s + i.discountTotal, 0).toFixed(2));
    const totalGST = savedTotalGST;
    const finalPayableAmount = order.cashOnDelivery > 0 ? order.cashOnDelivery : order.finalAmount;

    const invoiceData = {
      orderId: order.orderId,
      orderDate: order.createdAt,
      secretCode: order.secretCode,
      customer: {
        name: order.user.name,
        email: order.user.email,
        phone: order.user.phone
      },
      seller: order.seller,
      shippingAddress: order.shippingAddress,
      items: itemsWithGST,
      payment: {
        method: order.paymentMethod,
        status: order.paymentStatus,
        walletDeduction: order.walletDeduction,
        cashOnDelivery: order.cashOnDelivery,
        finalAmount: order.finalAmount
      },
      summary: {
        totalMRP,
        totalDiscount,
        subtotal: orderSubtotal,
        deliveryFee,
        handlingFee,
        couponDiscount,
        couponCode,
        totalGST,
        totalCGST,
        totalSGST,
        totalIGST,
        walletDeduction: order.walletDeduction,
        payableAmount: finalPayableAmount
      },
      gstSummary: {
        withinState: totalCGST > 0 || totalSGST > 0,
        interState: totalIGST > 0
      }
    };

    const pdfBuffer = await this.generatePDFInvoice(invoiceData);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderId}.pdf`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);

  } catch (err) {
    console.error('Invoice generation error:', err);
    return res.status(500).json({
      success: false,
      error: "Failed to generate invoice"
    });
  }
};

exports.generatePDFInvoice = async (invoiceData) => {
  const PDFDocument = require('pdfkit');
  const path = require('path');
  const fs = require('fs');

  // 80mm thermal printer: 230pt wide, 8pt side margins → 214pt content
  const PAGE_WIDTH = 230;
  const MARGIN = 8;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2; // 214pt

  // Indian GST state codes
  const STATE_CODES = {
    'jammu and kashmir': '01', 'himachal pradesh': '02', 'punjab': '03',
    'chandigarh': '04', 'uttarakhand': '05', 'haryana': '06', 'delhi': '07',
    'rajasthan': '08', 'uttar pradesh': '09', 'bihar': '10', 'sikkim': '11',
    'arunachal pradesh': '12', 'nagaland': '13', 'manipur': '14', 'mizoram': '15',
    'tripura': '16', 'meghalaya': '17', 'assam': '18', 'west bengal': '19',
    'jharkhand': '20', 'odisha': '21', 'chhattisgarh': '22', 'madhya pradesh': '23',
    'gujarat': '24', 'daman and diu': '25', 'dadra and nagar haveli': '26',
    'maharashtra': '27', 'karnataka': '29', 'goa': '30', 'lakshadweep': '31',
    'kerala': '32', 'tamil nadu': '33', 'puducherry': '34',
    'andaman and nicobar': '35', 'telangana': '36', 'andhra pradesh': '37',
    'ladakh': '38'
  };
  const getStateCode = (state) =>
    STATE_CODES[(state || '').toLowerCase().trim()] || '--';

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [PAGE_WIDTH, 2400],
        margin: MARGIN,
        autoFirstPage: true
      });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      // ── HELPERS ──────────────────────────────────────────────
      const dashedLine = (y) => {
        doc.save()
          .moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y)
          .dash(2, { space: 2 }).lineWidth(0.5).stroke('#000000')
          .undash().restore();
      };

      // Label left, value right-aligned — both on same y
      const row = (label, value, y, opts = {}) => {
        const f = opts.bold ? 'Courier-Bold' : 'Courier';
        const sz = opts.size || 7;
        doc.font(f).fontSize(sz).fillColor('#000000')
          .text(label, MARGIN, y, { width: CONTENT_WIDTH * 0.62, lineBreak: false });
        doc.font(f).fontSize(sz)
          .text(value, MARGIN, y, { width: CONTENT_WIDTH, align: 'right', lineBreak: false });
      };

      // Two label-value pairs on the same line (left half | right half)
      const twoColRow = (lbl1, val1, lbl2, val2, y, sz = 7) => {
        const half = Math.floor(CONTENT_WIDTH / 2); // 107
        doc.font('Courier-Bold').fontSize(sz).fillColor('#000000')
          .text(lbl1, MARGIN, y, { width: 48, lineBreak: false });
        doc.font('Courier').fontSize(sz)
          .text(val1, MARGIN, y, { width: half, align: 'right', lineBreak: false });
        doc.font('Courier-Bold').fontSize(sz)
          .text(lbl2, MARGIN + half + 4, y, { width: 30, lineBreak: false });
        doc.font('Courier').fontSize(sz)
          .text(val2, MARGIN + half + 4, y, { width: half - 4, align: 'right', lineBreak: false });
      };

      const center = (text, y, opts = {}) => {
        doc.font(opts.bold ? 'Courier-Bold' : 'Courier')
          .fontSize(opts.size || 7).fillColor('#000000')
          .text(text, MARGIN, y, { width: CONTENT_WIDTH, align: 'center' });
      };

      let y = MARGIN + 12; // extra top padding before logo

      // ── LOGO ─────────────────────────────────────────────────
      try {
        const logoPath = path.join(__dirname, '../../images/logo.jpeg');
        if (fs.existsSync(logoPath)) {
          const logoWidth = Math.min(60, CONTENT_WIDTH);
          const logoX = MARGIN + (CONTENT_WIDTH - logoWidth) / 2;
          doc.image(logoPath, logoX, y, { width: logoWidth });
          y += Math.round(logoWidth * 0.9) + 10;
        }
      } catch (e) { /* ignore */ }

      // ── HEADER ───────────────────────────────────────────────
      center('TAX INVOICE', y, { bold: true, size: 8 }); y += 12;
      center('GSTIN: ', y, { size: 6 }); y += 9;
      center('Gwalior, Madhya Pradesh', y, { size: 6 }); y += 9;
      center('PAN: ', y, { size: 6 }); y += 10;
      dashedLine(y); y += 10;

      // ── ORDER INFO ───────────────────────────────────────────
      const orderDate = new Date(invoiceData.orderDate).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
      });
      // Invoice No and Date on same line
      twoColRow('Invoice No:', invoiceData.orderId, 'Date:', orderDate, y, 7); y += 10;
      row('Order ID:', invoiceData.orderId, y); y += 10;

      const buyerState = invoiceData.shippingAddress.state || '';
      const buyerStateCode = getStateCode(buyerState);
      row('Place of Supply:', `${buyerState} (Code: ${buyerStateCode})`, y); y += 10;
      dashedLine(y); y += 10;

      // ── SELLER ───────────────────────────────────────────────
      const sellerFromItem = invoiceData.items?.[0]?.product?.seller ?? null;
      const sellerName = sellerFromItem?.businessName || invoiceData.seller?.businessName || 'Store';
      const sellerGST = sellerFromItem?.gstNumber || invoiceData.seller?.gstNumber || 'N/A';
      const sellerAddrObj = sellerFromItem?.address || invoiceData.seller?.address;
      const sellerState = sellerAddrObj?.state || '';
      const sellerStateCode = getStateCode(sellerState);
      const sellerAddress = sellerAddrObj
        ? `${sellerAddrObj.street || ''}, ${sellerAddrObj.city || ''}, ${sellerState} - ${sellerAddrObj.pincode || ''}`
        : 'Address not available';

      doc.font('Courier-Bold').fontSize(7).fillColor('#000000').text('SOLD BY:', MARGIN, y); y += 10;
      doc.font('Courier').fontSize(7).text(sellerName, MARGIN, y, { width: CONTENT_WIDTH }); y += 9;
      doc.font('Courier').fontSize(6).text(`GSTIN: ${sellerGST}`, MARGIN, y, { width: CONTENT_WIDTH }); y += 8;
      doc.font('Courier').fontSize(6)
        .text(`State: ${sellerState}  |  State Code: ${sellerStateCode}`, MARGIN, y, { width: CONTENT_WIDTH }); y += 8;
      doc.font('Courier').fontSize(6).text(sellerAddress, MARGIN, y, { width: CONTENT_WIDTH }); y += 16;
      dashedLine(y); y += 10;

      // ── BUYER ────────────────────────────────────────────────
      const addr = invoiceData.shippingAddress;
      doc.font('Courier-Bold').fontSize(7).text('BILL TO:', MARGIN, y); y += 10;
      doc.font('Courier').fontSize(7).text(invoiceData.customer.name, MARGIN, y, { width: CONTENT_WIDTH }); y += 9;
      doc.font('Courier').fontSize(6).text(`Ph: ${invoiceData.customer.phone || 'N/A'}`, MARGIN, y, { width: CONTENT_WIDTH }); y += 8;
      if (addr.addressLine) {
        doc.font('Courier').fontSize(6).text(addr.addressLine, MARGIN, y, { width: CONTENT_WIDTH }); y += 8;
      }
      doc.font('Courier').fontSize(6)
        .text(`${addr.city}, ${buyerState} - ${addr.pinCode || addr.pincode || ''}`, MARGIN, y, { width: CONTENT_WIDTH }); y += 8;
      doc.font('Courier').fontSize(6)
        .text(`State Code: ${buyerStateCode}`, MARGIN, y, { width: CONTENT_WIDTH }); y += 8;
      doc.font('Courier').fontSize(6)
        .text(`Email: ${invoiceData.customer.email || 'N/A'}`, MARGIN, y, { width: CONTENT_WIDTH }); y += 12;
      dashedLine(y); y += 10;

      // ── ITEMS TABLE ──────────────────────────────────────────
      // Columns (all offsets from page left = MARGIN + col offset):
      //   ITEM: x=8,  w=70
      //   QTY:  x=78, w=18  (right-aligned)
      //   MRP:  x=96, w=30  (right-aligned)
      //   DISC: x=126,w=28  (right-aligned)
      //   PRICE:x=154,w=60  (right-aligned, to right edge 214)
      const CI = MARGIN;           // Item
      const CQ = MARGIN + 70;      // Qty
      const CM = MARGIN + 88;      // MRP
      const CD = MARGIN + 118;     // Disc
      const CP = MARGIN + 146;     // Price (after disc, pre-GST)
      const WI = 70, WQ = 18, WM = 30, WD = 28;
      const WP = CONTENT_WIDTH - 146; // 68

      doc.font('Courier-Bold').fontSize(6).fillColor('#000000');
      doc.text('ITEM',  CI, y, { width: WI });
      doc.text('QTY',   CQ, y, { width: WQ, align: 'right' });
      doc.text('MRP',   CM, y, { width: WM, align: 'right' });
      doc.text('DISC',  CD, y, { width: WD, align: 'right' });
      doc.text('PRICE', CP, y, { width: WP, align: 'right' });
      y += 9;
      dashedLine(y); y += 8;

      invoiceData.items.forEach((item) => {
        const product = item.product;
        const name = (product?.name || 'Product').substring(0, 20);
        const mrpUnit   = item.mrp || item.price;
        const discUnit  = item.discountPerUnit || 0;
        const mrpLine   = (mrpUnit * item.quantity).toFixed(2);
        const discLine  = discUnit > 0 ? (discUnit * item.quantity).toFixed(2) : '-';
        const priceLine = item.itemTotal.toFixed(2);

        // Row 1: Item cols
        doc.font('Courier').fontSize(6).fillColor('#000000');
        doc.text(name,              CI, y, { width: WI });
        doc.text(String(item.quantity), CQ, y, { width: WQ, align: 'right' });
        doc.text(mrpLine,           CM, y, { width: WM, align: 'right' });
        doc.text(discLine,          CD, y, { width: WD, align: 'right' });
        doc.text(priceLine,         CP, y, { width: WP, align: 'right' });
        y += 9;

        // Row 2: GST detail
        const hsn = product?.hsnCode || product?.category?.hsnCode || '';
        const gstLabel = item.gstRate > 0
          ? (item.isWithinState
              ? `CGST ${(item.gstRate / 2).toFixed(1)}%+SGST ${(item.gstRate / 2).toFixed(1)}% =Rs${item.gstAmount.toFixed(2)}`
              : `IGST ${item.gstRate}% =Rs${item.gstAmount.toFixed(2)}`)
          : 'GST: Nil';
        const detail = [hsn ? `HSN:${hsn}` : '', gstLabel].filter(Boolean).join('  ');
        doc.font('Courier').fontSize(5.5).fillColor('#555555')
          .text(detail, MARGIN, y, { width: CONTENT_WIDTH });
        y += 9;
      });

      dashedLine(y); y += 8;

      // ── TOTALS (checkout sequence) ────────────────────────────
      doc.font('Courier').fontSize(7).fillColor('#000000');

      // 1. MRP → Discount → Discounted subtotal
      const totalDiscount = invoiceData.summary.totalDiscount || 0;
      const totalMRP = invoiceData.summary.totalMRP || invoiceData.summary.subtotal;
      if (totalDiscount > 0) {
        row('MRP Total:', `Rs ${totalMRP.toFixed(2)}`, y); y += 10;
        row('Product Discount:', `-Rs ${totalDiscount.toFixed(2)}`, y); y += 10;
      }
      row('Subtotal (after disc):', `Rs ${invoiceData.summary.subtotal.toFixed(2)}`, y); y += 10;

      // 2. GST breakdown
      dashedLine(y); y += 6;
      doc.font('Courier-Bold').fontSize(6.5).text('GST BREAKDOWN:', MARGIN, y); y += 9;
      doc.font('Courier').fontSize(7);
      if ((invoiceData.summary.totalCGST || 0) > 0 || (invoiceData.summary.totalSGST || 0) > 0) {
        row('CGST:', `Rs ${(invoiceData.summary.totalCGST || 0).toFixed(2)}`, y); y += 10;
        row('SGST:', `Rs ${(invoiceData.summary.totalSGST || 0).toFixed(2)}`, y); y += 10;
      }
      if ((invoiceData.summary.totalIGST || 0) > 0) {
        row('IGST:', `Rs ${(invoiceData.summary.totalIGST || 0).toFixed(2)}`, y); y += 10;
      }
      if ((invoiceData.summary.totalGST || 0) === 0) {
        row('Total GST:', 'Rs 0.00 (Nil)', y); y += 10;
      } else {
        row('Total GST:', `Rs ${(invoiceData.summary.totalGST || 0).toFixed(2)}`, y); y += 10;
      }

      // 3. Handling charges
      dashedLine(y); y += 6;
      if ((invoiceData.summary.handlingFee || 0) > 0) {
        row('Handling Charge:', `Rs ${invoiceData.summary.handlingFee.toFixed(2)}`, y); y += 10;
      }

      // 4. Delivery charges
      row('Delivery Charges:', `Rs ${(invoiceData.summary.deliveryFee || 0).toFixed(2)}`, y); y += 10;

      // 5. Coupon discount
      if ((invoiceData.summary.couponDiscount || 0) > 0) {
        const couponLbl = invoiceData.summary.couponCode
          ? `Coupon (${invoiceData.summary.couponCode}):`
          : 'Coupon Discount:';
        row(couponLbl, `-Rs ${invoiceData.summary.couponDiscount.toFixed(2)}`, y); y += 10;
      }

      // 6. Grand Total
      dashedLine(y); y += 6;
      row('GRAND TOTAL:', `Rs ${invoiceData.summary.payableAmount.toFixed(2)}`, y, { bold: true, size: 8 }); y += 14;

      // 7. Wallet deduction → amount paid
      if ((invoiceData.payment.walletDeduction || 0) > 0) {
        row('Wallet Deduction:', `-Rs ${invoiceData.payment.walletDeduction.toFixed(2)}`, y); y += 10;
        dashedLine(y); y += 6;
        const paid = invoiceData.summary.payableAmount - invoiceData.payment.walletDeduction;
        row('AMOUNT PAID:', `Rs ${paid.toFixed(2)}`, y, { bold: true, size: 8 }); y += 14;
      }

      dashedLine(y); y += 10;

      // ── PAYMENT ──────────────────────────────────────────────
      doc.font('Courier-Bold').fontSize(7).text('PAYMENT:', MARGIN, y); y += 10;
      doc.font('Courier').fontSize(7);
      row('Method:', (invoiceData.payment.method || '').toUpperCase(), y); y += 10;
      row('Status:', (invoiceData.payment.status || '').toUpperCase(), y); y += 10;
      if (invoiceData.secretCode) {
        row('Secret Code:', invoiceData.secretCode, y, { bold: true }); y += 10;
      }

      // ── GST SUPPLY NOTE ──────────────────────────────────────
      if ((invoiceData.summary.totalGST || 0) > 0) {
        dashedLine(y); y += 8;
        doc.font('Courier').fontSize(6).fillColor('#000000');
        if (invoiceData.gstSummary.withinState) {
          doc.text(
            `Within-state supply: CGST Rs ${(invoiceData.summary.totalCGST || 0).toFixed(2)} + SGST Rs ${(invoiceData.summary.totalSGST || 0).toFixed(2)}`,
            MARGIN, y, { width: CONTENT_WIDTH }
          ); y += 9;
        }
        if (invoiceData.gstSummary.interState) {
          doc.text(
            `Inter-state supply: IGST Rs ${(invoiceData.summary.totalIGST || 0).toFixed(2)}`,
            MARGIN, y, { width: CONTENT_WIDTH }
          ); y += 9;
        }
      }

      // ── FOOTER ───────────────────────────────────────────────
      y += 6;
      dashedLine(y); y += 10;
      center('Computer generated invoice.', y, { size: 6 }); y += 9;
      center('No signature required.', y, { size: 6 }); y += 9;
      center('Thank you for shopping with Fast 2!', y, { size: 6 }); y += 12;

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
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

exports.scratchOrderCard = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;

    const order = await Order.findOne({ orderId, user: userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (!order.orderScratchCard || !order.orderScratchCard.isEligible) {
      return res.status(400).json({ success: false, message: 'No scratch card available for this order' });
    }

    if (order.orderScratchCard.isScratched) {
      return res.status(400).json({
        success: false,
        message: 'Scratch card already used',
        couponCode: order.orderScratchCard.couponCode
      });
    }

    order.orderScratchCard.isScratched = true;
    order.orderScratchCard.scratchedAt = new Date();
    await order.save();

    return res.status(200).json({
      success: true,
      message: 'Congratulations! Here is your coupon code.',
      couponCode: order.orderScratchCard.couponCode
    });
  } catch (err) {
    console.error('Scratch order card error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getScratchCouponHistory = async (req, res) => {
  try {
    const userId = req.user._id;

    const orders = await Order.find({
      user: userId,
      'orderScratchCard.isEligible': true
    })
      .select('orderId orderScratchCard createdAt total finalAmount')
      .sort({ createdAt: -1 });

    const history = orders.map(order => ({
      orderId: order.orderId,
      orderDate: order.createdAt,
      orderTotal: order.finalAmount,
      couponCode: order.orderScratchCard.isScratched ? order.orderScratchCard.couponCode : null,
      isScratched: order.orderScratchCard.isScratched,
      scratchedAt: order.orderScratchCard.scratchedAt,
      isRedeemed: order.orderScratchCard.isRedeemed,
      redeemedAt: order.orderScratchCard.redeemedAt,
      status: order.orderScratchCard.isRedeemed
        ? 'redeemed'
        : order.orderScratchCard.isScratched
          ? 'scratched'
          : 'unscratched'
    }));

    return res.status(200).json({
      success: true,
      total: history.length,
      scratchCoupons: history
    });
  } catch (err) {
    console.error('Get scratch coupon history error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.redeemScratchCoupon = async (req, res) => {
  try {
    const userId = req.user._id;
    const { couponCode, orderAmount } = req.body;

    if (!couponCode || !orderAmount) {
      return res.status(400).json({ success: false, message: 'couponCode and orderAmount are required' });
    }

    const scratchOrder = await Order.findOne({
      user: userId,
      'orderScratchCard.couponCode': couponCode.toUpperCase(),
      'orderScratchCard.isScratched': true
    });

    if (!scratchOrder) {
      return res.status(404).json({ success: false, message: 'No scratch card found for this coupon code' });
    }

    if (scratchOrder.orderScratchCard.isRedeemed) {
      return res.status(400).json({ success: false, message: 'This scratch card coupon has already been redeemed' });
    }

    const coupon = await Coupon.validateCoupon(couponCode, userId, orderAmount);
    const discount = coupon.calculateDiscount(orderAmount);
    const finalAmount = orderAmount - discount;

    scratchOrder.orderScratchCard.isRedeemed = true;
    scratchOrder.orderScratchCard.redeemedAt = new Date();
    await scratchOrder.save();

    return res.status(200).json({
      success: true,
      message: 'Scratch card coupon applied successfully',
      coupon: {
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount: discount
      },
      orderAmount,
      discount,
      finalAmount
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};