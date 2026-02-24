const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/userauth');
const optionalAuth = require('../../middlewares/optionalAuth');

const {
    getAllShops,
    getShopBySlug,
    getShopById,
    getShopProducts,
    getShopProductsBySlug,
    getShopReviews,
    submitShopReview,
    editShopReview,
    deleteShopReview,
    markReviewHelpful,
    toggleFollowShop,
} = require('../../controllers/public/shop');

// ─── Public Routes (no auth needed, but optional auth enriches response) ─────

// Browse all shops
router.get('/', optionalAuth, getAllShops);

// Get shop by ID
router.get('/id/:shopId', optionalAuth, getShopById);

// Get shop by slug  e.g. /api/shops/my-shop-slug
router.get('/:slug', optionalAuth, getShopBySlug);

// Get all products of a shop (by ID)
router.get('/id/:shopId/products', optionalAuth, getShopProducts);

// Get all products of a shop (by slug)
router.get('/:slug/products', optionalAuth, getShopProductsBySlug);

// Get reviews of a shop (by ID)
router.get('/id/:shopId/reviews', optionalAuth, getShopReviews);

// ─── Auth Required Routes ─────────────────────────────────────────────────────

// Submit a review (user must be logged in)
router.post('/id/:shopId/reviews', authMiddleware, submitShopReview);

// Edit own review
router.put('/reviews/:reviewId', authMiddleware, editShopReview);

// Delete own review
router.delete('/reviews/:reviewId', authMiddleware, deleteShopReview);

// Mark a review as helpful (toggle)
router.post('/reviews/:reviewId/helpful', authMiddleware, markReviewHelpful);

// Follow / Unfollow a shop
router.post('/id/:shopId/follow', authMiddleware, toggleFollowShop);

module.exports = router;
