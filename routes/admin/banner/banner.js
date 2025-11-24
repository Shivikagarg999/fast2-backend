const express = require('express');
const router = express.Router();
const upload = require('../../../middlewares/upload');
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
router.post('/create', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'fallbackImage', maxCount: 1 }
]), createBanner);
router.put('/update/:id', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'fallbackImage', maxCount: 1 }
]), updateBanner);
router.delete('delete/:id', deleteBanner);
router.put('/update-order/update-order', updateBannerOrder);

module.exports = router;