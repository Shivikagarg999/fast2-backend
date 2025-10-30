const Order = require("../../models/order");
const Driver = require("../../models/driver");

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
    order.status = "confirmed";
    await order.save();

    driver.workInfo.currentOrder = order._id;
    driver.workInfo.availability = "on-delivery";
    await driver.save();

    res.status(200).json({
      success: true,
      message: "Order accepted successfully",
      data: {
        orderId: order._id,
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

    if (order.status !== "confirmed") {
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
    if (order.paymentMethod === "cod" && !order.driverMarkedPaid) {
      return res.status(400).json({
        success: false,
        message: "Payment status must be confirmed for COD orders"
      });
    }

    order.status = "delivered";
    await order.save();

    const deliveryEarning = 18;

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
          totalEarnings: driver.earnings.totalEarnings
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