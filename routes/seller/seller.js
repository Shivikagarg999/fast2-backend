const express = require('express');
const router = express.Router();
const { registerSeller, loginSeller } = require('../../controllers/seller/seller');
const { 
  getSellerOrders, 
  getOrderDetails, 
  updateOrderStatus, 
  getSellerDashboard 
} = require('../../controllers/seller/order');
const { 
  addProduct, 
  getSellerProducts, 
  updateProduct,
  toggleProductStatus 
} = require('../../controllers/seller/product');
const sellerAuth= require('../../middlewares/sellerAuth');

router.post('/register', registerSeller);
router.post('/login', loginSeller);
router.get('/orders', sellerAuth, getSellerOrders);
router.get('/orders/:orderId',sellerAuth, getOrderDetails);
router.put('/orders/:orderId/status',sellerAuth, updateOrderStatus);
router.get('/dashboard',sellerAuth, getSellerDashboard);
router.post('/products',sellerAuth, addProduct);
router.get('/products',sellerAuth, getSellerProducts);
router.put('/products/:productId',sellerAuth, updateProduct);
router.patch('/products/:productId/toggle-status',sellerAuth, toggleProductStatus);

module.exports = router;