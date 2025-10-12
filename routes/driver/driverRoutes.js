const express = require("express");
const router = express.Router();
const { getPendingOrders, acceptOrder, toggleAvailability, markOrderDelivered, markOrderPickedUp } = require("../../controllers/driver/driverControllers");
const { authenticateToken } = require("../../middlewares/driverAuth");

router.get("/orders/pending", authenticateToken, getPendingOrders);

router.patch("/orders/:orderId/accept", authenticateToken, acceptOrder);

router.patch("/availability", authenticateToken, toggleAvailability);

router.patch("/orders/:orderId/pickup", authenticateToken, markOrderPickedUp);

router.patch("/orders/:orderId/deliver", authenticateToken, markOrderDelivered);

module.exports = router;