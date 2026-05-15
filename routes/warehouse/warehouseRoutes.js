const express = require("express");
const router = express.Router();
const warehouseAuth = require("../../middlewares/warehouseAuth");
const {
  login,
  getProfile,
  getProducts,
  getProductById,
  getSellers,
  getOrders,
  getOrderById,
  getAnalytics,
  getWarehouseForPincode,
} = require("../../controllers/warehouse/warehouseController");

// Public
router.post("/login", login);
router.get("/for-pincode", getWarehouseForPincode);

// Protected
router.get("/profile", warehouseAuth, getProfile);
router.get("/products", warehouseAuth, getProducts);
router.get("/products/:id", warehouseAuth, getProductById);
router.get("/sellers", warehouseAuth, getSellers);
router.get("/orders", warehouseAuth, getOrders);
router.get("/orders/:id", warehouseAuth, getOrderById);
router.get("/analytics", warehouseAuth, getAnalytics);

module.exports = router;
