const express = require ('express');
const { createProduct, getProducts, getProductById, updateProduct,getProductsByCategory, deleteProduct } = require('../../controllers/product/productController');
const upload = require('../../middlewares/upload');

const router = express.Router();

router.post('/create', upload.single('image'), createProduct);
router.get('/', getProducts);
router.get('/:id', getProductById);
router.put('/:id', upload.single('image'), updateProduct);
router.delete('/:id', deleteProduct);
router.get('/category/:categoryId', getProductsByCategory);

module.exports = router;