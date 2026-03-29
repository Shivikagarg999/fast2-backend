const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  getProductsAdmin,
  getProductStats,
  getLowStockAlerts,
  getOutOfStockProducts,
  downloadProductsByStatusCSV,
  downloadProductUploadTemplate,
  uploadProductsCSV
} = require('../../../controllers/product/productController');
const scratchGiftController = require('../../../controllers/admin/product/scratchGiftController');

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
router.get('/download/template', downloadProductUploadTemplate);
router.post('/upload/csv', upload.single('csvFile'), uploadProductsCSV);

// Scratch gift routes
router.get('/:productId/scratch-gift', scratchGiftController.getScratchGift);
router.post('/:productId/scratch-gift', scratchGiftController.attachScratchGift);
router.delete('/:productId/scratch-gift', scratchGiftController.removeScratchGift);

module.exports = router;