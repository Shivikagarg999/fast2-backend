const express = require('express');
const router = express.Router();
const { adminAuth } = require('../../../middlewares/adminAuth');
const {
  generatePost,
  getTrendingCategories,
  getUpcomingOccasions,
  generateLifestylePost
} = require('../../../controllers/marketing/marketingController');

router.post('/generate-post', adminAuth, generatePost);
router.get('/trending-categories', adminAuth, getTrendingCategories);
router.get('/upcoming-occasions', adminAuth, getUpcomingOccasions);
router.post('/generate-lifestyle-post', adminAuth, generateLifestylePost);

module.exports = router;
