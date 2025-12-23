const Order = require('../../models/order');
const Product = require('../../models/product');
const Seller = require('../../models/seller');

exports.getSellerOrders = async (req, res) => {
  try {
    const sellerId = req.seller._id || req.seller.id;
    const {
      page = 1,
      limit = 10,
      status,
      paymentStatus,
      startDate,
      endDate,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = { seller: sellerId };

    if (status) {
      filter.status = status;
    }

    if (paymentStatus) {
      filter.paymentStatus = paymentStatus;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(endDate);
      }
    }

    // Add search filter if provided
    if (search) {
      filter.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { 'customerInfo.name': { $regex: search, $options: 'i' } },
        { 'customerInfo.email': { $regex: search, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get total count
    const total = await Order.countDocuments(filter);

    // Fetch orders with pagination
    const orders = await Order.find(filter)
      .populate('items.product', 'name images price')
      .populate('user', 'name email phone')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(); // Convert to plain JavaScript objects

    // Format response data
    const formattedOrders = orders.map(order => ({
      _id: order._id,
      orderId: order.orderId,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      finalAmount: order.finalAmount,
      walletDeduction: order.walletDeduction,
      cashOnDelivery: order.cashOnDelivery,
      total: order.total,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: order.items,
      shippingAddress: order.shippingAddress,
      customerInfo: order.customerInfo || {
        name: order.user?.name,
        email: order.user?.email,
        phone: order.user?.phone
      },
      user: order.user
    }));

    res.status(200).json({
      success: true,
      orders: formattedOrders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalOrders: total,
        hasNext: parseInt(page) * parseInt(limit) < total,
        hasPrev: parseInt(page) > 1,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get seller orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
      error: error.message
    });
  }
};

exports.getOrderDetails = async (req, res) => {
  try {
    const sellerId = req.seller._id || req.seller.id;
    const { orderId } = req.params;

    let order;
    if (orderId.length === 24) {
      order = await Order.findOne({ 
        _id: orderId,
        seller: sellerId 
      });
    } else {
      order = await Order.findOne({ 
        orderId: orderId,
        seller: sellerId 
      });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or access denied'
      });
    }

    // Populate related data
    const populatedOrder = await Order.populate(order, [
      { 
        path: 'items.product', 
        select: 'name images price description category brand' 
      },
      { 
        path: 'user', 
        select: 'name email phone' 
      },
      { 
        path: 'driver', 
        select: 'name phone vehicle' 
      }
    ]);

    // Calculate seller's total from their items only
    const sellerItems = populatedOrder.items.filter(item => 
      item.product && item.product.seller && 
      item.product.seller.toString() === sellerId.toString()
    );

    const sellerTotal = sellerItems.reduce((total, item) => 
      total + (item.price * item.quantity), 0
    );

    // Format response
    const response = {
      _id: populatedOrder._id,
      orderId: populatedOrder.orderId,
      status: populatedOrder.status,
      paymentMethod: populatedOrder.paymentMethod,
      paymentStatus: populatedOrder.paymentStatus,
      walletDeduction: populatedOrder.walletDeduction,
      cashOnDelivery: populatedOrder.cashOnDelivery,
      finalAmount: populatedOrder.finalAmount,
      total: populatedOrder.total,
      createdAt: populatedOrder.createdAt,
      updatedAt: populatedOrder.updatedAt,
      items: populatedOrder.items,
      shippingAddress: populatedOrder.shippingAddress,
      customerInfo: populatedOrder.customerInfo || {
        name: populatedOrder.user?.name,
        email: populatedOrder.user?.email,
        phone: populatedOrder.user?.phone
      },
      user: populatedOrder.user,
      driver: populatedOrder.driver,
      secretCode: populatedOrder.secretCode,
      isSecretCodeVerified: populatedOrder.isSecretCodeVerified,
      driverMarkedPaid: populatedOrder.driverMarkedPaid,
      estimatedDelivery: populatedOrder.estimatedDelivery,
      deliveryNotes: populatedOrder.deliveryNotes,
      trackingNumber: populatedOrder.trackingNumber,
      sellerTotal: sellerTotal,
      sellerItems: sellerItems,
      platformFee: populatedOrder.payout?.platform?.serviceFee || 0,
      gstOnPlatformFee: populatedOrder.payout?.platform?.gstCollection || 0,
      sellerPayable: populatedOrder.payout?.seller?.payableAmount || 0,
      tdsDeduction: populatedOrder.payout?.seller?.tdsDeduction || 0,
      netAmount: populatedOrder.payout?.seller?.netAmount || 0
    };

    res.status(200).json({
      success: true,
      order: response
    });

  } catch (error) {
    console.error('Get order details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching order details',
      error: error.message
    });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const sellerId = req.seller.id;
    const { orderId } = req.params;
    const { status, notes } = req.body;

    const sellerProducts = await Product.find({ seller: sellerId }).select('_id');
    const productIds = sellerProducts.map(p => p._id);

    const order = await Order.findOne({ 
      _id: orderId,
      'items.product': { $in: productIds }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or access denied'
      });
    }

    order.status = status;
    if (notes) {
      order.deliveryNotes = notes;
    }

    await order.save();

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      data: order
    });

  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating order status',
      error: error.message
    });
  }
};

exports.getSellerDashboard = async (req, res) => {
  try {
    const sellerId = req.seller.id;

    // Fetch seller and get their products
    const seller = await Seller.findById(sellerId).select('products');
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }
    const productIds = seller.products || [];

    const orderStats = await Order.aggregate([
      { $unwind: '$items' },
      { $match: { 'items.product': { $in: productIds } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
        }
      }
    ]);

    const revenueStats = await Order.aggregate([
      { $unwind: '$items' },
      { $match: { 'items.product': { $in: productIds } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          totalOrders: { $addToSet: '$_id' }
        }
      },
      {
        $project: {
          totalRevenue: 1,
          totalOrders: { $size: '$totalOrders' }
        }
      }
    ]);

    const recentOrders = await Order.aggregate([
      { $unwind: '$items' },
      { $match: { 'items.product': { $in: productIds } } },
      { $group: { _id: '$_id' } },
      { $sort: { _id: -1 } },
      { $limit: 5 }
    ]);

    const stats = {
      orders: {
        pending: orderStats.find(s => s._id === 'pending')?.count || 0,
        confirmed: orderStats.find(s => s._id === 'confirmed')?.count || 0,
        shipped: orderStats.find(s => s._id === 'shipped')?.count || 0,
        delivered: orderStats.find(s => s._id === 'delivered')?.count || 0,
        cancelled: orderStats.find(s => s._id === 'cancelled')?.count || 0
      },
      revenue: revenueStats[0]?.totalRevenue || 0,
      totalOrders: revenueStats[0]?.totalOrders || 0,
      recentOrders: recentOrders.length
    };

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get seller dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard data',
      error: error.message
    });
  }
};