const express = require('express');
const router = express.Router();
const { adminAuth } = require('../../../middlewares/adminAuth');
const {
  generatePost,
  getTrendingCategories,
  getUpcomingOccasions,
  generateLifestylePost,
  getCategoryProducts,
  publishPost,
  autoDailyPost,
  getAutoPostConfig,
  updateAutoPostConfig,
  triggerAutoPostNow,
  getAutoPostLogs
} = require('../../../controllers/marketing/marketingController');

router.post('/generate-post', adminAuth, generatePost);
router.get('/trending-categories', adminAuth, getTrendingCategories);
router.get('/upcoming-occasions', adminAuth, getUpcomingOccasions);
router.post('/generate-lifestyle-post', adminAuth, generateLifestylePost);
router.get('/category-products/:categoryId', adminAuth, getCategoryProducts);
router.post('/publish', adminAuth, publishPost);
router.post('/auto-daily-post', adminAuth, autoDailyPost);

// Auto-Post Settings & Scheduler
router.get('/auto-post-config', adminAuth, getAutoPostConfig);
router.put('/auto-post-config', adminAuth, updateAutoPostConfig);
router.post('/auto-post-trigger', adminAuth, triggerAutoPostNow);
router.get('/auto-post-logs', adminAuth, getAutoPostLogs);

module.exports = router;
