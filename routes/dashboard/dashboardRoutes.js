const express = require('express');
const router = express.Router();
const dashboardController = require('../../controllers/dashboard/dashboardControllers');

router.get('/overview', dashboardController.getDashboardOverview);
router.get('/daily-sales', dashboardController.getDailySales);
router.get('/top-sellers', dashboardController.getTopSellers);
router.get('/top-promotors', dashboardController.getTopPromotors);

module.exports = router;