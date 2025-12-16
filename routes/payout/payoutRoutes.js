const express = require('express');
const router = express.Router();
const payoutController = require('../../controllers/payout/payout');

router.get('/seller-payouts', payoutController.getSellerPayouts);
router.get('/promotor-payouts', payoutController.getPromotorPayouts);
router.put('/seller-payouts/:id/status', payoutController.updateSellerPayoutStatus);
router.put('/promotor-payouts/:id/status', payoutController.updatePromotorPayoutStatus);
router.get('/summary', payoutController.getPayoutSummary);
router.get('/seller/:sellerId', payoutController.getSellerPayoutDetails);
router.get('/promotor/:promotorId', payoutController.getPromotorPayoutDetails);

module.exports = router;