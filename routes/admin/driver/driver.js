const express = require('express');
const router = express.Router();
const adminDriverController = require('../../../controllers/admin/driver/driver');

// Driver Management routes
router.get('/getall', adminDriverController.getAllDrivers);
router.get('/:id', adminDriverController.getDriverById);
router.post('/create', adminDriverController.createDriver);
router.put('/edit/:id', adminDriverController.updateDriver);
router.patch('/:id/status', adminDriverController.updateDriverStatus);
router.patch('/:id/verify', adminDriverController.verifyDriver);
router.delete('delete/:id', adminDriverController.deleteDriver);
router.get('/:id/orders', adminDriverController.getDriverOrders);
router.get('/:id/earnings', adminDriverController.getDriverEarnings);
router.patch('/:id/location', adminDriverController.updateDriverLocation);
router.get('/:id/performance', adminDriverController.getDriverPerformance);

// Available Drivers
router.get('/available/nearby', adminDriverController.getNearbyAvailableDrivers);

module.exports = router;