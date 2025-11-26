const express = require("express");
const router = express.Router();
const couponController = require("../../../controllers/admin/coupon/coupon");

router.post("/admin/coupons", couponController.createCoupon);
router.get("/admin/coupons", couponController.getAllCoupons);
router.put("/admin/coupons/:couponId", couponController.updateCoupon);
router.delete("/admin/coupons/:couponId", couponController.deleteCoupon);
router.patch("/admin/coupons/:couponId/toggle", couponController.toggleCouponStatus);
router.post("/coupons/apply", couponController.applyCoupon);
router.get("/coupons/active", couponController.getActiveCoupons);

module.exports = router;