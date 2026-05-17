const express = require("express");
const router = express.Router();
const promotorAuth = require("../../middlewares/promotorAuth");
const upload = require("../../middlewares/upload");
const {
  loginPromotor,
  getProfile,
  getSellers,
  getProducts,
  getOrders,
  getOrderById,
  getDashboard,
  addProduct,
  getWarehouses,
} = require("../../controllers/promotor/promotorController");

// Public
router.post("/login", loginPromotor);

// Protected
router.get("/profile", promotorAuth, getProfile);
router.get("/dashboard", promotorAuth, getDashboard);
router.get("/sellers", promotorAuth, getSellers);
router.get("/products", promotorAuth, getProducts);
router.get("/orders", promotorAuth, getOrders);
router.get("/orders/:id", promotorAuth, getOrderById);
router.get("/warehouses", promotorAuth, getWarehouses);
router.post("/products", promotorAuth, upload.array("images", 5), addProduct);

module.exports = router;
