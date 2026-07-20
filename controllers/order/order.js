const Order = require('../../models/order');
const Product = require('../../models/product');
const User = require('../../models/user');
const Seller = require('../../models/seller');
const Promotor = require('../../models/promotor');
const Payout = require('../../models/payout');
const Coupon = require('../../models/coupon');
const OnlinePaymentIntent = require('../../models/onlinePaymentIntent');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const imagekit = require('../../utils/imagekit');
const Shop = require('../../models/shop');
const PaymentSettings = require('../../models/paymentSettings');
const cashfree = require('../../utils/cashfree');
const {
  calculateFinalOrderAmount,
  formatOrderAmounts,
  formatOrdersAmounts,
  getDisplayFinalAmount,
  roundMoney
} = require('../../utils/orderAmounts');
const { calculateOrderPricing } = require('../../utils/orderPricing');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const notifyOrderPlaced = async (order, userId, title = 'Order Placed Successfully', message = null, type = 'order') => {
  try {
    const notificationService = require('../../services/notificationService');
    await notificationService.sendNotification(
      userId,
      title,
      message || `Your order #${order.orderId} has been placed.`,
      type,
      order.orderId,
      { orderId: order.orderId }
    );
  } catch (notifError) {
    console.error('Notification error:', notifError);
  }
};

const notifyDriversForOrder = async (order, userId) => {
  try {
    const { notifyNearbyDrivers } = require('../../services/driverNotificationService');
    notifyNearbyDrivers(order.shippingAddress?.lat, order.shippingAddress?.lng, order._id, order.orderId, order.shippingAddress?.pinCode)
      .catch(e => console.error('Driver notify error:', e.message));
  } catch (driverNotifError) {
    console.error('Driver notification setup error:', driverNotifError.message);
  }

  try {
    const { emitNewOrder, serverLog } = require('../../socketManager');
    serverLog(`Order ${order.orderId} placed by user ${userId} - triggering driver notifications`, 'event');
    emitNewOrder(order._id, order.orderId, order.shippingAddress?.lat, order.shippingAddress?.lng, order.shippingAddress?.pinCode);
  } catch (socketError) {
    console.error('Socket emit error:', socketError.message);
  }
};

// Pushes a live "new order" event to the seller's dashboard socket so it can auto-print the invoice.
const notifySellersForOrder = async (order) => {
  if (!order.seller) return;
  try {
    const { emitNewOrderToSeller } = require('../../socketManager');
    emitNewOrderToSeller(order.seller, order._id, order.orderId);
  } catch (sellerNotifyError) {
    console.error('Seller notify error:', sellerNotifyError.message);
  }
};

const createPlacedOrder = async ({
  orderData,
  sellerPayouts = [],
  scratchCouponOrderId = null,
  session,
  paymentUpdates = {}
}) => {
  const userId = orderData.user;

  if (orderData.walletDeduction > 0) {
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error("User not found");
    }

    if ((user.wallet || 0) < orderData.walletDeduction) {
      throw new Error("Insufficient wallet balance to place this paid order");
    }

    user.wallet = roundMoney((user.wallet || 0) - orderData.walletDeduction);
    await user.save({ session });
  }

  if (scratchCouponOrderId) {
    const redeemedScratchOrder = await Order.findOneAndUpdate(
      {
        _id: scratchCouponOrderId,
        'orderScratchCard.isRedeemed': false
      },
      {
        'orderScratchCard.isRedeemed': true,
        'orderScratchCard.redeemedAt': new Date()
      },
      { session }
    );

    if (!redeemedScratchOrder) {
      throw new Error("Scratch card coupon has already been redeemed");
    }
  }

  const order = new Order({
    ...orderData,
    ...paymentUpdates
  });

  await order.save({ session });

  if (order.coupon?.code) {
    await Coupon.findOneAndUpdate(
      { code: order.coupon.code },
      { $inc: { usedCount: 1 } },
      { session }
    );
  }

  const payoutPromises = sellerPayouts.map(data => {
    const sellerId = data.seller || data.sellerId;
    const sellerAmount = roundMoney(data.amount);

    const payout = new Payout({
      seller: sellerId,
      order: order._id,
      orderId: order.orderId,
      amount: sellerAmount,
      percentage: data.percentage || 30,
      status: 'pending'
    });

    return Promise.all([
      payout.save({ session }),
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
    ]);
  });

  await Promise.all(payoutPromises);

  return order;
};

