const express = require("express");
const router = express.Router();
const promotorAuth = require("../../middlewares/promotorAuth");
const {
  loginPromotor,
  getProfile,
  getSellers,
  getProducts,
  getOrders,
  getDashboard,
} = require("../../controllers/promotor/promotorController");

// Public
router.post("/login", loginPromotor);

// Protected
router.get("/profile", promotorAuth, getProfile);
router.get("/dashboard", promotorAuth, getDashboard);
router.get("/sellers", promotorAuth, getSellers);
router.get("/products", promotorAuth, getProducts);
router.get("/orders", promotorAuth, getOrders);

module.exports = router;
