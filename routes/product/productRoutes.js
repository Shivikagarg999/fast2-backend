const express = require('express');
const { 
  createProduct, 
  getProducts, 
  getProductById, 
  updateProduct,
  getProductsByCategory, 
  deleteProduct,
  getProductsByPincode,
  getProductStats,
  getLowStockAlerts,
  getOutOfStockProducts,
  getProductsByWarehouse,
  getProductsForPincode
} = require('../../controllers/product/productController');
const upload = require('../../middlewares/upload');

const router = express.Router();

router.post('/create', upload.fields([
  { name: 'images', maxCount: 5 },
  { name: 'video', maxCount: 1 }
]), createProduct);

router.put('/:id', upload.fields([
  { name: 'images', maxCount: 5 },
  { name: 'video', maxCount: 1 }
]), updateProduct);

router.get('/', getProducts);
router.get('/warehouse/:warehouseCode', getProductsByWarehouse);
router.get('/for-pincode', getProductsForPincode);
router.get('/:id', getProductById);
router.delete('/:id', deleteProduct);
router.get('/category/:categoryId', getProductsByCategory);
router.get('/by-pincode', getProductsByPincode);

router.get("/admin/stats", getProductStats);
router.get("/admin/low-stock-alerts", getLowStockAlerts);
router.get("/admin/out-of-stock", getOutOfStockProducts);

module.exports = router;