const placePaidOnlineIntent = async (intent, paymentUpdates = {}, session) => {
  if (intent.placedOrder) {
    return Order.findById(intent.placedOrder).session(session);
  }

  const order = await createPlacedOrder({
    orderData: {
      ...intent.orderData,
      paymentStatus: "paid",
      status: "confirmed",
      cashOnDelivery: 0
    },
    sellerPayouts: intent.sellerPayouts,
    scratchCouponOrderId: intent.scratchCouponOrder,
    session,
    paymentUpdates: {
      paidAt: new Date(),
      ...paymentUpdates
    }
  });

  intent.status = "placed";
  intent.placedOrder = order._id;
  intent.placedAt = new Date();
  intent.paidAt = paymentUpdates.paidAt || new Date();
  await intent.save({ session });

  return order;
};

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
    if (typeof coupon === 'string') {
      try {
        coupon = JSON.parse(coupon);
      } catch (e) {
        console.error("Failed to parse coupon:", e);
        coupon = null;
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

    let walletUser = null;
    if (useWallet) {
      walletUser = await User.findById(userId).session(session);
      if (!walletUser) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          error: "User not found"
        });
      }
    }
    const walletBalance = walletUser?.wallet || 0;

    let pricing;
    try {
      pricing = await calculateOrderPricing({
        items,
        products,
        coupon,
        scratchCouponCode,
        paymentMethod,
        useWallet,
        userId,
        walletBalance,
        session
      });
    } catch (pricingError) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, error: pricingError.message });
    }

    const {
      subtotal,
      deliveryCharges,
      isFreeDelivery,
      numberOfShops,
      handlingCharge,
      totalGst,
      total,
      appliedCoupon,
      scratchCouponDiscount,
      scratchCouponDetails,
      scratchCouponOrder,
      walletDeduction,
      finalAmount,
      onlinePayableAmount
    } = pricing;

    let cashOnDelivery = finalAmount;
    let paymentStatus = "pending";

    if (useWallet && walletDeduction > 0) {
      cashOnDelivery = finalAmount - walletDeduction;

      if (paymentMethod === "cod") {
        walletUser.wallet = parseFloat((walletBalance - walletDeduction).toFixed(2));
        await walletUser.save({ session });

        if (cashOnDelivery === 0) {
          paymentStatus = "paid";
        }
      }
    }

    let activeGateway = null;
    if (paymentMethod === "online" && onlinePayableAmount > 0) {
      const paymentSettings = await PaymentSettings.getSettings();
      activeGateway = paymentSettings.activeGateway;

      if (activeGateway === "none") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          error: "Online payments are currently disabled. Please choose Cash on Delivery."
        });
      }
    }

    let razorpayOrder = null;
    if (paymentMethod === "online" && activeGateway === "razorpay" && onlinePayableAmount > 0) {
      try {
        const razorpayOptions = {
          amount: Math.round(onlinePayableAmount * 100),
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

    let cashfreeOrder = null;
    if (paymentMethod === "online" && activeGateway === "cashfree" && onlinePayableAmount > 0) {
      try {
        const cashfreeUser = await User.findById(userId).session(session);
        const cashfreeRequest = {
          order_amount: onlinePayableAmount,
          order_currency: "INR",
          customer_details: {
            customer_id: userId.toString(),
            customer_phone: cashfreeUser?.phone || shippingAddress.phone || "9999999999",
            ...(cashfreeUser?.email && { customer_email: cashfreeUser.email })
          },
          order_meta: {
            ...(process.env.CASHFREE_RETURN_URL && { return_url: process.env.CASHFREE_RETURN_URL }),
            ...(process.env.CASHFREE_NOTIFY_URL && { notify_url: process.env.CASHFREE_NOTIFY_URL })
          }
        };

        const cashfreeResponse = await cashfree.PGCreateOrder(cashfreeRequest);
        cashfreeOrder = cashfreeResponse.data;

        paymentStatus = "pending";
        cashOnDelivery = 0;
      } catch (cashfreeError) {
        await session.abortTransaction();
        session.endSession();
        return res.status(500).json({
          success: false,
          error: "Failed to create Cashfree order",
          debug: cashfreeError.response?.data || cashfreeError.message
        });
      }
    }

    if (paymentMethod === "online" && onlinePayableAmount === 0 && walletDeduction > 0) {
      const user = await User.findById(userId).session(session);

      if (!user) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          error: "User not found"
        });
      }

      if ((user.wallet || 0) < walletDeduction) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          error: "Insufficient wallet balance"
        });
      }

      user.wallet = roundMoney((user.wallet || 0) - walletDeduction);
      await user.save({ session });
      paymentStatus = "paid";
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
    const scratchGifts = products
      .filter(p => p.scratchGift && p.scratchGift.isEnabled && p.price > 200)
      .map(p => ({
        product: p._id,
        coinsAmount: p.scratchGift.coinsAmount,
        isScratched: false,
        scratchedAt: null
      }));

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

    const orderPayload = {
      user: userId,
      items: orderItems,
      subtotal: subtotal,
      deliveryCharges: deliveryCharges,
      isFreeDelivery: isFreeDelivery,
      handlingCharge: handlingCharge,
      total: total,
      totalGst: totalGst,
      coupon: appliedCoupon || {},
      scratchCouponDiscount,
      finalAmount: finalAmount,
      shippingAddress: normalizedShippingAddress,
      paymentMethod,
      paymentStatus,
      walletDeduction,
      cashOnDelivery,
      seller: primarySeller,
      orderScratchCard,
      scratchGifts,
      ...(paymentMethod === "online" && { paymentGateway: activeGateway }),
      ...(paymentMethod === "online" && razorpayOrder && {
        razorpayOrderId: razorpayOrder.id,
        razorpayReceipt: razorpayOrder.receipt,
        razorpayAmount: razorpayOrder.amount,
        razorpayCurrency: razorpayOrder.currency
      }),
      ...(paymentMethod === "online" && cashfreeOrder && {
        cashfreeOrderId: cashfreeOrder.order_id,
        cashfreeCfOrderId: cashfreeOrder.cf_order_id,
        cashfreePaymentSessionId: cashfreeOrder.payment_session_id
      }),
      ...(uploadedPrescription && { prescriptionImage: uploadedPrescription })
    };

    const sellerPayouts = Array.from(sellerMap.entries()).map(([sellerId, data]) => ({
      seller: sellerId,
      sellerId,
      amount: parseFloat(data.amount.toFixed(2)),
      percentage: 30,
      status: 'pending'
    }));

    if (paymentMethod === "online" && onlinePayableAmount > 0) {
      const intent = new OnlinePaymentIntent({
        user: userId,
        gateway: activeGateway,
        gatewayOrderId: activeGateway === "razorpay" ? razorpayOrder.id : cashfreeOrder.order_id,
        gatewayPaymentSessionId: activeGateway === "cashfree" ? cashfreeOrder.payment_session_id : null,
        amount: onlinePayableAmount,
        currency: activeGateway === "razorpay" ? razorpayOrder.currency : cashfreeOrder.order_currency,
        orderData: orderPayload,
        sellerPayouts,
        scratchCouponOrder: scratchCouponOrder?._id || null
      });

      await intent.save({ session });
      await session.commitTransaction();
      session.endSession();

      return res.status(201).json({
        success: true,
        message: "Payment initiated. Order will be placed after successful payment.",
        orderPlaced: false,
        checkoutId: intent._id,
        order: formatOrderAmounts({
          checkoutId: intent._id,
          orderId: null,
          subtotal,
          deliveryCharges,
          isFreeDelivery,
          handlingCharge,
          numberOfShops,
          total,
          scratchCouponDiscount,
          finalAmount,
          walletDeduction,
          cashOnDelivery: 0,
          onlinePayableAmount,
          paymentStatus: "pending",
          status: "payment_pending",
          items: orderItems,
          shippingAddress: normalizedShippingAddress,
          ...(razorpayOrder && {
            razorpay: {
              orderId: razorpayOrder.id,
              amount: razorpayOrder.amount,
              currency: razorpayOrder.currency,
              key: process.env.RAZORPAY_KEY_ID
            }
          }),
          ...(cashfreeOrder && {
            cashfree: {
              orderId: cashfreeOrder.order_id,
              paymentSessionId: cashfreeOrder.payment_session_id,
              amount: cashfreeOrder.order_amount,
              currency: cashfreeOrder.order_currency
            }
          }),
          sellerPayouts,
          orderScratchCard: orderScratchCard.isEligible
            ? { isEligible: true, isScratched: false, message: 'You will receive this scratch card after successful payment.' }
            : { isEligible: false },
          ...(scratchCouponDetails && { scratchCouponApplied: scratchCouponDetails }),
          createdAt: intent.createdAt
        })
      });
    }

    const order = new Order(orderPayload);

    await order.save({ session });

    if (order.coupon?.code) {
      await Coupon.findOneAndUpdate(
        { code: order.coupon.code },
        { $inc: { usedCount: 1 } },
        { session }
      );
    }

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
      order: formatOrderAmounts({
        orderId: order.orderId,
        secretCode: order.secretCode,
        subtotal: subtotal,
        deliveryCharges: deliveryCharges,
        isFreeDelivery: isFreeDelivery,
        handlingCharge: handlingCharge,
        numberOfShops: numberOfShops,
        total: total,
        scratchCouponDiscount,
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
        ...(paymentMethod === "online" && cashfreeOrder && {
          cashfree: {
            orderId: cashfreeOrder.order_id,
            paymentSessionId: cashfreeOrder.payment_session_id,
            amount: cashfreeOrder.order_amount,
            currency: cashfreeOrder.order_currency
          }
        }),
        sellerPayouts,
        orderScratchCard: orderScratchCard.isEligible
          ? { isEligible: true, isScratched: false, message: 'You have a scratch card! Scratch after delivery to reveal your coupon.' }
          : { isEligible: false },
        ...(scratchCouponDetails && { scratchCouponApplied: scratchCouponDetails }),
        createdAt: order.createdAt
      })
    };

    // Send notification to customer after the order document is actually placed.
    await notifyOrderPlaced(order, userId);

    // FCM wake-up push to all online drivers (works even if app is killed)
    try {
      const { notifyNearbyDrivers } = require('../../services/driverNotificationService');
      notifyNearbyDrivers(order.shippingAddress?.lat, order.shippingAddress?.lng, order._id, order.orderId, order.shippingAddress?.pinCode)
        .catch(e => console.error('Driver notify error:', e.message));
    } catch (driverNotifError) {
      console.error('Driver notification setup error:', driverNotifError.message);
    }

    // Socket: start ringing on all connected driver apps
    try {
      const { emitNewOrder, serverLog } = require('../../socketManager');
      serverLog(`Order ${order.orderId} placed by user ${userId} — triggering driver notifications`, 'event');
      emitNewOrder(order._id, order.orderId, order.shippingAddress?.lat, order.shippingAddress?.lng, order.shippingAddress?.pinCode);
    } catch (socketError) {
      console.error('Socket emit error:', socketError.message);
    }

    // Socket: notify the seller so their dashboard can auto-print the invoice
    await notifySellersForOrder(order);

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

