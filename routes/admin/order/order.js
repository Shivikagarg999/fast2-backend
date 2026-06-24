const express = require("express");
const router = express.Router();
const { adminAuth } = require("../../../middlewares/adminAuth");
const {
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  assignDriver,
  updatePaymentStatus,
  cancelOrder,
  bulkDeleteOrders,
  getOrderStats,
  getFreshOrders,
  getFreshOrdersNotifications,
  getOnlineOrders,
  getLiveOrders,
  getFreshOrdersStats,
  downloadOrdersByStatusCSV
} = require("../../../controllers/admin/order/order");
const { downloadInvoice } = require("../../../controllers/order/order");

const requireOrderUpdatePermission = (req, res, next) => {
  const permissions = req.admin?.role?.permissions || [];
  const roleName = req.admin?.role?.name;
  const allowedPermissions = [
    "*",
    "orders.update",
    "orders:write",
    "orders:edit",
    "order.update",
    "order:write",
    "admin.orders.update"
  ];

  const canUpdateOrders = permissions.some(permission => {
    if (allowedPermissions.includes(permission)) return true;
    return /orders?/i.test(permission) && /(update|edit|write|manage)/i.test(permission);
  });

  if (roleName === "super_admin" || roleName === "super-admin" || canUpdateOrders) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "Admin does not have order update permission"
  });
};

router.get("/getall", getAllOrders);

router.get("/live", getLiveOrders);

router.get("/getonline", getOnlineOrders);

router.get("/stats", getOrderStats);

router.get("/:id/invoice", adminAuth, downloadInvoice);

router.get("/:id", getOrderById);

router.put("/:id/status", updateOrderStatus);

router.put("/:orderId/driver", assignDriver);

router.put("/:id/assign-driver", assignDriver);

router.put("/:id/payment-status", updatePaymentStatus);

router.delete("/:id", cancelOrder);

router.post("/bulk-delete", bulkDeleteOrders);

router.get("/admin/fresh-orders", getFreshOrders);

router.get("/admin/fresh-orders/notifications", getFreshOrdersNotifications);

router.get("/admin/fresh-orders/stats", getFreshOrdersStats);

router.get("/download/csv", downloadOrdersByStatusCSV);

module.exports = router;
