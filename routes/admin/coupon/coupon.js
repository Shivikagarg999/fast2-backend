const express = require("express");
const router = express.Router();
const couponController = require("../../../controllers/admin/coupon/coupon");
const { adminAuth } = require("../../../middlewares/adminAuth");
const auth = require("../../../middlewares/userauth");

router.post("/admin/coupons", adminAuth, couponController.createCoupon);
router.get("/admin/coupons", adminAuth, couponController.getAllCoupons);
router.put("/admin/coupons/:couponId", adminAuth, couponController.updateCoupon);
router.delete("/admin/coupons/:couponId", adminAuth, couponController.deleteCoupon);
router.patch("/admin/coupons/:couponId/toggle", adminAuth, couponController.toggleCouponStatus);
router.post("/coupons/apply", auth, couponController.applyCoupon);
router.get("/coupons/active", couponController.getActiveCoupons);

module.exports = router;