// Read-only preview of the exact pricing createOrder would charge — no DB writes,
// no payment gateway order created. Lets the app show the checkout screen the same
// total it will actually be charged, instead of recomputing delivery/discount rules
// client-side (which drift out of sync with the backend over time).
exports.calculateOrderTotal = async (req, res) => {
  try {
    let { items, paymentMethod = "cod", useWallet = false, coupon, scratchCouponCode } = req.body;

    if (typeof items === 'string') {
      try { items = JSON.parse(items); } catch (e) { /* leave as-is, validated below */ }
    }
    if (typeof coupon === 'string') {
      try { coupon = JSON.parse(coupon); } catch (e) { coupon = null; }
    }

    if (!items || !items.length) {
      return res.status(400).json({ success: false, error: "Order items are required" });
    }

    const userId = req.user._id;
    const productIds = items.map(item => item.product);

    const products = await Product.find({ _id: { $in: productIds } })
      .populate('seller')
      .populate('category');

    if (products.length !== items.length) {
      return res.status(404).json({
        success: false,
        error: "Some products not found",
        requested: items.length,
        found: products.length
      });
    }

    let walletBalance = 0;
    if (useWallet) {
      const user = await User.findById(userId);
      walletBalance = user?.wallet || 0;
    }

    const pricing = await calculateOrderPricing({
      items,
      products,
      coupon,
      scratchCouponCode,
      paymentMethod,
      useWallet,
      userId,
      walletBalance
    });

    return res.status(200).json({ success: true, data: pricing });
  } catch (error) {
    console.error('Calculate order total error:', error);
    return res.status(400).json({ success: false, error: error.message });
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

    let order = null;
    const paidAt = new Date();

    const intent = await OnlinePaymentIntent.findOne({
      gateway: "razorpay",
      gatewayOrderId: razorpay_order_id,
      user: req.user._id
    }).session(session);

    if (intent) {
      order = await placePaidOnlineIntent(
        intent,
        {
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          paidAt
        },
        session
      );
    } else {
      order = await Order.findOneAndUpdate(
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
          paidAt
        },
        { new: true, session }
      );
    }

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

    await notifyOrderPlaced(
      order,
      order.user,
      'Payment Successful',
      `Payment for order #${order.orderId} verified successfully.`,
      'payment'
    );
    if (intent) {
      await notifyDriversForOrder(order, order.user);
        await notifySellersForOrder(order);
    }

    res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      orderId: order.orderId,
      paymentStatus: order.paymentStatus,
      orderPlaced: true
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
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let order = await Order.findOneAndUpdate(
      { razorpayOrderId: payment.order_id },
      {
        paymentStatus: "paid",
        razorpayPaymentId: payment.id,
        status: "confirmed",
        paidAt: new Date(payment.created_at * 1000)
      },
      { new: true, session }
    );

    let placedFromIntent = false;
    if (!order) {
      const intent = await OnlinePaymentIntent.findOne({
        gateway: "razorpay",
        gatewayOrderId: payment.order_id
      }).session(session);

      if (intent) {
        order = await placePaidOnlineIntent(
          intent,
          {
            razorpayPaymentId: payment.id,
            paidAt: new Date(payment.created_at * 1000)
          },
          session
        );
        placedFromIntent = true;
      }
    }

    await session.commitTransaction();
    session.endSession();

    if (order) {
      console.log(`Order ${order.orderId} marked as paid via webhook`);

      await notifyOrderPlaced(
        order,
        order.user,
        'Payment Successful',
        `We have received your payment for order #${order.orderId}.`,
        'payment'
      );
      if (placedFromIntent) {
        await notifyDriversForOrder(order, order.user);
        await notifySellersForOrder(order);
      }
    } else {
      console.warn(`No order found for payment ${payment.id}`);
    }
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
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
      await OnlinePaymentIntent.findOneAndUpdate(
        {
          gateway: "razorpay",
          gatewayOrderId: payment.order_id,
          status: "pending"
        },
        {
          status: "failed",
          failureReason: payment.error_description || payment.error_reason || "payment_failed"
        }
      );
      console.warn(`No order found for failed payment ${payment.id}`);
    }
  } catch (error) {
    console.error('Error handling payment.failed:', error);
  }
};

const handleOrderPaid = async (orderEntity) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let order = await Order.findOneAndUpdate(
      { razorpayOrderId: orderEntity.id },
      {
        paymentStatus: "paid",
        status: "confirmed",
        paidAt: new Date(orderEntity.created_at * 1000)
      },
      { new: true, session }
    );

    let placedFromIntent = false;
    if (!order) {
      const intent = await OnlinePaymentIntent.findOne({
        gateway: "razorpay",
        gatewayOrderId: orderEntity.id
      }).session(session);

      if (intent) {
        order = await placePaidOnlineIntent(
          intent,
          { paidAt: new Date(orderEntity.created_at * 1000) },
          session
        );
        placedFromIntent = true;
      }
    }

    await session.commitTransaction();
    session.endSession();

    if (order) {
      console.log(`Order ${order.orderId} confirmed as paid via order.paid webhook`);
      if (placedFromIntent) {
        await notifyOrderPlaced(
          order,
          order.user,
          'Payment Successful',
          `We have received your payment for order #${order.orderId}.`,
          'payment'
        );
        await notifyDriversForOrder(order, order.user);
        await notifySellersForOrder(order);
      }
    } else {
      console.warn(`No order found for Razorpay order ${orderEntity.id}`);
    }
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error handling order.paid:', error);
  }
};

