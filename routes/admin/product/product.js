const express = require('express');
const router = express.Router();
const multer = require('multer');
const { 
  getProductsAdmin,
  getProductStats,
  getLowStockAlerts,
  getOutOfStockProducts,
  downloadProductsByStatusCSV,
  uploadProductsCSV
} = require('../../../controllers/product/productController');

// Configure multer for CSV upload
const upload = multer({ 
  dest: 'uploads/csv/',
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

// Admin product routes
router.get('/getall', getProductsAdmin);
router.get('/stats', getProductStats);
router.get('/low-stock-alerts', getLowStockAlerts);
router.get('/out-of-stock', getOutOfStockProducts);
router.get('/download/csv', downloadProductsByStatusCSV);
router.post('/upload/csv', upload.single('csvFile'), uploadProductsCSV);

module.exports = router;