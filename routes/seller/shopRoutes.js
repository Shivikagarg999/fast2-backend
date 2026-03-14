const express = require('express');
const router = express.Router();
const sellerAuth = require('../../middlewares/sellerAuth');
const upload = require('../../middlewares/upload');

const {
    getMyShop,
    getShopProducts,
    updateMyShop,
    getShopAnalytics,
    getMyShopReviews,
    respondToReview,
    getShopOrders,
    toggleShopStatus,
} = require('../../controllers/seller/shop');

router.get('/', sellerAuth, getMyShop);

router.get('/products', sellerAuth, getShopProducts);

router.put(
    '/',
    sellerAuth,
    upload.fields([
        { name: 'logo', maxCount: 1 },
        { name: 'coverImage', maxCount: 1 },
        { name: 'video', maxCount: 1 },
    ]),
    updateMyShop
);

router.get('/analytics', sellerAuth, getShopAnalytics);

router.get('/orders', sellerAuth, getShopOrders);

router.get('/reviews', sellerAuth, getMyShopReviews);

router.post('/reviews/:reviewId/respond', sellerAuth, respondToReview);

router.patch('/toggle-status', sellerAuth, toggleShopStatus);

module.exports = router;
