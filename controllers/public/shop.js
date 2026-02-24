const Shop = require('../../models/shop');
const Product = require('../../models/product');
const ShopReview = require('../../models/shopReview');
const Order = require('../../models/order');
const mongoose = require('mongoose');

// ─── GET: Browse all public shops ──────────────────────────────────────────────
exports.getAllShops = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            city,
            category,
            minRating,
            sortBy = 'rating', // 'rating' | 'orders' | 'newest'
            verified,
            pincode,
        } = req.query;

        const filter = { isActive: true };

        if (search) {
            filter.$or = [
                { shopName: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { tagline: { $regex: search, $options: 'i' } },
            ];
        }

        if (city) {
            filter['address.city'] = { $regex: city, $options: 'i' };
        }

        if (pincode) {
            filter['address.pincode'] = pincode;
        }

        if (category) {
            filter.categories = new mongoose.Types.ObjectId(category);
        }

        if (minRating) {
            filter['rating.average'] = { $gte: parseFloat(minRating) };
        }

        if (verified === 'true') {
            filter.isVerified = true;
        }

        const sortMap = {
            rating: { 'rating.average': -1 },
            orders: { 'analytics.totalOrders': -1 },
            newest: { createdAt: -1 },
            followers: { followersCount: -1 },
        };
        const sort = sortMap[sortBy] || sortMap.rating;

        const total = await Shop.countDocuments(filter);
        const shops = await Shop.find(filter)
            .select(
                'shopName shopSlug description tagline logo coverImage address rating analytics badges isOpen isVerified followersCount categories seller'
            )
            .populate('seller', 'name businessName')
            .populate('categories', 'name')
            .sort(sort)
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit))
            .lean();

        res.status(200).json({
            success: true,
            data: shops,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit)),
                totalShops: total,
                hasNext: parseInt(page) * parseInt(limit) < total,
                hasPrev: parseInt(page) > 1,
            },
        });
    } catch (error) {
        console.error('getAllShops error:', error);
        res.status(500).json({ success: false, message: 'Error fetching shops', error: error.message });
    }
};

// ─── GET: Single shop by slug (public shop page) ────────────────────────────────
exports.getShopBySlug = async (req, res) => {
    try {
        const { slug } = req.params;

        const shop = await Shop.findOne({ shopSlug: slug, isActive: true })
            .populate('seller', 'name businessName isActive')
            .populate('categories', 'name')
            .select('-products -followers'); // products fetched separately for pagination

        if (!shop) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }

        // Is this user following the shop? (if user is authenticated)
        let isFollowing = false;
        if (req.user) {
            isFollowing = shop.followers && shop.followers.includes(req.user._id);
        }

        res.status(200).json({
            success: true,
            data: { ...shop.toObject(), isFollowing },
        });
    } catch (error) {
        console.error('getShopBySlug error:', error);
        res.status(500).json({ success: false, message: 'Error fetching shop', error: error.message });
    }
};

// ─── GET: Shop by ID ────────────────────────────────────────────────────────────
exports.getShopById = async (req, res) => {
    try {
        const { shopId } = req.params;

        const shop = await Shop.findOne({ _id: shopId, isActive: true })
            .populate('seller', 'name businessName')
            .populate('categories', 'name')
            .select('-products -followers');

        if (!shop) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }

        res.status(200).json({ success: true, data: shop });
    } catch (error) {
        console.error('getShopById error:', error);
        res.status(500).json({ success: false, message: 'Error fetching shop', error: error.message });
    }
};

