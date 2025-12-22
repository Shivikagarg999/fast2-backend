const express = require('express');
const router = express.Router();
const payoutController = require('../../controllers/payout/payout');
const sellerAuth= require('../../middlewares/sellerAuth');

router.get('/seller/my-payouts', sellerAuth, payoutController.getSellerOwnPayouts);
router.get('/seller/my-payout-details', sellerAuth, payoutController.getSellerOwnPayoutDetails);
router.post('/seller/request-payout', sellerAuth, payoutController.requestPayout);

router.get('/seller-payouts', payoutController.getSellerPayouts);
router.get('/promotor-payouts', payoutController.getPromotorPayouts);
router.put('/seller-payouts/:id/status', payoutController.updateSellerPayoutStatus);
router.put('/promotor-payouts/:id/status', payoutController.updatePromotorPayoutStatus);
router.get('/summary', payoutController.getPayoutSummary);
router.get('/seller/:sellerId', payoutController.getSellerPayoutDetails);
router.get('/promotor/:promotorId', payoutController.getPromotorPayoutDetails);

module.exports = router;