const Order = require("../../../models/order");

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

    // Build filter object
    const filter = {};
    
    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    
    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Sort configuration
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

// Get single order by ID
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("user", "name email phone")
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

// Update order status
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

    res.json({
      message: "Order updated successfully",
      order
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Assign driver to order
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

    res.json({
      message: "Driver assigned successfully",
      order
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Update payment status
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

// Delete order (soft delete - update status to cancelled)
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

// Get order statistics
const getOrderStats = async (req, res) => {
  try {
    const { period = "month" } = req.query; // day, week, month, year
    
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

    // Total orders count
    const totalOrders = await Order.countDocuments();
    
    // Recent orders count
    const recentOrders = await Order.countDocuments({
      createdAt: { $gte: startDate }
    });

    // Orders by status
    const ordersByStatus = await Order.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

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

    // Monthly revenue (for charts)
    const monthlyRevenue = await Order.aggregate([
      {
        $match: {
          paymentStatus: "paid",
          createdAt: { $gte: new Date(now.getFullYear(), 0, 1) }
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

    res.json({
      totalOrders,
      recentOrders,
      ordersByStatus: ordersByStatus.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      revenue: revenueStats[0] || { totalRevenue: 0, averageOrderValue: 0 },
      monthlyRevenue
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
  getOrderStats
};