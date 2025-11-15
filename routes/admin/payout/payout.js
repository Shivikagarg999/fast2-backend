const express = require('express');
const router = express.Router();
const payoutController = require('../../../controllers/admin/payout/payout');

// Get all promotor payouts (pending)
router.get('/promotors', payoutController.getPromotorPayouts);

// Get all seller payouts (pending)
router.get('/sellers', payoutController.getSellerPayouts);

// Get payout summary for dashboard
router.get('/summary', payoutController.getPayoutSummary);

// Get specific promotor payout details
router.get('/promotor/:promotorId', payoutController.getPromotorPayoutById);

// Get specific seller payout details
router.get('/seller/:sellerId', payoutController.getSellerPayoutById);

// Payout record management
router.post('/create', payoutController.createPayout);
router.get('/records', payoutController.getAllPayouts);
router.patch('/records/:payoutId/mark-paid', payoutController.markPayoutAsPaid);
router.patch('/records/:payoutId/status', payoutController.updatePayoutStatus);
router.get('/history/:recipientType/:recipientId', payoutController.getPayoutHistory);

module.exports = router;