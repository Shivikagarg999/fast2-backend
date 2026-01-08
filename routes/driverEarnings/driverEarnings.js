const express = require('express');
const { 
  getEarningsBreakdown, 
  getEarningsSummary,
  getAllEarnings,
  getEarningsAnalytics,
  getDriverEarningsDetail,
  markAsPaid,
  getPendingPayouts
} = require('../../controllers/driverEarnings/driverEarnings');
const { authenticateToken } = require('../../middlewares/driverAuth');
const router = express.Router();

router.get('/earnings', authenticateToken, getEarningsBreakdown);
router.get('/earnings/summary', authenticateToken, getEarningsSummary);
router.get('/admin/earnings', getAllEarnings);
router.get('/admin/earnings/analytics', getEarningsAnalytics);
router.get('/admin/earnings/driver/:driverId', getDriverEarningsDetail);
router.get('/admin/earnings/pending', getPendingPayouts);
router.patch('/admin/earnings/:earningId/mark-paid', markAsPaid);

module.exports = router;