exports.checkPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId })
      .select('paymentStatus paymentGateway razorpayOrderId cashfreeOrderId status paidAt');

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Order not found"
      });
    }

    let razorpayDetails = null;
    if (order.paymentGateway === "razorpay" && order.razorpayOrderId) {
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

    let cashfreeDetails = null;
    if (order.paymentGateway === "cashfree" && order.cashfreeOrderId) {
      try {
        const cashfreeResponse = await cashfree.PGFetchOrder(order.cashfreeOrderId);
        const cfOrder = cashfreeResponse.data;
        cashfreeDetails = {
          status: cfOrder.order_status,
          amount: cfOrder.order_amount,
          currency: cfOrder.order_currency
        };
      } catch (cashfreeError) {
        console.error('Error fetching Cashfree order:', cashfreeError.response?.data || cashfreeError.message);
      }
    }

    res.status(200).json({
      success: true,
      order: {
        orderId: order.orderId,
        paymentStatus: order.paymentStatus,
        paymentGateway: order.paymentGateway,
        status: order.status,
        paidAt: order.paidAt,
        razorpayOrderId: order.razorpayOrderId,
        razorpayDetails,
        cashfreeOrderId: order.cashfreeOrderId,
        cashfreeDetails
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

exports.getCashfreeOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId })
      .select('cashfreeOrderId');

    if (!order || !order.cashfreeOrderId) {
      return res.status(404).json({
        success: false,
        error: "Cashfree order not found"
      });
    }

    const cashfreeResponse = await cashfree.PGFetchOrder(order.cashfreeOrderId);
    const cfOrder = cashfreeResponse.data;

    res.status(200).json({
      success: true,
      order: {
        orderId: order.orderId,
        cashfree: {
          orderId: cfOrder.order_id,
          cfOrderId: cfOrder.cf_order_id,
          amount: cfOrder.order_amount,
          currency: cfOrder.order_currency,
          status: cfOrder.order_status,
          paymentSessionId: cfOrder.payment_session_id,
          created_at: cfOrder.created_at
        }
      }
    });

  } catch (error) {
    console.error('Get Cashfree order error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Cashfree order'
    });
  }
};

exports.confirmCashfreePayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { orderId, cashfreeOrderId } = req.body;
    const gatewayOrderId = cashfreeOrderId || orderId;

    let order = null;
    const intent = await OnlinePaymentIntent.findOne({
      gateway: "cashfree",
      gatewayOrderId,
      user: req.user._id
    }).session(session);

    if (!intent) {
      order = await Order.findOne({ orderId }).session(session);

      if (!order || !order.cashfreeOrderId) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          error: "Cashfree order not found for this payment"
        });
      }
    }

    const fetchOrderId = intent ? intent.gatewayOrderId : order.cashfreeOrderId;
    const cashfreeResponse = await cashfree.PGFetchOrder(fetchOrderId);
    const cfOrder = cashfreeResponse.data;

    if (cfOrder.order_status === "PAID") {
      if (intent) {
        order = await placePaidOnlineIntent(
          intent,
          {
            cashfreePaymentId: cfOrder.cf_order_id,
            paidAt: new Date()
          },
          session
        );
      } else {
        order.paymentStatus = "paid";
        order.status = "confirmed";
        order.paidAt = new Date();
        await order.save({ session });
      }
    } else if (["EXPIRED", "TERMINATED"].includes(cfOrder.order_status)) {
      if (intent) {
        intent.status = "failed";
        intent.failureReason = cfOrder.order_status;
        await intent.save({ session });
      } else {
        order.paymentStatus = "failed";
        order.status = "cancelled";
        order.paymentFailedAt = new Date();
        await order.save({ session });
      }
    }

    await session.commitTransaction();
    session.endSession();

    if (order && cfOrder.order_status === "PAID") {
      await notifyOrderPlaced(
        order,
        order.user,
        'Payment Successful',
        `Payment for order #${order.orderId} verified successfully.`,
        'payment'
      );
      if (intent) {
        await notifyDriversForOrder(order, order.user);
        await notifySellersForOrder(order);
      }
    }

    res.status(200).json({
      success: true,
      message: "Payment status fetched successfully",
      orderId: order?.orderId || null,
      paymentStatus: order?.paymentStatus || intent?.status || "pending",
      orderPlaced: Boolean(order && cfOrder.order_status === "PAID"),
      cashfreeOrderStatus: cfOrder.order_status
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Cashfree payment confirmation error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to confirm Cashfree payment'
    });
  }
};

exports.cashfreeWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];

    let webhookEvent;
    try {
      webhookEvent = cashfree.PGVerifyWebhookSignature(signature, req.rawBody, timestamp);
    } catch (verifyError) {
      console.error('Invalid Cashfree webhook signature:', verifyError.message);
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const eventType = webhookEvent.object?.type;
    const data = webhookEvent.object?.data || {};

    console.log(`Cashfree webhook received: ${eventType}`);

    if (eventType === 'PAYMENT_SUCCESS_WEBHOOK') {
      await handleCashfreePaymentSuccess(data);
    } else if (eventType === 'PAYMENT_FAILED_WEBHOOK' || eventType === 'PAYMENT_USER_DROPPED_WEBHOOK') {
      await handleCashfreePaymentFailed(data);
    } else {
      console.log(`Unhandled Cashfree webhook event: ${eventType}`);
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Cashfree webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

const handleCashfreePaymentSuccess = async (data) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const cashfreeOrderId = data.order?.order_id;
    const payment = data.payment || {};

    let order = await Order.findOneAndUpdate(
      { cashfreeOrderId },
      {
        paymentStatus: "paid",
        cashfreePaymentId: payment.cf_payment_id,
        status: "confirmed",
        paidAt: payment.payment_time ? new Date(payment.payment_time) : new Date()
      },
      { new: true, session }
    );

    let placedFromIntent = false;
    if (!order) {
      const intent = await OnlinePaymentIntent.findOne({
        gateway: "cashfree",
        gatewayOrderId: cashfreeOrderId
      }).session(session);

      if (intent) {
        order = await placePaidOnlineIntent(
          intent,
          {
            cashfreePaymentId: payment.cf_payment_id || data.order?.cf_order_id,
            paidAt: payment.payment_time ? new Date(payment.payment_time) : new Date()
          },
          session
        );
        placedFromIntent = true;
      }
    }

    await session.commitTransaction();
    session.endSession();

    if (order) {
      console.log(`Order ${order.orderId} marked as paid via Cashfree webhook`);

      await notifyOrderPlaced(
        order,
        order.user,
        'Payment Successful',
        `We have received your payment for order #${order.orderId}.`,
        'payment'
      );
      if (placedFromIntent) {
        await notifyDriversForOrder(order, order.user);
        await notifySellersForOrder(order);
      }
    } else {
      console.warn(`No order found for Cashfree order ${cashfreeOrderId}`);
    }
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error handling Cashfree PAYMENT_SUCCESS_WEBHOOK:', error);
  }
};

const handleCashfreePaymentFailed = async (data) => {
  try {
    const cashfreeOrderId = data.order?.order_id;

    const order = await Order.findOneAndUpdate(
      { cashfreeOrderId },
      {
        paymentStatus: "failed",
        status: "cancelled",
        paymentFailedAt: new Date()
      },
      { new: true }
    );

    if (order) {
      console.log(`Order ${order.orderId} payment failed (Cashfree)`);

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
      await OnlinePaymentIntent.findOneAndUpdate(
        {
          gateway: "cashfree",
          gatewayOrderId: cashfreeOrderId,
          status: "pending"
        },
        {
          status: "failed",
          failureReason: data.payment?.payment_message || data.order?.order_status || "payment_failed"
        }
      );
      console.warn(`No order found for Cashfree order ${cashfreeOrderId}`);
    }
  } catch (error) {
    console.error('Error handling Cashfree payment failure webhook:', error);
  }
};