// ─── GET: Products of a shop (public) ──────────────────────────────────────────
exports.getShopProducts = async (req, res) => {
    try {
        const { shopId } = req.params;
        const {
            page = 1,
            limit = 20,
            search = '',
            category,
            minPrice,
            maxPrice,
            stockStatus,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = req.query;

        const shop = await Shop.findOne({ _id: shopId, isActive: true }).select('products isOpen');
        if (!shop) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }

        const filter = {
            _id: { $in: shop.products },
            isActive: true,
        };

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { brand: { $regex: search, $options: 'i' } },
            ];
        }

        if (category) filter.category = new mongoose.Types.ObjectId(category);
        if (stockStatus) filter.stockStatus = stockStatus;
        if (minPrice || maxPrice) {
            filter.price = {};
            if (minPrice) filter.price.$gte = parseFloat(minPrice);
            if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
        }

        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const total = await Product.countDocuments(filter);
        const products = await Product.find(filter)
            .populate('category', 'name')
            .sort(sort)
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit))
            .lean();

        res.status(200).json({
            success: true,
            isShopOpen: shop.isOpen,
            data: products,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit)),
                totalProducts: total,
                hasNext: parseInt(page) * parseInt(limit) < total,
                hasPrev: parseInt(page) > 1,
            },
        });
    } catch (error) {
        console.error('getShopProducts error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching shop products',
            error: error.message,
        });
    }
};

// ─── GET: Shop products by SLUG ─────────────────────────────────────────────────
exports.getShopProductsBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        const {
            page = 1,
            limit = 20,
            search = '',
            category,
            minPrice,
            maxPrice,
            stockStatus,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = req.query;

        const shop = await Shop.findOne({ shopSlug: slug, isActive: true }).select('products isOpen _id');
        if (!shop) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }

        // Reuse the same logic
        req.params.shopId = shop._id;
        return exports.getShopProducts(req, res);
    } catch (error) {
        console.error('getShopProductsBySlug error:', error);
        res.status(500).json({ success: false, message: 'Error fetching shop products', error: error.message });
    }
};

// ─── GET: Shop reviews (public) ─────────────────────────────────────────────────
exports.getShopReviews = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { page = 1, limit = 10, rating } = req.query;

        const shop = await Shop.findOne({ _id: shopId, isActive: true }).select('rating _id');
        if (!shop) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }

        const filter = { shop: shop._id, isActive: true };
        if (rating) filter.rating = parseInt(rating);

        const total = await ShopReview.countDocuments(filter);
        const reviews = await ShopReview.find(filter)
            .populate('user', 'name profilePicture')
            .sort({ createdAt: -1 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit))
            .select('-helpfulVotedBy');

        res.status(200).json({
            success: true,
            data: reviews,
            rating: shop.rating,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit)),
                totalReviews: total,
                hasNext: parseInt(page) * parseInt(limit) < total,
                hasPrev: parseInt(page) > 1,
            },
        });
    } catch (error) {
        console.error('getShopReviews error:', error);
        res.status(500).json({ success: false, message: 'Error fetching reviews', error: error.message });
    }
};

// ─── POST: Submit a review for a shop (user must be authenticated) ──────────────
exports.submitShopReview = async (req, res) => {
    try {
        const { shopId } = req.params;
        const userId = req.user._id || req.user.id;
        const { rating, title, comment, orderId } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
        }

        const shop = await Shop.findOne({ _id: shopId, isActive: true });
        if (!shop) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }

        // Check if user already reviewed this shop
        const existingReview = await ShopReview.findOne({ shop: shopId, user: userId });
        if (existingReview) {
            return res.status(409).json({
                success: false,
                message: 'You have already reviewed this shop. You can edit your existing review.',
            });
        }

        // Verify purchase (optional but preferred)
        let isVerifiedPurchase = false;
        let orderRef = null;
        if (orderId) {
            const order = await Order.findOne({
                _id: orderId,
                user: userId,
                seller: shop.seller,
                status: 'delivered',
            });
            if (order) {
                isVerifiedPurchase = true;
                orderRef = order._id;
            }
        } else {
            // Check if user has any delivered order from this seller
            const anyOrder = await Order.findOne({
                user: userId,
                seller: shop.seller,
                status: 'delivered',
            });
            if (anyOrder) {
                isVerifiedPurchase = true;
                orderRef = anyOrder._id;
            }
        }

        const review = new ShopReview({
            shop: shopId,
            user: userId,
            order: orderRef,
            rating: parseInt(rating),
            title: title?.trim(),
            comment: comment?.trim(),
            isVerifiedPurchase,
        });

        await review.save();

        // Recalculate shop rating
        await shop.recalculateRating();

        const populatedReview = await ShopReview.findById(review._id).populate('user', 'name profilePicture');

        res.status(201).json({
            success: true,
            message: 'Review submitted successfully',
            data: populatedReview,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'You have already reviewed this shop',
            });
        }
        console.error('submitShopReview error:', error);
        res.status(500).json({ success: false, message: 'Error submitting review', error: error.message });
    }
};

