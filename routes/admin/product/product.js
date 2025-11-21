const express = require('express');
const router = express.Router();
const { 
  getProductsAdmin,
  getProductStats,
  getLowStockAlerts,
  getOutOfStockProducts
} = require('../../../controllers/product/productController');

// Admin product routes
router.get('/getall', getProductsAdmin);
router.get('/stats', getProductStats);
router.get('/low-stock-alerts', getLowStockAlerts);
router.get('/out-of-stock', getOutOfStockProducts);

module.exports = router;