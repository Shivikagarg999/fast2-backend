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
      return res.status(400).json({ success: false, message: "Order must be picked up before marking delivered" });
    }

    order.status = "delivered";
    await order.save();

    driver.workInfo.currentOrder = null;
    driver.workInfo.availability = "online";
    await driver.save();

    res.status(200).json({
      success: true,
      message: "Order delivered successfully",
      data: { orderId: order._id, status: order.status }
    });
  } catch (error) {
    console.error("Error marking delivered:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
