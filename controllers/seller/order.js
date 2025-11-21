const Order = require('../../models/order');
const Product = require('../../models/product');
const Seller = require('../../models/seller');

exports.getSellerOrders = async (req, res) => {
  try {
    const sellerId = req.seller.id;
    const {
      page = 1,
      limit = 10,
      status,
      paymentStatus,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const dateFilter = {};
    if (startDate) {
      dateFilter.$gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.$lte = new Date(endDate);
    }

    const matchFilter = {};
    
    // Fetch seller and get their products
    const seller = await Seller.findById(sellerId).select('products');
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }
    const productIds = seller.products || [];

    matchFilter['items.product'] = { $in: productIds };

    if (status) {
      matchFilter.status = status;
    }

    if (paymentStatus) {
      matchFilter.paymentStatus = paymentStatus;
    }

    if (startDate || endDate) {
      matchFilter.createdAt = dateFilter;
    }

    const orders = await Order.aggregate([
      { $match: matchFilter },
      { $unwind: '$items' },
      { $match: { 'items.product': { $in: productIds } } },
      {
        $group: {
          _id: '$_id',
          order: { $first: '$$ROOT' },
          sellerItems: { $push: '$items' },
          sellerTotal: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
        }
      },
      {
        $project: {
          'order.items': '$sellerItems',
          'order.sellerTotal': '$sellerTotal',
          'order.user': 1,
          'order.status': 1,
          'order.paymentStatus': 1,
          'order.paymentMethod': 1,
          'order.shippingAddress': 1,
          'order.createdAt': 1,
          'order.updatedAt': 1
        }
      },
      { $sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit * 1 }
    ]);

    // Get total count
    const totalResult = await Order.aggregate([
      { $match: matchFilter },
      { $unwind: '$items' },
      { $match: { 'items.product': { $in: productIds } } },
      { $group: { _id: '$_id' } },
      { $count: 'total' }
    ]);

    const total = totalResult[0]?.total || 0;

    const populatedOrders = await Order.populate(orders, [
      { path: 'order.items.product', select: 'name images' },
      { path: 'order.user', select: 'name email phone' },
      { path: 'order.driver', select: 'name phone' }
    ]);

    res.status(200).json({
      success: true,
      data: populatedOrders.map(o => o.order),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalOrders: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
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
    const sellerId = req.seller.id;
    const { orderId } = req.params;

    const sellerProducts = await Product.find({ seller: sellerId }).select('_id');
    const productIds = sellerProducts.map(p => p._id);

    const order = await Order.findOne({ 
      _id: orderId,
      'items.product': { $in: productIds }
    })
    .populate('user', 'name email phone')
    .populate('driver', 'name phone vehicle')
    .populate('items.product', 'name images brand category');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or access denied'
      });
    }

    const sellerItems = order.items.filter(item => 
      productIds.includes(item.product._id)
    );

    const sellerOrder = {
      ...order.toObject(),
      items: sellerItems,
      sellerTotal: sellerItems.reduce((total, item) => total + (item.price * item.quantity), 0)
    };

    res.status(200).json({
      success: true,
      data: sellerOrder
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