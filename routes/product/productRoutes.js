const express = require('express');
const { 
  createProduct, 
  getProducts, 
  getProductById, 
  updateProduct,
  getProductsByCategory, 
  deleteProduct 
} = require('../../controllers/product/productController');
const upload = require('../../middlewares/upload');

const router = express.Router();

// Updated routes for multiple files
router.post('/create', upload.fields([
  { name: 'images', maxCount: 5 },
  { name: 'video', maxCount: 1 }
]), createProduct);

router.put('/:id', upload.fields([
  { name: 'images', maxCount: 5 },
  { name: 'video', maxCount: 1 }
]), updateProduct);

router.get('/', getProducts);
router.get('/:id', getProductById);
router.delete('/:id', deleteProduct);
router.get('/category/:categoryId', getProductsByCategory);

module.exports = router;