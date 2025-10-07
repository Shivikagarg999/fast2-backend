const express = require('express');
const router = express.Router();
const {
  getBanners,
  getBanner,
  createBanner,
  updateBanner,
  deleteBanner,
  updateBannerOrder
} = require('../../../controllers/admin/banner/bannerController');

// Public routes
router.get('/getall', getBanners);
router.get('/get/:id', getBanner);

// auth middleware to be added
router.post('/create', createBanner);
router.put('/update/:id', updateBanner);
router.delete('delete/:id', deleteBanner);
router.put('/update-order/update-order', updateBannerOrder);

module.exports = router;