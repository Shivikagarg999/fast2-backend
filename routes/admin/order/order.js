const express = require("express");
const router = express.Router();
const {
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  assignDriver,
  updatePaymentStatus,
  cancelOrder,
  getOrderStats
} = require("../../../controllers/admin/order/order");

router.get("/getall", getAllOrders);

router.get("/stats", getOrderStats);

router.get("/:id", getOrderById);

router.put("/:id/status", updateOrderStatus);

router.put("/:id/assign-driver", assignDriver);

router.put("/:id/payment-status", updatePaymentStatus);

router.delete("/:id", cancelOrder);

module.exports = router;