const express = require("express");
const router = express.Router();
const orderController = require("../../controllers/order/order");
const auth = require("../../middlewares/userauth");

// Create a new order
router.post("/", auth, orderController.createOrder);

// Get user order 
router.get("/my-orders", auth, orderController.getMyOrders);

// Get all orders for a user
// router.get("/user/:userId",auth, orderController.getUserOrders);

// Update order status (admin)
router.put("/:orderId/status", orderController.updateOrderStatus);

module.exports = router;   