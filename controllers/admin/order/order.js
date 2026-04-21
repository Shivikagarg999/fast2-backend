const Order = require("../../../models/order");

const downloadOrdersByStatusCSV = async (req, res) => {
  try {
    const { status } = req.query;

    const filter = status ? { status } : {};

    const orders = await Order.find(filter)
      .populate("user", "name email phone")
      .populate("driver", "name phone")
      .populate("seller", "name")
      .populate("items.product", "name")
      .sort({ createdAt: -1 });

    if (orders.length === 0) {
      return res.status(404).json({ message: "No orders found" });
    }

    const csvHeaders = [
      // Order identifiers
      'Order ID',
      'Order Date',
      'Status',

      // Customer
      'Customer Name',
      'Customer Email',
      'Customer Phone',
      'Delivery Address',

      // Seller
      'Seller Name',

      // Driver
      'Driver Name',
      'Driver Phone',

      // Items
      'Items Count',
      'Product Names',
      'Product Quantities',

      // Financials
      'Subtotal (total)',
      'Handling Charge',
      'Total GST',
      'Coupon Code',
      'Coupon Discount',
      'Final Amount',
      'Wallet Deduction',
      'Cash on Delivery',

      // Payment
      'Payment Method',
      'Payment Status',

      // Seller Payout
      'Seller Payable Amount',
      'Seller GST Deduction',
      'Seller TDS Deduction',
      'Seller Net Amount',
      'Seller Payout Status',
      'Seller Paid At',

      // Promotor Commission
      'Promotor Commission Type',
      'Promotor Commission Rate (%)',
      'Promotor Commission Amount',
      'Promotor Payout Status',
      'Promotor Paid At',

      // Platform
      'Platform Service Fee',
      'Platform GST Collection',

      // Refund
      'Refund Amount',
      'Refund Status',
      'Refunded At'
    ];

    const csvRows = orders.map(order => {
      const productNames = order.items.map(item => item.product?.name || 'N/A').join('; ');
      const productQtys = order.items.map(item => `${item.product?.name || 'N/A'} x${item.quantity}`).join('; ');
      const address = order.shippingAddress
        ? `${order.shippingAddress.addressLine}, ${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pinCode}`
        : 'N/A';

      const p = order.payout || {};
      const sellerPayout = p.seller || {};
      const promotorPayout = p.promotor || {};
      const platformPayout = p.platform || {};

      return [
        // Order identifiers
        order.orderId || 'N/A',
        order.createdAt ? order.createdAt.toISOString().split('T')[0] : 'N/A',
        order.status || 'N/A',

        // Customer
        order.user?.name || 'N/A',
        order.user?.email || 'N/A',
        order.user?.phone || 'N/A',
        address,

        // Seller
        order.seller?.name || 'N/A',

        // Driver
        order.driver?.name || 'N/A',
        order.driver?.phone || 'N/A',

        // Items
        order.items.length,
        productNames,
        productQtys,

        // Financials
        order.total || 0,
        order.handlingCharge || 0,
        order.totalGst || 0,
        order.coupon?.code || 'N/A',
        order.coupon?.discount || 0,
        order.finalAmount || 0,
        order.walletDeduction || 0,
        order.cashOnDelivery || 0,

        // Payment
        order.paymentMethod || 'N/A',
        order.paymentStatus || 'N/A',

        // Seller Payout
        sellerPayout.payableAmount ?? 0,
        sellerPayout.gstDeduction ?? 0,
        sellerPayout.tdsDeduction ?? 0,
        sellerPayout.netAmount ?? 0,
        sellerPayout.payoutStatus || 'N/A',
        sellerPayout.paidAt ? sellerPayout.paidAt.toISOString().split('T')[0] : 'N/A',

        // Promotor Commission
        promotorPayout.commissionType || 'N/A',
        promotorPayout.commissionRate ?? 0,
        promotorPayout.commissionAmount ?? 0,
        promotorPayout.payoutStatus || 'N/A',
        promotorPayout.paidAt ? promotorPayout.paidAt.toISOString().split('T')[0] : 'N/A',

        // Platform
        platformPayout.serviceFee ?? 0,
        platformPayout.gstCollection ?? 0,

        // Refund
        order.refundAmount || 0,
        order.refundStatus || 'N/A',
        order.refundedAt ? order.refundedAt.toISOString().split('T')[0] : 'N/A'
      ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
    });

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="orders_${status || 'all'}_${Date.now()}.csv"`);

    res.send(csvContent);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAllOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      paymentStatus,
      paymentMethod,
      startDate,
      endDate,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const filter = {};

    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (paymentMethod) filter.paymentMethod = paymentMethod;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const orders = await Order.find(filter)
      .populate("user", "name email phone")
      .populate("driver", "name phone")
      .populate("items.product", "name images")
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(filter);

    res.json({
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("user", "name email phone")
      .populate("seller", "name email")
      .populate("driver", "name phone vehicle")
      .populate("items.product", "name images category");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { status, deliveryNotes, estimatedDelivery, trackingNumber } = req.body;

    const validStatuses = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const updateData = {};
    if (status) updateData.status = status;
    if (deliveryNotes !== undefined) updateData.deliveryNotes = deliveryNotes;
    if (estimatedDelivery) updateData.estimatedDelivery = estimatedDelivery;
    if (trackingNumber) updateData.trackingNumber = trackingNumber;

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("user", "name email")
      .populate("driver", "name phone");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    try {
      const notificationService = require('../../../services/notificationService');
      await notificationService.notifyOrderStatus(order.user._id || order.user, order.orderId, status);
    } catch (notifError) {
      console.error('Notification error:', notifError);
    }

    res.json({
      message: "Order updated successfully",
      order
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const assignDriver = async (req, res) => {
  try {
    const { driverId } = req.body;

    if (!driverId) {
      return res.status(400).json({ message: "Driver ID is required" });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { driver: driverId },
      { new: true, runValidators: true }
    )
      .populate("user", "name email")
      .populate("driver", "name phone vehicle");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    try {
      const notificationService = require('../../../services/notificationService');
      const driverName = order.driver.name;
      await notificationService.sendNotification(
        order.user._id || order.user,
        'Driver Assigned',
        `${driverName} is picking up your order #${order.orderId}.`,
        'delivery',
        order.orderId,
        { orderId: order.orderId, driverId: driverId }
      );
    } catch (notifError) {
      console.error('Notification error:', notifError);
    }

    res.json({
      message: "Driver assigned successfully",
      order
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getOnlineOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      paymentStatus,
      startDate,
      endDate,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const filter = {
      paymentMethod: 'online',
      paymentStatus: 'paid'
    };

    if (paymentStatus) filter.paymentStatus = paymentStatus;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const orders = await Order.find(filter)
      .populate("user", "name email phone")
      .populate("seller", "name businessName")
      .populate("items.product", "name images")
      .sort(sort)
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Order.countDocuments(filter);

    res.json({
      success: true,
      orders,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Get online orders error:', error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

const updatePaymentStatus = async (req, res) => {
  try {
    const { paymentStatus } = req.body;

    if (!paymentStatus || !["pending", "paid"].includes(paymentStatus)) {
      return res.status(400).json({ message: "Valid payment status is required" });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { paymentStatus },
      { new: true, runValidators: true }
    )
      .populate("user", "name email")
      .populate("driver", "name phone");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json({
      message: "Payment status updated successfully",
      order
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: "cancelled" },
      { new: true }
    )
      .populate("user", "name email")
      .populate("driver", "name phone");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json({
      message: "Order cancelled successfully",
      order
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getOrderStats = async (req, res) => {
  try {
    const { period = "month" } = req.query; // day, week, month, year

    console.log("=== ORDER STATS DEBUG ===");
    console.log("Period received:", period);

    const now = new Date();
    let startDate = new Date();

    switch (period) {
      case "day":
        startDate.setHours(0, 0, 0, 0);
        break;
      case "week":
        startDate.setDate(now.getDate() - 7);
        break;
      case "month":
        startDate.setMonth(now.getMonth() - 1);
        break;
      case "year":
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setMonth(now.getMonth() - 1);
    }

    console.log("Start Date:", startDate);
    console.log("Current Date:", now);

    const totalOrders = await Order.countDocuments();

    const recentOrders = await Order.countDocuments({
      createdAt: { $gte: startDate }
    });

    const ordersByStatus = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    console.log("Orders by status result:", ordersByStatus);

    // Total revenue
    const revenueStats = await Order.aggregate([
      {
        $match: {
          paymentStatus: "paid",
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$total" },
          averageOrderValue: { $avg: "$total" }
        }
      }
    ]);

    // Monthly revenue (for charts) - filtered by period
    const monthlyRevenue = await Order.aggregate([
      {
        $match: {
          paymentStatus: "paid",
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          revenue: { $sum: "$total" },
          orders: { $sum: 1 }
        }
      },
      {
        $sort: { "_id": 1 }
      }
    ]);

    const response = {
      totalOrders,
      recentOrders,
      ordersByStatus: ordersByStatus.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      revenue: revenueStats[0] || { totalRevenue: 0, averageOrderValue: 0 },
      monthlyRevenue,
      debug: {
        period,
        startDate,
        currentDate: now
      }
    };

    console.log("Response summary:", {
      totalOrders,
      recentOrders,
      statusCount: ordersByStatus.length,
      revenueCount: revenueStats.length,
      monthlyRevenueCount: monthlyRevenue.length
    });
    console.log("=== END DEBUG ===\n");

    res.json(response);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getFreshOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      paymentStatus
    } = req.query;

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const filter = {
      createdAt: { $gte: twentyFourHoursAgo }
    };

    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;

    const orders = await Order.find(filter)
      .populate("user", "name email phone")
      .populate("driver", "name phone")
      .populate("items.product", "name images")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(filter);

    res.json({
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
      timeRange: "last 24 hours"
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getFreshOrdersNotifications = async (req, res) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const freshOrders = await Order.find({
      createdAt: { $gte: twentyFourHoursAgo }
    })
      .populate("user", "name email")
      .populate("items.product", "name")
      .sort({ createdAt: -1 })
      .limit(20);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

    const ordersLastHour = await Order.countDocuments({
      createdAt: { $gte: oneHourAgo }
    });

    const ordersLastSixHours = await Order.countDocuments({
      createdAt: { $gte: sixHoursAgo }
    });

    const freshOrdersByStatus = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: twentyFourHoursAgo }
        }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    const notificationSummary = {
      totalFreshOrders: freshOrders.length,
      ordersLastHour,
      ordersLastSixHours,
      freshOrdersByStatus: freshOrdersByStatus.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      latestOrders: freshOrders.slice(0, 5),
      timestamp: new Date()
    };

    res.json(notificationSummary);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getFreshOrdersStats = async (req, res) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const totalFreshOrders = await Order.countDocuments({
      createdAt: { $gte: twentyFourHoursAgo }
    });

    const freshOrdersByStatus = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: twentyFourHoursAgo }
        }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    const freshOrdersRevenue = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: twentyFourHoursAgo },
          paymentStatus: "paid"
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$total" },
          averageOrderValue: { $avg: "$total" },
          orderCount: { $sum: 1 }
        }
      }
    ]);

    const hourlyDistribution = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: twentyFourHoursAgo }
        }
      },
      {
        $group: {
          _id: { $hour: "$createdAt" },
          count: { $sum: 1 },
          revenue: { $sum: "$total" }
        }
      },
      {
        $sort: { "_id": 1 }
      }
    ]);

    res.json({
      totalFreshOrders,
      freshOrdersByStatus: freshOrdersByStatus.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      revenue: freshOrdersRevenue[0] || {
        totalRevenue: 0,
        averageOrderValue: 0,
        orderCount: 0
      },
      hourlyDistribution,
      timeRange: {
        start: twentyFourHoursAgo,
        end: new Date()
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  assignDriver,
  updatePaymentStatus,
  cancelOrder,
  getOrderStats,
  getFreshOrders,
  getFreshOrdersNotifications,
  getFreshOrdersStats,
  getOnlineOrders,
  downloadOrdersByStatusCSV
};