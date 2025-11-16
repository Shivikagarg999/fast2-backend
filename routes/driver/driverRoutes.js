const express = require("express");
const router = express.Router();
const {
  getPendingOrders,
  acceptOrder,
  toggleAvailability,
  markOrderDelivered,
  markOrderPickedUp,
  getAvailability,
  getWalletDetails,
  getOngoingOrders,
  verifySecretCodeAndPayment,
  checkOrderPlaced
} = require("../../controllers/driver/driverControllers");
const { authenticateToken } = require("../../middlewares/driverAuth");

router.get("/orders/pending", authenticateToken, getPendingOrders);

router.get("/orders/ongoing", authenticateToken, getOngoingOrders);

router.patch("/orders/:orderId/accept", authenticateToken, acceptOrder);

router.patch("/availability", authenticateToken, toggleAvailability);

router.patch("/orders/:orderId/pickup", authenticateToken, markOrderPickedUp);

router.patch("/orders/:orderId/verify-payment", authenticateToken, verifySecretCodeAndPayment);

router.patch("/orders/:orderId/deliver", authenticateToken, markOrderDelivered);

router.get("/check/:orderId", checkOrderPlaced);

router.get("/availability", authenticateToken, getAvailability);+

router.get("/wallet", authenticateToken, getWalletDetails);

router.post(
  "/orders/:orderId/verify-delivery",
  authenticateToken,
  verifySecretCodeAndPayment
);

module.exports = router;