// ─── PUT: Edit own review ───────────────────────────────────────────────────────
exports.editShopReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const userId = req.user._id || req.user.id;
        const { rating, title, comment } = req.body;

        const review = await ShopReview.findOne({ _id: reviewId, user: userId });
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        if (rating !== undefined) {
            if (rating < 1 || rating > 5) {
                return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
            }
            review.rating = parseInt(rating);
        }
        if (title !== undefined) review.title = title.trim();
        if (comment !== undefined) review.comment = comment.trim();

        await review.save();

        // Recalculate shop rating
        const shop = await Shop.findById(review.shop);
        if (shop) await shop.recalculateRating();

        res.status(200).json({ success: true, message: 'Review updated', data: review });
    } catch (error) {
        console.error('editShopReview error:', error);
        res.status(500).json({ success: false, message: 'Error updating review', error: error.message });
    }
};

// ─── DELETE: Remove own review ──────────────────────────────────────────────────
exports.deleteShopReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const userId = req.user._id || req.user.id;

        const review = await ShopReview.findOne({ _id: reviewId, user: userId });
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        const shopId = review.shop;
        review.isActive = false;
        await review.save();

        const shop = await Shop.findById(shopId);
        if (shop) await shop.recalculateRating();

        res.status(200).json({ success: true, message: 'Review deleted successfully' });
    } catch (error) {
        console.error('deleteShopReview error:', error);
        res.status(500).json({ success: false, message: 'Error deleting review', error: error.message });
    }
};

// ─── POST: Mark review as helpful ──────────────────────────────────────────────
exports.markReviewHelpful = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const userId = req.user._id || req.user.id;

        const review = await ShopReview.findById(reviewId);
        if (!review || !review.isActive) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        const alreadyVoted = review.helpfulVotedBy.includes(userId);
        if (alreadyVoted) {
            review.helpfulVotedBy.pull(userId);
            review.helpfulVotes = Math.max(0, review.helpfulVotes - 1);
        } else {
            review.helpfulVotedBy.push(userId);
            review.helpfulVotes += 1;
        }

        await review.save();

        res.status(200).json({
            success: true,
            message: alreadyVoted ? 'Removed helpful vote' : 'Marked as helpful',
            helpfulVotes: review.helpfulVotes,
            voted: !alreadyVoted,
        });
    } catch (error) {
        console.error('markReviewHelpful error:', error);
        res.status(500).json({ success: false, message: 'Error updating vote', error: error.message });
    }
};

// ─── POST: Follow / Unfollow a shop ────────────────────────────────────────────
exports.toggleFollowShop = async (req, res) => {
    try {
        const { shopId } = req.params;
        const userId = req.user._id || req.user.id;

        const shop = await Shop.findOne({ _id: shopId, isActive: true });
        if (!shop) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }

        const isFollowing = shop.followers.includes(userId);

        if (isFollowing) {
            shop.followers.pull(userId);
            shop.followersCount = Math.max(0, shop.followersCount - 1);
        } else {
            shop.followers.push(userId);
            shop.followersCount += 1;
        }

        await shop.save();

        res.status(200).json({
            success: true,
            message: isFollowing ? 'Unfollowed shop' : 'Following shop',
            isFollowing: !isFollowing,
            followersCount: shop.followersCount,
        });
    } catch (error) {
        console.error('toggleFollowShop error:', error);
        res.status(500).json({ success: false, message: 'Error updating follow status', error: error.message });
    }
};
