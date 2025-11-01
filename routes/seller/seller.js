const express = require('express');
const router = express.Router();
const {
  registerSeller,
  loginSeller
} = require('../../controllers/seller/seller');
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
const sellerAuth = require('../../middlewares/sellerAuth');

const upload = require('../../middlewares/upload'); 
// Seller Auth
router.post('/register', registerSeller);
router.post('/login', loginSeller);

// Seller Orders
router.get('/orders', sellerAuth, getSellerOrders);
router.get('/orders/:orderId', sellerAuth, getOrderDetails);
router.put('/orders/:orderId/status', sellerAuth, updateOrderStatus);

// Dashboard
router.get('/dashboard', sellerAuth, getSellerDashboard);

// Products
router.post('/products', sellerAuth, upload.array('images', 5), addProduct); 
router.get('/products', sellerAuth, getSellerProducts);
router.put('/products/:productId', sellerAuth, upload.array('images', 5), updateProduct);
router.patch('/products/:productId/toggle-status', sellerAuth, toggleProductStatus);

module.exports = router;