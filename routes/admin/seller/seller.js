const express = require('express');
const router = express.Router();
const {
  createSeller,
  updateSellerApproval,
  getAllSellers,
  getSellerById,
  updateSellerDetails,
  toggleSellerStatus,
  getSellerStats,
  getSellerPassword,
  resetSellerPassword,
  deleteSeller,
} = require('../../../controllers/admin/seller/seller');

router.post('/sellers/create', createSeller);

router.get('/sellers', getAllSellers);

router.get('/sellers/stats', getSellerStats);

router.get('/seller/:sellerId', getSellerById);

router.patch('/seller/:sellerId/approval', updateSellerApproval);

router.patch('/seller/:sellerId/status', toggleSellerStatus);

router.put('/seller/:sellerId', updateSellerDetails);

router.delete('/seller/:sellerId', deleteSeller);

// Password management
router.get('/seller/:sellerId/password', getSellerPassword);
router.patch('/seller/:sellerId/password', resetSellerPassword);

module.exports = router;