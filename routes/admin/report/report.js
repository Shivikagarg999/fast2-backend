const express = require("express");
const router = express.Router();
const { getOrderReport } = require("../../../controllers/admin/reports/orderReport");
const { getSellerReport } = require("../../../controllers/admin/reports/sellerReport");
const { getPromotorReport } = require("../../../controllers/admin/reports/promotorReport");
const { getProductReport } = require("../../../controllers/admin/reports/productReport");
const { adminAuth } = require("../../../middlewares/adminAuth");

router.use(adminAuth);

router.get("/orders", getOrderReport);
router.get("/sellers", getSellerReport);
router.get("/promotors", getPromotorReport);
router.get("/products", getProductReport);

module.exports = router;