exports.getPaymentOptions = async (req, res) => {
  try {
    const settings = await PaymentSettings.getSettings();
    res.status(200).json({
      success: true,
      activeGateway: settings.activeGateway,
      onlinePaymentEnabled: settings.activeGateway !== 'none',
      cashfreeMode: process.env.CASHFREE_ENVIRONMENT === 'SANDBOX' ? 'sandbox' : 'production'
    });
  } catch (error) {
    console.error('Get payment options error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment options'
    });
  }
};

exports.refundPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { amount, reason = "Refund requested by customer" } = req.body;

    const order = await Order.findOne({ orderId })
      .select('paymentGateway razorpayPaymentId cashfreeOrderId finalAmount paymentStatus');

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

    if (order.paymentGateway === "cashfree") {
      if (!order.cashfreeOrderId) {
        return res.status(400).json({
          success: false,
          error: "No Cashfree order ID found"
        });
      }

      const refundAmount = amount || order.finalAmount;

      const refundResponse = await cashfree.PGOrderCreateRefund(
        order.cashfreeOrderId,
        {
          refund_id: `rfnd_${Date.now()}`,
          refund_amount: refundAmount,
          refund_note: reason
        }
      );
      const refund = refundResponse.data;

      const refundStatusMap = {
        SUCCESS: "processed",
        PENDING: "pending",
        ONHOLD: "pending",
        CANCELLED: "failed",
        FAILED: "failed"
      };

      await Order.findOneAndUpdate(
        { orderId },
        {
          paymentStatus: "refunded",
          refundId: refund.refund_id,
          refundAmount: refund.refund_amount,
          refundStatus: refundStatusMap[refund.refund_status] || "pending",
          refundedAt: new Date()
        }
      );

      return res.status(200).json({
        success: true,
        message: "Refund initiated successfully",
        refund: {
          id: refund.refund_id,
          amount: refund.refund_amount,
          status: refund.refund_status
        }
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
    console.error('Refund payment error:', error.response?.data || error);
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
      orders: formatOrdersAmounts(orders)
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
    const orderIdentifier = req.params.orderId || req.params.id;
    const orderQuery = mongoose.Types.ObjectId.isValid(orderIdentifier)
      ? { _id: orderIdentifier }
      : { orderId: orderIdentifier };

    const order = await Order.findOne(orderQuery)
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

    if (!order.user) {
      return res.status(404).json({
        success: false,
        error: "Order customer not found"
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
    const couponDiscount = roundMoney(order.coupon?.discount);
    const scratchCouponDiscount = roundMoney(order.scratchCouponDiscount);
    const couponCode = order.coupon?.code || null;
    const correctedFinalAmount = getDisplayFinalAmount(order);

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
    const amountToCollect = order.cashOnDelivery > 0
      ? roundMoney(order.cashOnDelivery)
      : Math.max(correctedFinalAmount - roundMoney(order.walletDeduction), 0);

    const invoiceData = {
      orderId: order.orderId,
      orderDate: order.createdAt,
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
        amountToCollect,
        finalAmount: correctedFinalAmount
      },
      summary: {
        totalMRP,
        totalDiscount,
        subtotal: orderSubtotal,
        deliveryFee,
        handlingFee,
        couponDiscount,
        scratchCouponDiscount,
        couponCode,
        totalBeforeGST: roundMoney(orderSubtotal + deliveryFee + handlingFee - couponDiscount - scratchCouponDiscount),
        totalGST,
        totalCGST,
        totalSGST,
        totalIGST,
        grandTotal: correctedFinalAmount,
        walletDeduction: order.walletDeduction,
        payableAmount: correctedFinalAmount,
        amountToCollect
      },
      gstSummary: {
        withinState: totalCGST > 0 || totalSGST > 0,
        interState: totalIGST > 0
      }
    };

    const format = (req.query.format || 'thermal').toLowerCase();
    const pdfBuffer = format === 'a4'
      ? await this.generatePDFInvoiceA4(invoiceData)
      : await this.generatePDFInvoice(invoiceData);

    const disposition = (req.query.disposition || 'attachment').toLowerCase() === 'inline' ? 'inline' : 'attachment';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename=invoice-${order.orderId}.pdf`);
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

      // Draw text blocks using their measured height so wrapped invoice text does not overlap.
      const measuredText = (text, x, y, width, opts = {}) => {
        const font = opts.bold ? 'Courier-Bold' : 'Courier';
        const size = opts.size || 7;
        const value = String(text ?? '');
        const textOptions = { width, align: opts.align || 'left' };
        doc.font(font).fontSize(size).fillColor(opts.color || '#000000');
        const height = doc.heightOfString(value, textOptions);
        doc.text(value, x, y, textOptions);
        return y + Math.max(opts.minHeight || 0, height) + (opts.gap || 2);
      };

      const row = (label, value, y, opts = {}) => {
        const f = opts.bold ? 'Courier-Bold' : 'Courier';
        const sz = opts.size || 7;
        const gap = opts.gap ?? 3;
        const labelWidth = opts.labelWidth || 108;
        const valueX = MARGIN + labelWidth + gap;
        const valueWidth = CONTENT_WIDTH - labelWidth - gap;
        const labelText = String(label ?? '');
        const valueText = String(value ?? '');
        const labelOptions = { width: labelWidth };
        const valueOptions = { width: valueWidth, align: 'right' };

        doc.font(f).fontSize(sz).fillColor('#000000')
          .text(labelText, MARGIN, y, labelOptions);
        doc.font(f).fontSize(sz)
          .text(valueText, valueX, y, valueOptions);

        const labelHeight = doc.font(f).fontSize(sz).heightOfString(labelText, { width: labelWidth });
        const valueHeight = doc.font(f).fontSize(sz).heightOfString(valueText, valueOptions);
        return y + Math.max(opts.minHeight || 10, labelHeight, valueHeight) + (opts.afterGap || 0);
      };

      // Draw paired metadata as compact stacked rows on narrow receipt paper.
      const twoColRow = (lbl1, val1, lbl2, val2, y, sz = 7) => {
        y = row(lbl1, val1, y, { size: sz, bold: true, minHeight: 9 });
        return row(lbl2, val2, y, { size: sz, bold: true, minHeight: 9 });
      };

      const center = (text, y, opts = {}) => {
        doc.font(opts.bold ? 'Courier-Bold' : 'Courier')
          .fontSize(opts.size || 7).fillColor('#000000')
          .text(text, MARGIN, y, { width: CONTENT_WIDTH, align: 'center' });
      };

      let y = MARGIN + 12; // extra top padding before logo

      // ── LOGO ─────────────────────────────────────────────────
      try {
        const logoPath = path.join(__dirname, '../../images/logo.png');
        if (fs.existsSync(logoPath)) {
          const logoWidth = Math.min(60, CONTENT_WIDTH);
          const logoX = MARGIN + (CONTENT_WIDTH - logoWidth) / 2;
          doc.image(logoPath, logoX, y, { width: logoWidth });
          y += Math.round(logoWidth * 0.9) + 10;
        }
      } catch (e) { /* ignore */ }

      // ── HEADER ───────────────────────────────────────────────
      center('TAX INVOICE', y, { bold: true, size: 8 }); y += 12;
      center('Indra Nagar near Sain Devin school,', y, { size: 6 }); y += 8;
      center('Thatipur, Gwalior, MP 474011', y, { size: 6 }); y += 9;
      center('GSTIN: 23LQZPK8550M1ZO', y, { size: 6 }); y += 9;
      center('PAN: LQZPK8550M', y, { size: 6 }); y += 10;
      dashedLine(y); y += 10;

      // ── ORDER INFO ───────────────────────────────────────────
      const orderDate = new Date(invoiceData.orderDate).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
      });
      y = twoColRow('Invoice No:', invoiceData.orderId, 'Date:', orderDate, y, 7);
      y = row('Order ID:', invoiceData.orderId, y);

      const buyerState = invoiceData.shippingAddress.state || '';
      const buyerStateCode = getStateCode(buyerState);
      y = row('Place of Supply:', `${buyerState} (Code: ${buyerStateCode})`, y, { labelWidth: 98 });
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

      y = measuredText('SOLD BY:', MARGIN, y, CONTENT_WIDTH, { bold: true, size: 7, minHeight: 8 });
      y = measuredText(sellerName, MARGIN, y, CONTENT_WIDTH, { size: 7, minHeight: 8 });
      y = measuredText(`GSTIN: ${sellerGST}`, MARGIN, y, CONTENT_WIDTH, { size: 6, minHeight: 7 });
      y = measuredText(`State: ${sellerState}  |  State Code: ${sellerStateCode}`, MARGIN, y, CONTENT_WIDTH, { size: 6, minHeight: 7 });
      y = measuredText(sellerAddress, MARGIN, y, CONTENT_WIDTH, { size: 6, minHeight: 7, gap: 8 });
      dashedLine(y); y += 10;

      // ── BUYER ────────────────────────────────────────────────
      const addr = invoiceData.shippingAddress;
      y = measuredText('BILL TO:', MARGIN, y, CONTENT_WIDTH, { bold: true, size: 7, minHeight: 8 });
      y = measuredText(invoiceData.customer.name, MARGIN, y, CONTENT_WIDTH, { size: 7, minHeight: 8 });
      y = measuredText(`Ph: ${invoiceData.customer.phone || 'N/A'}`, MARGIN, y, CONTENT_WIDTH, { size: 6, minHeight: 7 });
      if (addr.addressLine) {
        y = measuredText(addr.addressLine, MARGIN, y, CONTENT_WIDTH, { size: 6, minHeight: 7 });
      }
      y = measuredText(`${addr.city}, ${buyerState} - ${addr.pinCode || addr.pincode || ''}`, MARGIN, y, CONTENT_WIDTH, { size: 6, minHeight: 7 });
      y = measuredText(`State Code: ${buyerStateCode}`, MARGIN, y, CONTENT_WIDTH, { size: 6, minHeight: 7 });
      y = measuredText(`Email: ${invoiceData.customer.email || 'N/A'}`, MARGIN, y, CONTENT_WIDTH, { size: 6, minHeight: 7, gap: 6 });
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
        const name = product?.name || 'Product';
        const mrpUnit   = item.mrp || item.price;
        const discUnit  = item.discountPerUnit || 0;
        const mrpLine   = (mrpUnit * item.quantity).toFixed(2);
        const discLine  = discUnit > 0 ? (discUnit * item.quantity).toFixed(2) : '-';
        const priceLine = item.itemTotal.toFixed(2);

        // Row 1: Item cols
        doc.font('Courier').fontSize(6).fillColor('#000000');
        const itemOptions = { width: WI };
        const itemNameHeight = doc.heightOfString(name, itemOptions);
        doc.text(name,              CI, y, itemOptions);
        doc.text(String(item.quantity), CQ, y, { width: WQ, align: 'right' });
        doc.text(mrpLine,           CM, y, { width: WM, align: 'right' });
        doc.text(discLine,          CD, y, { width: WD, align: 'right' });
        doc.text(priceLine,         CP, y, { width: WP, align: 'right' });
        y += Math.max(9, itemNameHeight + 2);

        // Row 2: GST detail
        const hsn = product?.hsnCode || product?.category?.hsnCode || '';
        const gstLabel = item.gstRate > 0
          ? (item.isWithinState
              ? `CGST ${(item.gstRate / 2).toFixed(1)}%+SGST ${(item.gstRate / 2).toFixed(1)}% =Rs${item.gstAmount.toFixed(2)}`
              : `IGST ${item.gstRate}% =Rs${item.gstAmount.toFixed(2)}`)
          : 'GST: Nil';
        const detail = [hsn ? `HSN:${hsn}` : '', gstLabel].filter(Boolean).join('  ');
        y = measuredText(detail, MARGIN, y, CONTENT_WIDTH, { size: 5.5, color: '#555555', minHeight: 7, gap: 2 });
      });

      dashedLine(y); y += 8;

      // ── TOTALS (checkout sequence) ────────────────────────────
      doc.font('Courier').fontSize(7).fillColor('#000000');

      // 1. MRP → Discount → Discounted subtotal
      const totalDiscount = invoiceData.summary.totalDiscount || 0;
      const totalMRP = invoiceData.summary.totalMRP || invoiceData.summary.subtotal;
      if (totalDiscount > 0) {
        y = row('MRP Total:', `Rs ${totalMRP.toFixed(2)}`, y);
        y = row('Product Discount:', `-Rs ${totalDiscount.toFixed(2)}`, y);
      }
      y = row('Subtotal (after disc):', `Rs ${invoiceData.summary.subtotal.toFixed(2)}`, y);

      // 2. GST breakdown
      dashedLine(y); y += 6;
      doc.font('Courier-Bold').fontSize(6.5).text('GST BREAKDOWN:', MARGIN, y); y += 9;
      doc.font('Courier').fontSize(7);
      if ((invoiceData.summary.totalCGST || 0) > 0 || (invoiceData.summary.totalSGST || 0) > 0) {
        y = row('CGST:', `Rs ${(invoiceData.summary.totalCGST || 0).toFixed(2)}`, y);
        y = row('SGST:', `Rs ${(invoiceData.summary.totalSGST || 0).toFixed(2)}`, y);
      }
      if ((invoiceData.summary.totalIGST || 0) > 0) {
        y = row('IGST:', `Rs ${(invoiceData.summary.totalIGST || 0).toFixed(2)}`, y);
      }
      if ((invoiceData.summary.totalGST || 0) === 0) {
        y = row('Total GST:', 'Rs 0.00 (Nil)', y);
      } else {
        y = row('Total GST:', `Rs ${(invoiceData.summary.totalGST || 0).toFixed(2)}`, y);
      }

      // 3. Handling charges
      dashedLine(y); y += 6;
      if ((invoiceData.summary.handlingFee || 0) > 0) {
        y = row('Handling Charge:', `Rs ${invoiceData.summary.handlingFee.toFixed(2)}`, y);
      }

      // 4. Delivery charges
      y = row('Delivery Charges:', `Rs ${(invoiceData.summary.deliveryFee || 0).toFixed(2)}`, y);

      // 5. Coupon discount
      if ((invoiceData.summary.couponDiscount || 0) > 0) {
        const couponLbl = invoiceData.summary.couponCode
          ? `Coupon (${invoiceData.summary.couponCode}):`
          : 'Coupon Discount:';
        y = row(couponLbl, `-Rs ${invoiceData.summary.couponDiscount.toFixed(2)}`, y);
      }
      if ((invoiceData.summary.scratchCouponDiscount || 0) > 0) {
        y = row('Scratch Coupon:', `-Rs ${invoiceData.summary.scratchCouponDiscount.toFixed(2)}`, y);
      }

      // 6. Grand Total
      dashedLine(y); y += 6;
      y = row('GRAND TOTAL:', `Rs ${invoiceData.summary.payableAmount.toFixed(2)}`, y, { bold: true, size: 8, minHeight: 12, afterGap: 2 });

      // 7. Wallet deduction → amount paid (only show if user explicitly used wallet)
      const walletWasUsed = (invoiceData.payment.walletDeduction || 0) > 0;
      if (walletWasUsed) {
        y = row('Wallet Deduction:', `-Rs ${invoiceData.payment.walletDeduction.toFixed(2)}`, y);
        dashedLine(y); y += 6;
        const paid = Math.max(0, invoiceData.summary.payableAmount - invoiceData.payment.walletDeduction);
        y = row('AMOUNT PAID:', `Rs ${paid.toFixed(2)}`, y, { bold: true, size: 8, minHeight: 12, afterGap: 2 });
      }

      dashedLine(y); y += 10;

      // ── PAYMENT ──────────────────────────────────────────────
      doc.font('Courier-Bold').fontSize(7).text('PAYMENT:', MARGIN, y); y += 10;
      doc.font('Courier').fontSize(7);
      y = row('Method:', (invoiceData.payment.method || '').toUpperCase(), y);
      y = row('Status:', (invoiceData.payment.status || '').toUpperCase(), y);
      // ── GST SUPPLY NOTE ──────────────────────────────────────
      if ((invoiceData.summary.totalGST || 0) > 0) {
        dashedLine(y); y += 8;
        doc.font('Courier').fontSize(6).fillColor('#000000');
        if (invoiceData.gstSummary.withinState) {
          y = measuredText(
            `Within-state supply: CGST Rs ${(invoiceData.summary.totalCGST || 0).toFixed(2)} + SGST Rs ${(invoiceData.summary.totalSGST || 0).toFixed(2)}`,
            MARGIN, y, CONTENT_WIDTH, { size: 6, minHeight: 7 }
          );
        }
        if (invoiceData.gstSummary.interState) {
          y = measuredText(
            `Inter-state supply: IGST Rs ${(invoiceData.summary.totalIGST || 0).toFixed(2)}`,
            MARGIN, y, CONTENT_WIDTH, { size: 6, minHeight: 7 }
          );
        }
      }

      // ── FOOTER ───────────────────────────────────────────────
      y += 6;
      dashedLine(y); y += 10;
      center('Computer generated invoice.', y, { size: 6 }); y += 9;
      center('No signature required.', y, { size: 6 }); y += 9;
      center('Thank you for shopping with GMKart!', y, { size: 6 }); y += 12;

      // ── PAYMENT QR ───────────────────────────────────────────
      try {
        const qrPath = path.join(__dirname, '../../images/qr.png');
        if (fs.existsSync(qrPath)) {
          dashedLine(y); y += 10;
          center('Scan to Pay', y, { bold: true, size: 7 }); y += 10;
          const qrWidth = Math.min(90, CONTENT_WIDTH);
          const qrX = MARGIN + (CONTENT_WIDTH - qrWidth) / 2;
          doc.image(qrPath, qrX, y, { width: qrWidth });
          y += qrWidth + 10;
        }
      } catch (e) { /* ignore */ }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

// Full A4 tax invoice — for sellers printing on a regular A4 printer (as opposed to
// generatePDFInvoice's 80mm layout, which targets thermal receipt printers).
exports.generatePDFInvoiceA4 = async (invoiceData) => {
  const PDFDocument = require('pdfkit');
  const path = require('path');
  const fs = require('fs');

  const PAGE_WIDTH = 595.28; // A4 in points
  const PAGE_HEIGHT = 841.89;
  const MARGIN = 40;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

  const money = (n) => `Rs. ${Number(n || 0).toFixed(2)}`;
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN, autoFirstPage: true });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const text = (str, x, y, opts = {}) => {
        doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(opts.size || 9)
          .fillColor(opts.color || '#000000')
          .text(String(str ?? ''), x, y, { width: opts.width, align: opts.align || 'left' });
      };

      const line = (x1, y1, x2, y2, opts = {}) => {
        doc.save().moveTo(x1, y1).lineTo(x2, y2)
          .lineWidth(opts.width || 0.75).stroke(opts.color || '#000000').restore();
      };

      let y = MARGIN;

      // ── HEADER: logo + business info ──────────────────────────
      try {
        const logoPath = path.join(__dirname, '../../images/logo.png');
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, MARGIN, y, { width: 70 });
        }
      } catch (e) { /* ignore */ }

      const seller = invoiceData.seller || {};
      const sellerAddr = seller.address || {};
      const addrLine = [sellerAddr.street, sellerAddr.city, sellerAddr.state, sellerAddr.pincode]
        .filter(Boolean).join(', ');

      text(seller.businessName || 'Store', MARGIN + 85, y, { bold: true, size: 14, width: CONTENT_WIDTH - 85 });
      text(addrLine, MARGIN + 85, y + 20, { size: 9, width: CONTENT_WIDTH - 85 });
      text(`GSTIN: ${seller.gstNumber || 'N/A'}   PAN: ${seller.panNumber || 'N/A'}`, MARGIN + 85, y + 34, { size: 9 });

      y += 65;
      text('TAX INVOICE', MARGIN, y, { bold: true, size: 16, width: CONTENT_WIDTH, align: 'center' });
      y += 24;
      line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
      y += 14;

      // ── INVOICE DETAILS + BILL TO (two columns) ───────────────
      const colWidth = CONTENT_WIDTH / 2 - 10;
      const leftX = MARGIN;
      const rightX = MARGIN + CONTENT_WIDTH / 2 + 10;

      text('Invoice Details', leftX, y, { bold: true, size: 10 });
      text('Bill To', rightX, y, { bold: true, size: 10 });
      y += 16;

      const invoiceRows = [
        ['Invoice No', invoiceData.orderId],
        ['Invoice Date', fmtDate(invoiceData.orderDate)],
        ['Payment Method', (invoiceData.payment?.method || '').toUpperCase()],
        ['Payment Status', (invoiceData.payment?.status || '').toUpperCase()],
      ];
      let leftY = y;
      invoiceRows.forEach(([label, value]) => {
        text(`${label}:`, leftX, leftY, { size: 9, width: 90 });
        text(value, leftX + 90, leftY, { size: 9, width: colWidth - 90 });
        leftY += 15;
      });

      const shipAddr = invoiceData.shippingAddress || {};
      const shipAddrLine = [shipAddr.street, shipAddr.city, shipAddr.state, shipAddr.pincode]
        .filter(Boolean).join(', ');
      let rightY = y;
      text(invoiceData.customer?.name || '', rightX, rightY, { size: 9, bold: true, width: colWidth });
      rightY += 14;
      text(shipAddrLine, rightX, rightY, { size: 9, width: colWidth });
      rightY += doc.heightOfString(shipAddrLine, { width: colWidth }) + 4;
      text(invoiceData.customer?.phone || '', rightX, rightY, { size: 9, width: colWidth });
      rightY += 14;
      text(invoiceData.customer?.email || '', rightX, rightY, { size: 9, width: colWidth });
      rightY += 14;

      y = Math.max(leftY, rightY) + 10;
      line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
      y += 14;

      // ── ITEMS TABLE ────────────────────────────────────────────
      const cols = [
        { key: 'sr', label: '#', width: 20, align: 'left' },
        { key: 'name', label: 'Item', width: 165, align: 'left' },
        { key: 'qty', label: 'Qty', width: 35, align: 'right' },
        { key: 'rate', label: 'Rate', width: 60, align: 'right' },
        { key: 'taxable', label: 'Taxable', width: 65, align: 'right' },
        { key: 'gstRate', label: 'GST%', width: 40, align: 'right' },
        { key: 'gstAmt', label: 'GST Amt', width: 60, align: 'right' },
        { key: 'total', label: 'Total', width: 65, align: 'right' },
      ];
      let colX = [];
      let cx = MARGIN;
      cols.forEach(c => { colX.push(cx); cx += c.width; });

      const drawTableHeader = (yPos) => {
        doc.save().rect(MARGIN, yPos, CONTENT_WIDTH, 20).fill('#f0f0f0').restore();
        cols.forEach((c, i) => {
          text(c.label, colX[i] + 3, yPos + 5, { size: 8, bold: true, width: c.width - 6, align: c.align });
        });
        line(MARGIN, yPos + 20, PAGE_WIDTH - MARGIN, yPos + 20);
        return yPos + 20;
      };

      y = drawTableHeader(y);

      invoiceData.items.forEach((item, idx) => {
        const name = item.product?.name || item.name || 'Item';
        const rowHeight = Math.max(18, doc.font('Helvetica').fontSize(8).heightOfString(name, { width: cols[1].width - 6 }) + 6);

        if (y + rowHeight > PAGE_HEIGHT - MARGIN - 100) {
          doc.addPage();
          y = MARGIN;
          y = drawTableHeader(y);
        }

        const values = {
          sr: idx + 1,
          name,
          qty: item.quantity,
          rate: money(item.price),
          taxable: money(item.taxableValue),
          gstRate: `${item.gstRate || 0}%`,
          gstAmt: money(item.gstAmount),
          total: money(item.itemTotal),
        };

        cols.forEach((c, i) => {
          text(values[c.key], colX[i] + 3, y + 3, { size: 8, width: c.width - 6, align: c.align });
        });

        y += rowHeight;
        line(MARGIN, y, PAGE_WIDTH - MARGIN, y, { width: 0.5, color: '#cccccc' });
      });

      y += 14;

      // ── TOTALS ─────────────────────────────────────────────────
      const s = invoiceData.summary || {};
      const totalsX = MARGIN + CONTENT_WIDTH - 220;
      const totalsWidth = 220;
      const totalRow = (label, value, opts = {}) => {
        text(label, totalsX, y, { size: opts.size || 9, bold: opts.bold, width: totalsWidth - 90 });
        text(value, totalsX + totalsWidth - 90, y, { size: opts.size || 9, bold: opts.bold, width: 90, align: 'right' });
        y += opts.gap || 15;
      };

      totalRow('Subtotal', money(s.subtotal));
      if (s.totalDiscount > 0) totalRow('Discount', `- ${money(s.totalDiscount)}`);
      if (s.deliveryFee) totalRow('Delivery Fee', money(s.deliveryFee));
      if (s.handlingFee) totalRow('Handling Fee', money(s.handlingFee));
      if (s.couponDiscount > 0) totalRow(`Coupon (${s.couponCode || ''})`, `- ${money(s.couponDiscount)}`);
      if (s.scratchCouponDiscount > 0) totalRow('Scratch Coupon', `- ${money(s.scratchCouponDiscount)}`);
      if (invoiceData.gstSummary?.withinState) {
        totalRow('CGST', money(s.totalCGST));
        totalRow('SGST', money(s.totalSGST));
      } else if (invoiceData.gstSummary?.interState) {
        totalRow('IGST', money(s.totalIGST));
      }
      if (s.walletDeduction > 0) totalRow('Wallet Deduction', `- ${money(s.walletDeduction)}`);

      line(totalsX, y, MARGIN + CONTENT_WIDTH, y);
      y += 6;
      totalRow('Grand Total', money(s.grandTotal), { bold: true, size: 11, gap: 18 });

      if (s.amountToCollect > 0 && invoiceData.payment?.method === 'cod') {
        totalRow('Amount to Collect (COD)', money(s.amountToCollect), { bold: true });
      }

      y += 20;

      // ── FOOTER ───────────────────────────────────────────────
      if (y < PAGE_HEIGHT - 80) {
        line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
        y += 14;
        text('This is a computer generated invoice and does not require a signature.', MARGIN, y, { size: 8, color: '#666666', width: CONTENT_WIDTH, align: 'center' });
        y += 14;
        text('Thank you for shopping with GMKart!', MARGIN, y, { size: 9, bold: true, width: CONTENT_WIDTH, align: 'center' });
      }

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

    // Preview only — actual redemption happens when the order is placed (see createOrder),
    // so the coupon isn't burned until checkout actually completes.

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

exports.scratchCard = async (req, res) => {
  try {
    const { orderId, scratchIndex } = req.params;
    const userId = req.user._id;

    const order = await Order.findOne({ orderId, user: userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Scratch card is only available after delivery'
      });
    }

    const idx = parseInt(scratchIndex, 10);
    const gift = order.scratchGifts[idx];
    if (!gift) {
      return res.status(404).json({ success: false, message: 'Scratch card not found' });
    }

    if (gift.isScratched) {
      return res.status(400).json({ success: false, message: 'This scratch card has already been used' });
    }

    gift.isScratched = true;
    gift.scratchedAt = new Date();
    await order.save();

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $inc: { wallet: gift.coinsAmount } },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: `Congratulations! ${gift.coinsAmount} coins credited to your wallet`,
      coinsAwarded: gift.coinsAmount,
      newWalletBalance: updatedUser.wallet
    });
  } catch (err) {
    console.error('Scratch card error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getOrderTracking = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;

    const order = await Order.findOne({ orderId }).select("driver status user orderId shippingAddress").lean();
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.user.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Not your order" });
    }

    const trackableStatuses = ["accepted", "picked-up"];
    if (!trackableStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: "Order is not currently trackable",
        data: { status: order.status },
      });
    }

    if (!order.driver) {
      return res.status(404).json({ success: false, message: "No driver assigned yet" });
    }

    const Driver = require("../../models/driver");
    const driver = await Driver.findById(order.driver)
      .select("personalInfo.name workInfo.currentLocation workInfo.availability").lean();

    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    const loc = driver.workInfo?.currentLocation;
    const addr = order.shippingAddress;
    return res.status(200).json({
      success: true,
      data: {
        orderId: order.orderId,
        orderStatus: order.status,
        driver: {
          id: String(order.driver),
          name: driver.personalInfo?.name || "Driver",
        },
        location: loc?.coordinates?.lat
          ? {
              lat: loc.coordinates.lat,
              lng: loc.coordinates.lng,
              lastUpdated: loc.lastUpdated,
            }
          : null,
        destination: addr?.lat
          ? { lat: addr.lat, lng: addr.lng, address: addr.addressLine }
          : null,
      },
    });
  } catch (error) {
    console.error("Error fetching order tracking:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
