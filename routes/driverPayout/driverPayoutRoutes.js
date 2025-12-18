const express = require('express');
const router = express.Router();
const driverPayoutController = require('../../controllers/driverPayout/driverPayout');

router.get('/driver-payouts', driverPayoutController.getDriverPayouts);
router.get('/driver-payouts/:payoutId', driverPayoutController.getDriverPayoutDetails);
router.get('/driver-earnings', driverPayoutController.getDriverEarnings);
router.put('/driver-payouts/:payoutId/status', driverPayoutController.updatePayoutStatus);
router.post('/driver-payouts/create', driverPayoutController.createDriverPayout);
router.get('/driver-payouts-summary', driverPayoutController.getPayoutSummary);
router.get('/driver/:driverId', driverPayoutController.getDriverById);

module.exports = router;