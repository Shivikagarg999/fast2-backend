const Order = require("../../models/order");
const Driver = require("../../models/driver");
const DriverEarning = require('../../models/driverEarnings');
const { sendNotification } = require("../../services/notificationService");

exports.getPendingOrders = async (req, res) => {
  try {
    const pendingOrders = await Order.find({
      status: "pending",
      driver: null
    })
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: pendingOrders.length,
      data: pendingOrders
    });
  } catch (error) {
    console.error("Error fetching pending orders:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

exports.acceptOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const driver = await Driver.findById(req.driver.driverId);
    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    if (driver.workInfo.availability !== "online") {
      return res.status(400).json({ success: false, message: "Driver must be online to accept an order" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.status !== "pending") {
      return res.status(400).json({ success: false, message: "Order is not available for acceptance" });
    }

    if (order.driver) {
      return res.status(400).json({ success: false, message: "Order already assigned to another driver" });
    }

    order.driver = driver._id;
    order.status = "accepted";

    if (!order.finalAmount) {
      order.finalAmount = order.total;
    }

    await order.save();

    driver.workInfo.currentOrder = order._id;
    driver.workInfo.availability = "on-delivery";
    await driver.save();

    res.status(200).json({
      success: true,
      message: "Order accepted successfully",
      data: {
        orderId: order._id,
        orderCustomId: order.orderId,
        driverId: driver._id
      }
    });
  } catch (error) {
    console.error("Error accepting order:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

exports.toggleAvailability = async (req, res) => {
  try {
    const driver = await Driver.findById(req.driver.driverId);
    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    const { availability } = req.body;

    if (!["online", "offline"].includes(availability)) {
      return res.status(400).json({ success: false, message: "Invalid availability value" });
    }

    driver.workInfo.availability = availability;
    await driver.save();

    res.status(200).json({
      success: true,
      message: `Driver is now ${availability}`,
      data: {
        driverId: driver._id,
        availability: driver.workInfo.availability,
      },
    });
  } catch (error) {
    console.error("Error updating availability:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

exports.markOrderPickedUp = async (req, res) => {
  try {
    const { orderId } = req.params;
    const driver = await Driver.findById(req.driver.driverId);
    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.driver?.toString() !== driver._id.toString()) {
      return res.status(403).json({ success: false, message: "You are not assigned to this order" });
    }

    if (order.status !== "accepted") {
      return res.status(400).json({ success: false, message: "Order not in confirmed state" });
    }

    order.status = "picked-up";
    await order.save();

    res.status(200).json({
      success: true,
      message: "Order marked as picked up successfully",
      data: { orderId: order._id, status: order.status }
    });
  } catch (error) {
    console.error("Error marking pickup:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.verifySecretCodeAndPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { secretCode, paidAmount } = req.body;

    const driver = await Driver.findById(req.driver.driverId);
    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.driver?.toString() !== driver._id.toString()) {
      return res.status(403).json({ success: false, message: "You are not assigned to this order" });
    }

    if (order.status !== "picked-up") {
      return res.status(400).json({
        success: false,
        message: "Order must be picked up before verifying delivery"
      });
    }

    if (order.secretCode !== secretCode) {
      return res.status(400).json({
        success: false,
        message: "Invalid secret code"
      });
    }

    if (order.paymentMethod === "cod") {
      if (!paidAmount) {
        return res.status(400).json({
          success: false,
          message: "Payment amount is required for COD orders"
        });
      }

      const expectedAmount = order.finalAmount;
      if (parseFloat(paidAmount) !== parseFloat(expectedAmount)) {
        return res.status(400).json({
          success: false,
          message: `Payment amount mismatch. Expected: ₹${expectedAmount}, Received: ₹${paidAmount}`,
          data: {
            expectedAmount,
            receivedAmount: paidAmount,
            difference: Math.abs(expectedAmount - paidAmount)
          }
        });
      }

      order.cashOnDelivery = parseFloat(paidAmount);
      order.driverMarkedPaid = true;
      order.paymentStatus = "paid";
    }

    if (order.paymentMethod === "online") {
      order.driverMarkedPaid = true; s
    }

    order.isSecretCodeVerified = true;

    await order.save();

    res.status(200).json({
      success: true,
      message: "Secret code verified and payment confirmed successfully",
      data: {
        orderId: order._id,
        orderCustomId: order.orderId,
        isSecretCodeVerified: true,
        driverMarkedPaid: true,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        paidAmount: order.paymentMethod === "cod" ? paidAmount : 0,
        finalAmount: order.finalAmount,
        paymentNote: order.paymentMethod === "cod"
          ? `Customer paid ₹${paidAmount} cash to driver`
          : "Payment already completed online"
      }
    });
  } catch (error) {
    console.error("Error verifying secret code and payment:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

exports.markOrderDelivered = async (req, res) => {
  try {
    const { orderId } = req.params;
    const driver = await Driver.findById(req.driver.driverId);
    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.driver?.toString() !== driver._id.toString()) {
      return res.status(403).json({ success: false, message: "You are not assigned to this order" });
    }

    if (order.status !== "picked-up") {
      return res.status(400).json({
        success: false,
        message: "Order must be picked up before marking delivered"
      });
    }

    if (!order.isSecretCodeVerified) {
      return res.status(400).json({
        success: false,
        message: "Secret code must be verified before marking as delivered"
      });
    }

    order.status = "delivered";
    order.paymentStatus = "paid";
    await order.save();

    const deliveryEarning = 18;
    const driverEarning = new DriverEarning({
      driver: driver._id,
      order: order._id,
      orderId: order.orderId,
      amount: deliveryEarning,
      type: 'delivery',
      description: 'Delivery completed',
      customerAddress: order.shippingAddress,
      status: 'earned',
      transactionDate: new Date()
    });

    await driverEarning.save();

    driver.earnings.totalEarnings += deliveryEarning;
    driver.earnings.currentBalance += deliveryEarning;
    driver.earnings.pendingPayout += deliveryEarning;
    driver.earnings.todayEarnings += deliveryEarning;
    driver.workInfo.currentOrder = null;
    driver.workInfo.availability = "online";
    await driver.save();

    res.status(200).json({
      success: true,
      message: "Order delivered successfully. Earnings added to wallet.",
      data: {
        orderId: order._id,
        orderCustomId: order.orderId,
        status: order.status,
        driverEarnings: {
          added: deliveryEarning,
          currentBalance: driver.earnings.currentBalance,
          totalEarnings: driver.earnings.totalEarnings,
          earningId: driverEarning._id
        }
      }
    });
  } catch (error) {
    console.error("Error marking delivered:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.getAvailability = async (req, res) => {
  try {
    const driver = await Driver.findById(req.driver.driverId);
    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    res.status(200).json({
      success: true,
      data: {
        driverId: driver._id,
        availability: driver.workInfo.availability,
      },
    });
  } catch (error) {
    console.error("Error fetching driver availability:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

exports.getOngoingOrders = async (req, res) => {
  try {
    const driver = await Driver.findById(req.driver.driverId);
    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    const ongoingOrders = await Order.find({
      driver: driver._id,
      status: { $in: ["confirmed", "picked-up"] }
    })
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: ongoingOrders.length,
      data: ongoingOrders
    });
  } catch (error) {
    console.error("Error fetching ongoing orders:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

exports.getWalletDetails = async (req, res) => {
  try {
    const driver = await Driver.findById(req.driver.driverId).select("earnings personalInfo.name");
    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    res.status(200).json({
      success: true,
      data: {
        name: driver.personalInfo.name,
        totalEarnings: driver.earnings.totalEarnings,
        currentBalance: driver.earnings.currentBalance,
        pendingPayout: driver.earnings.pendingPayout,
        todayEarnings: driver.earnings.todayEarnings,
        weeklyEarnings: driver.earnings.weeklyEarnings,
        monthlyEarnings: driver.earnings.monthlyEarnings
      }
    });
  } catch (error) {
    console.error("Error fetching wallet details:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

exports.verifySecretCodeAndPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { secretCode, isPaid } = req.body;

    const driver = await Driver.findById(req.driver.driverId);
    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.driver?.toString() !== driver._id.toString()) {
      return res.status(403).json({ success: false, message: "You are not assigned to this order" });
    }

    if (order.status !== "picked-up") {
      return res.status(400).json({
        success: false,
        message: "Order must be picked up before verifying delivery"
      });
    }

    if (order.secretCode !== secretCode) {
      return res.status(400).json({
        success: false,
        message: "Invalid secret code"
      });
    }

    order.isSecretCodeVerified = true;
    order.driverMarkedPaid = isPaid;

    if (order.paymentMethod === "cod" && isPaid) {
      order.paymentStatus = "paid";
    }

    await order.save();

    res.status(200).json({
      success: true,
      message: "Secret code verified successfully",
      data: {
        orderId: order._id,
        orderCustomId: order.orderId,
        isSecretCodeVerified: true,
        driverMarkedPaid: order.driverMarkedPaid,
        paymentStatus: order.paymentStatus
      }
    });
  } catch (error) {
    console.error("Error verifying secret code:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

exports.checkOrderPlaced = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({
      $or: [
        { _id: orderId },
        { orderId: orderId }
      ]
    }).select("orderId status user finalAmount paymentStatus createdAt");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
        placed: false,
      });
    }

    res.status(200).json({
      success: true,
      placed: true,
      message: "Order found",
      data: {
        orderId: order.orderId || order._id,
        status: order.status,
        paymentStatus: order.paymentStatus,
        finalAmount: order.finalAmount,
        createdAt: order.createdAt,
      }
    });

  } catch (error) {
    console.error("Error checking order:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

exports.getDriverPayouts = async (req, res) => {
  try {
    const {
      driverId,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 10,
      view = 'detailed'
    } = req.query;

    const filter = {};

    if (driverId) filter.driver = driverId;
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    if (view === 'aggregated') {
      const aggregatedData = await DriverPayout.aggregate([
        { $match: filter },

        {
          $lookup: {
            from: "drivers",
            localField: "driver",
            foreignField: "_id",
            as: "driverInfo"
          }
        },
        { $unwind: { path: "$driverInfo", preserveNullAndEmptyArrays: true } },

        {
          $group: {
            _id: "$driver",
            driverId: { $first: "$driver" },
            driverName: { $first: "$driverInfo.name" },
            driverEmail: { $first: "$driverInfo.email" },
            driverPhone: { $first: "$driverInfo.phone" },
            vehicleNumber: { $first: "$driverInfo.vehicleNumber" },
            totalAmount: { $sum: "$totalAmount" },
            totalOrders: { $sum: "$numberOfOrders" },
            pendingOrders: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$numberOfOrders", 0] }
            },
            paidOrders: {
              $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$numberOfOrders", 0] }
            },
            pendingAmount: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$totalAmount", 0] }
            },
            paidAmount: {
              $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$totalAmount", 0] }
            }
          }
        },
        {
          $addFields: {
            driverName: {
              $ifNull: ["$driverName", "Driver"]
            },
            driverEmail: {
              $ifNull: ["$driverEmail", ""]
            },
            driverPhone: {
              $ifNull: ["$driverPhone", ""]
            },
            vehicleNumber: {
              $ifNull: ["$vehicleNumber", ""]
            }
          }
        },
        { $sort: { totalAmount: -1 } },
        { $skip: skip },
        { $limit: parseInt(limit) }
      ]);
      const totalGroups = await DriverPayout.aggregate([
        { $match: filter },
        { $group: { _id: "$driver" } },
        { $count: "total" }
      ]);

      const total = totalGroups.length > 0 ? totalGroups[0].total : 0;

      res.json({
        payouts: aggregatedData,
        view: 'aggregated',
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      });

    } else {
      const payouts = await DriverPayout.find(filter)
        .populate('driver', 'name email phone vehicleNumber')
        .populate('processedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await DriverPayout.countDocuments(filter);

      res.json({
        payouts,
        view: 'detailed',
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      });
    }
  } catch (error) {
    console.error('Error in getDriverPayouts:', error);
    res.status(500).json({
      error: error.message,
      success: false
    });
  }
};

exports.getDriverDetails = async (req, res) => {
  try {
    const { driverId } = req.params;

    const driver = await Driver.findById(driverId).select('name email phone vehicleNumber');

    const earnings = await DriverEarning.find({ driver: driverId })
      .populate('order', 'orderId')
      .sort({ createdAt: -1 });

    const totalPendingEarnings = earnings
      .filter(e => e.status === 'earned')
      .reduce((sum, e) => sum + e.amount, 0);

    const totalPaidEarnings = earnings
      .filter(e => e.status === 'paid')
      .reduce((sum, e) => sum + e.amount, 0);

    const totalEarnings = earnings.reduce((sum, e) => sum + e.amount, 0);

    res.json({
      success: true,
      data: {
        driver,
        earnings,
        totalPendingEarnings,
        totalPaidEarnings,
        totalEarnings,
        earningCount: earnings.length,
        summary: {
          perOrderAmount: 18,
          totalOrders: earnings.length,
          totalAmount: totalEarnings
        }
      }
    });

  } catch (error) {
    console.error('Error in getDriverDetails:', error);
    res.status(500).json({
      error: error.message,
      success: false
    });
  }
};

exports.processBulkDriverPayout = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { status, paymentMethod, transactionId, remarks } = req.body;

    if (!driverId) {
      return res.status(400).json({ error: 'Driver ID is required' });
    }

    const result = await DriverPayout.updateMany(
      {
        driver: driverId,
        status: 'pending'
      },
      {
        $set: {
          status: status || 'paid',
          payoutMethod: paymentMethod,
          transactionId,
          notes: remarks,
          paidAt: new Date(),
          processedBy: req.user._id
        }
      }
    );

    res.json({
      success: true,
      message: `Updated ${result.modifiedCount} payout batches`,
      processedCount: result.modifiedCount
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.sendConfirmationOtp = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, message: "Order ID is required" });
    }

    const query = {
      $or: [
        { orderId: orderId }
      ]
    };

    const mongoose = require('mongoose');
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      query.$or.push({ _id: orderId });
    }

    const order = await Order.findOne(query).populate('user');

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const driverId = req.driver.driverId;
    if (order.driver && order.driver.toString() !== driverId) {
      return res.status(403).json({ success: false, message: "You are not assigned to this order" });
    }

    let secretCode = order.secretCode;
    if (!secretCode) {
      secretCode = Math.floor(100000 + Math.random() * 900000).toString();
      order.secretCode = secretCode;
      await order.save();
    }

    const message = `Your Fast2 Delivery Code is ${secretCode}. Please share this with the driver to receive your package.`;

    if (order.user) {
      await sendNotification(
        order.user._id,
        "Delivery Confirmation Code",
        message,
        "order",
        order._id,
        { secretCode, orderId: order.orderId }
      );
    }

    res.status(200).json({
      success: true,
      message: "Confirmation OTP sent successfully"
    });

  } catch (error) {
    console.error("Error sending confirmation OTP:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};


exports.getMyPayouts = async (req, res) => {
  try {
    const driverId = req.driver.driverId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const earnings = await DriverEarning.find({ driver: driverId })
      .sort({ transactionDate: -1 })
      .skip(skip)
      .limit(limit);

    const total = await DriverEarning.countDocuments({ driver: driverId });

    res.status(200).json({
      success: true,
      count: earnings.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: earnings
    });
  } catch (error) {
    console.error("Error fetching my payouts:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};