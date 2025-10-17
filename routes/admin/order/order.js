const express = require("express");
const router = express.Router();
const {
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  assignDriver,
  updatePaymentStatus,
  cancelOrder,
  getOrderStats,
  getFreshOrders,
  getFreshOrdersNotifications,
  getFreshOrdersStats
} = require("../../../controllers/admin/order/order");

router.get("/getall", getAllOrders);

router.get("/stats", getOrderStats);

router.get("/:id", getOrderById);

router.put("/:id/status", updateOrderStatus);

router.put("/:id/assign-driver", assignDriver);

router.put("/:id/payment-status", updatePaymentStatus);

router.delete("/:id", cancelOrder);

router.get("/admin/fresh-orders", getFreshOrders);

router.get("/admin/fresh-orders/notifications", getFreshOrdersNotifications);

router.get("/admin/fresh-orders/stats", getFreshOrdersStats);

module.exports = router;