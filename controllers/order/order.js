const Order = require('../../models/order');
const Product = require('../../models/product');
const User = require('../../models/user');
const Seller = require('../../models/seller');
const Promotor = require('../../models/promotor');
const Payout = require('../../models/payout');
const mongoose = require('mongoose');

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
        error: "Shipping address pincode is required"
      });
    }

    const productIds = items.map(item => item.product);

    const products = await Product.find({ 
      _id: { $in: productIds } 
    })
    .populate('seller')
    .populate('promotor.id')
    .session(session);

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

    const productsWithoutSellers = [];
    for (const product of products) {
      if (!product.seller) {
        productsWithoutSellers.push({
          productId: product._id,
          productName: product.name
        });
      }
    }

    if (productsWithoutSellers.length > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: "Some products don't have sellers assigned",
        productsWithoutSellers
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

        if (cashOnDelivery === 0) {
          paymentStatus = "paid";
        }
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

    const orderItems = items.map(item => ({
      product: item.product,
      quantity: item.quantity,
      price: item.price
    }));
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
      total,
      coupon: coupon || {},
      finalAmount,
      shippingAddress: normalizedShippingAddress,
      paymentMethod,
      paymentStatus,
      walletDeduction,
      cashOnDelivery,
      seller: primarySeller
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
        sellerPayouts: Array.from(sellerMap.entries()).map(([sellerId, data]) => ({
          sellerId,
          amount: parseFloat(data.amount.toFixed(2)),
          percentage: 30,
          status: 'pending'
        })),
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

    const order = await Order.findById(orderId)
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
            select: 'name'
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

    let orderSubtotal = 0;
    let totalGST = 0;
    let totalCGST = 0;
    let totalSGST = 0;
    let totalIGST = 0;
    let deliveryFee = 25;

    const itemsWithGST = order.items.map(item => {
      const itemTotal = item.price * item.quantity;
      const gstRate = item.product?.gstPercent || 0;
      
      const sellerState = item.product?.seller?.address?.state;
      const shippingState = order.shippingAddress.state;
      const isWithinState = sellerState && shippingState && sellerState === shippingState;
      
      let gstAmount = 0;
      let cgstAmount = 0;
      let sgstAmount = 0;
      let igstAmount = 0;
      let taxableValue = itemTotal;

      if (item.product?.taxType === 'inclusive' && gstRate > 0) {
        taxableValue = itemTotal / (1 + gstRate / 100);
        gstAmount = itemTotal - taxableValue;
      } else if (gstRate > 0) {
        gstAmount = (taxableValue * gstRate) / 100;
      }

      if (gstAmount > 0) {
        if (isWithinState) {
          cgstAmount = gstAmount / 2;
          sgstAmount = gstAmount / 2;
        } else {
          igstAmount = gstAmount;
        }
      }

      const itemWithTax = {
        ...item.toObject(),
        itemTotal,
        taxableValue,
        gstRate,
        gstAmount,
        cgstAmount,
        sgstAmount,
        igstAmount,
        totalWithTax: taxableValue + gstAmount,
        isWithinState
      };

      orderSubtotal += itemTotal;
      totalGST += gstAmount;
      totalCGST += cgstAmount;
      totalSGST += sgstAmount;
      totalIGST += igstAmount;

      return itemWithTax;
    });

    const grandTotalBeforeWallet = orderSubtotal + deliveryFee;
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
        subtotal: orderSubtotal,
        deliveryFee: deliveryFee,
        totalBeforeWallet: grandTotalBeforeWallet,
        totalGST: totalGST,
        totalCGST: totalCGST,
        totalSGST: totalSGST,
        totalIGST: totalIGST,
        grandTotal: finalPayableAmount,
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
  
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      doc.fillColor('#1e40af')
         .rect(0, 0, 600, 80)
         .fill();
      
      doc.fillColor('#ffffff')
         .fontSize(20)
         .font('Helvetica-Bold')
         .text('Fast 2', 50, 30);
      
      doc.fontSize(10)
         .text('TAX INVOICE', 50, 55);

      doc.font('Helvetica')
         .fontSize(8)
         .text('GSTIN: 07AABCU9603R1ZM', 400, 35, { align: 'right' })
         .text('PAN: AABCU9603R', 400, 47, { align: 'right' })
         .text('123 Business Street, Delhi - 110001', 400, 59, { align: 'right' });

      let yPosition = 100;

      doc.fillColor('#000000')
         .fontSize(10)
         .font('Helvetica-Bold')
         .text('Invoice Details:', 50, yPosition);
      
      doc.font('Helvetica')
         .text(`Invoice Number: ${invoiceData.orderId}`, 150, yPosition)
         .text(`Invoice Date: ${new Date(invoiceData.orderDate).toLocaleDateString('en-IN')}`, 350, yPosition);
      
      yPosition += 15;
      doc.text(`Order Number: ${invoiceData.orderId}`, 150, yPosition)
         .text(`Place of Supply: ${invoiceData.shippingAddress.state}`, 350, yPosition);

      yPosition += 25;

      doc.font('Helvetica-Bold')
         .text('Sold By:', 50, yPosition);
      
      const sellerName = invoiceData.seller?.businessName || 'Store';
      const sellerGST = invoiceData.seller?.gstNumber || 'Not Available';
      
      doc.font('Helvetica')
         .text(sellerName, 150, yPosition)
         .text(`GSTIN: ${sellerGST}`, 350, yPosition);
      
      yPosition += 12;
      
      const sellerAddress = invoiceData.seller?.address ? 
        `${invoiceData.seller.address.street || ''}, ${invoiceData.seller.address.city || ''}, ${invoiceData.seller.address.state || ''} - ${invoiceData.seller.address.pincode || ''}` : 
        'Address not available';
      
      doc.text(sellerAddress, 150, yPosition, { width: 200 });

      yPosition += 25;

      doc.font('Helvetica-Bold')
         .text('Bill To:', 50, yPosition);
      
      doc.font('Helvetica')
         .text(invoiceData.customer.name, 150, yPosition)
         .text(`Phone: ${invoiceData.customer.phone}`, 350, yPosition);
      
      yPosition += 12;
      doc.text(invoiceData.shippingAddress.addressLine, 150, yPosition, { width: 200 })
         .text(`Email: ${invoiceData.customer.email}`, 350, yPosition);
      
      yPosition += 12;
      doc.text(`${invoiceData.shippingAddress.city}, ${invoiceData.shippingAddress.state} - ${invoiceData.shippingAddress.pinCode}`, 150, yPosition);

      yPosition += 30;

      doc.font('Helvetica-Bold')
         .fontSize(9);
      
      doc.text('Description', 50, yPosition);
      doc.text('HSN', 200, yPosition);
      doc.text('Qty', 250, yPosition);
      doc.text('Rate', 280, yPosition);
      doc.text('Amount', 320, yPosition);
      doc.text('GST%', 370, yPosition);
      doc.text('Taxable', 400, yPosition);
      doc.text('GST', 450, yPosition);
      doc.text('Total', 500, yPosition);

      yPosition += 12;
      doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
      yPosition += 5;

      doc.font('Helvetica')
         .fontSize(8);
      
      invoiceData.items.forEach((item, index) => {
        if (yPosition > 650) {
          doc.addPage();
          yPosition = 50;
          doc.font('Helvetica-Bold').fontSize(9);
          doc.text('Description', 50, yPosition);
          doc.text('HSN', 200, yPosition);
          doc.text('Qty', 250, yPosition);
          doc.text('Rate', 280, yPosition);
          doc.text('Amount', 320, yPosition);
          doc.text('GST%', 370, yPosition);
          doc.text('Taxable', 400, yPosition);
          doc.text('GST', 450, yPosition);
          doc.text('Total', 500, yPosition);
          yPosition += 12;
          doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
          yPosition += 5;
          doc.font('Helvetica').fontSize(8);
        }

        const product = item.product;
        doc.text(product?.name || 'Product', 50, yPosition, { width: 140 });
        doc.text(product?.hsnCode || 'N/A', 200, yPosition);
        doc.text(item.quantity.toString(), 250, yPosition);
        doc.text(`₹${item.price.toFixed(2)}`, 280, yPosition);
        doc.text(`₹${item.itemTotal.toFixed(2)}`, 320, yPosition);
        doc.text(`${item.gstRate}%`, 370, yPosition);
        doc.text(`₹${item.taxableValue.toFixed(2)}`, 400, yPosition);
        doc.text(`₹${item.gstAmount.toFixed(2)}`, 450, yPosition);
        doc.text(`₹${item.totalWithTax.toFixed(2)}`, 500, yPosition);
        
        yPosition += 20;
      });

      yPosition += 10;
      doc.moveTo(350, yPosition).lineTo(550, yPosition).stroke();
      yPosition += 5;

      doc.fontSize(9);
      doc.text('Subtotal:', 400, yPosition);
      doc.text(`₹${invoiceData.summary.subtotal.toFixed(2)}`, 500, yPosition, { align: 'right' });
      
      yPosition += 12;
      doc.text('Delivery Charges:', 400, yPosition);
      doc.text(`₹${invoiceData.summary.deliveryFee.toFixed(2)}`, 500, yPosition, { align: 'right' });

      yPosition += 12;
      doc.text('Total Before Tax:', 400, yPosition);
      doc.text(`₹${invoiceData.summary.totalBeforeWallet.toFixed(2)}`, 500, yPosition, { align: 'right' });

      if (invoiceData.summary.totalCGST > 0) {
        yPosition += 12;
        doc.text('CGST:', 400, yPosition);
        doc.text(`₹${invoiceData.summary.totalCGST.toFixed(2)}`, 500, yPosition, { align: 'right' });
      }

      if (invoiceData.summary.totalSGST > 0) {
        yPosition += 12;
        doc.text('SGST:', 400, yPosition);
        doc.text(`₹${invoiceData.summary.totalSGST.toFixed(2)}`, 500, yPosition, { align: 'right' });
      }

      if (invoiceData.summary.totalIGST > 0) {
        yPosition += 12;
        doc.text('IGST:', 400, yPosition);
        doc.text(`₹${invoiceData.summary.totalIGST.toFixed(2)}`, 500, yPosition, { align: 'right' });
      }

      yPosition += 12;
      doc.text('Total GST:', 400, yPosition);
      doc.text(`₹${invoiceData.summary.totalGST.toFixed(2)}`, 500, yPosition, { align: 'right' });

      if (invoiceData.payment.walletDeduction > 0) {
        yPosition += 12;
        doc.text('Wallet Deduction:', 400, yPosition);
        doc.text(`-₹${invoiceData.payment.walletDeduction.toFixed(2)}`, 500, yPosition, { align: 'right' });
      }

      yPosition += 15;
      doc.moveTo(400, yPosition).lineTo(550, yPosition).stroke();
      yPosition += 5;

      doc.font('Helvetica-Bold')
         .fontSize(11);
      doc.text('Grand Total:', 400, yPosition);
      doc.text(`₹${invoiceData.summary.payableAmount.toFixed(2)}`, 500, yPosition, { align: 'right' });

      yPosition += 30;
      doc.font('Helvetica')
         .fontSize(9);
      doc.text('Payment Details:', 50, yPosition);
      yPosition += 12;
      doc.text(`Method: ${invoiceData.payment.method.toUpperCase()}`, 50, yPosition);
      doc.text(`Status: ${invoiceData.payment.status}`, 200, yPosition);
      
      if (invoiceData.secretCode) {
        yPosition += 12;
        doc.text(`Secret Code: ${invoiceData.secretCode}`, 50, yPosition);
      }

      yPosition += 25;
      doc.font('Helvetica-Bold')
         .text('GST Summary:', 50, yPosition);
      
      yPosition += 15;
      doc.font('Helvetica')
         .fontSize(8);
      
      if (invoiceData.gstSummary.withinState) {
        doc.text(`Within State Supply (CGST + SGST): ₹${invoiceData.summary.totalCGST.toFixed(2)} + ₹${invoiceData.summary.totalSGST.toFixed(2)}`, 50, yPosition);
        yPosition += 10;
      }
      
      if (invoiceData.gstSummary.interState) {
        doc.text(`Inter-State Supply (IGST): ₹${invoiceData.summary.totalIGST.toFixed(2)}`, 50, yPosition);
        yPosition += 10;
      }

      doc.fontSize(7)
         .text('This is a computer-generated invoice and does not require a physical signature.', 50, 750, { align: 'center' })
         .text('Thank you for your business!', 50, 760, { align: 'center' });

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