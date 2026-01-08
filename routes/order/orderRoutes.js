const express = require("express");
const router = express.Router();
const orderController = require("../../controllers/order/order");
const auth = require("../../middlewares/userauth");

router.post("/create", auth, orderController.createOrder);
router.post("/verify-payment", auth, orderController.verifyRazorpayPayment);
router.get("/:orderId/payment-status", auth, orderController.checkPaymentStatus);
router.get("/:orderId/razorpay-details", auth, orderController.getRazorpayOrder);
router.post("/:orderId/refund", auth, orderController.refundPayment);
router.post("/webhooks/razorpay", orderController.razorpayWebhook);
router.get("/test-payment-details", auth, orderController.getTestPaymentDetails);
router.get("/my-orders", auth, orderController.getMyOrders);
router.put("/:orderId/status", auth, orderController.updateOrderStatus);
router.get('/:orderId/invoice', auth, orderController.downloadInvoice);
router.get("/:orderId/payout-details", auth, orderController.getOrderPayoutDetails);
router.post("/:orderId/seller-payout", auth, orderController.processSellerPayout);
router.post("/:orderId/promotor-payout", auth, orderController.processPromotorPayout);
router.get("/seller/:sellerId/payouts", auth, orderController.getSellerPayouts);
router.get("/promotor/:promotorId/payouts", auth, orderController.getPromotorPayouts);
router.get("/payouts/summary", auth, orderController.getPayoutSummary);

module.exports = router;