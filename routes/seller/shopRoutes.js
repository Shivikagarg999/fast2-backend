const express = require('express');
const router = express.Router();
const sellerAuth = require('../../middlewares/sellerAuth');
const upload = require('../../middlewares/upload');

const {
    getMyShop,
    updateMyShop,
    getShopAnalytics,
    getMyShopReviews,
    respondToReview,
    getShopOrders,
    toggleShopStatus,
} = require('../../controllers/seller/shop');

// ─── All routes require seller authentication ─────────────────────────────────

// Get my shop profile
router.get('/', sellerAuth, getMyShop);

// Update my shop profile (logo + coverImage via multipart)
router.put(
    '/',
    sellerAuth,
    upload.fields([
        { name: 'logo', maxCount: 1 },
        { name: 'coverImage', maxCount: 1 },
    ]),
    updateMyShop
);

// Shop analytics / dashboard
router.get('/analytics', sellerAuth, getShopAnalytics);

// Shop orders (with filters & pagination)
router.get('/orders', sellerAuth, getShopOrders);

// Shop reviews (seller view)
router.get('/reviews', sellerAuth, getMyShopReviews);

// Respond to a review
router.post('/reviews/:reviewId/respond', sellerAuth, respondToReview);

// Toggle shop open/closed (vacation mode)
router.patch('/toggle-status', sellerAuth, toggleShopStatus);

module.exports = router;
