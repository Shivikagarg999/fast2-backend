const express = require('express');
const router = express.Router();
const { 
  updateSellerApproval, 
  getAllSellers, 
  getSellerById, 
  updateSellerDetails, 
  toggleSellerStatus, 
  getSellerStats 
} = require('../../../controllers/admin/seller/seller');

router.get('/sellers', getAllSellers);

router.get('/sellers/stats', getSellerStats);

router.get('/seller/:sellerId', getSellerById);

router.patch('/seller/:sellerId/approval', updateSellerApproval);

router.patch('/seller/:sellerId/status', toggleSellerStatus);

router.put('/seller/:sellerId', updateSellerDetails);

module.exports = router;