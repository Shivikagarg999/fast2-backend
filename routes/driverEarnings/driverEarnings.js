const express = require('express');
const { 
  getEarningsBreakdown, 
  getEarningsSummary 
} = require('../../controllers/driverEarnings/driverEarnings');
const { authenticateToken } = require('../../middlewares/driverAuth');
const router = express.Router();

router.get('/earnings',authenticateToken, getEarningsBreakdown);
router.get('/earnings/summary',authenticateToken, getEarningsSummary);

module.exports = router;