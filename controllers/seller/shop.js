const Shop = require('../../models/shop');
const Seller = require('../../models/seller');
const Product = require('../../models/product');
const Order = require('../../models/order');
const ShopReview = require('../../models/shopReview');
const mongoose = require('mongoose');
const imagekit = require('../../utils/imagekit');

exports.getMyShop = async (req, res) => {
    try {
        const sellerId = req.seller._id || req.seller.id;

        const shop = await Shop.findOne({ seller: sellerId })
            .populate('seller', 'name email phone businessName gstNumber approvalStatus isActive')
            .populate('categories', 'name')
            .lean();

        if (!shop) {
            return res.status(404).json({
                success: false,
                message: 'Shop not found. Please contact support.',
            });
        }

        // Get detailed product information with sales data
        const productIds = shop.products || [];
        const products = await Product.find({ _id: { $in: productIds } })
            .populate('category', 'name')
            .select('name price images stockStatus isActive category quantity oldPrice discountPercentage createdAt views')
            .lean();

        // Get sales data for each product
        const salesData = await Order.aggregate([
            { $unwind: '$items' },
            {
                $match: {
                    'items.product': { $in: productIds.map(id => new mongoose.Types.ObjectId(id)) },
                    status: { $in: ['confirmed', 'picked-up', 'delivered'] }
                }
            },
            {
                $group: {
                    _id: '$items.product',
                    totalSales: { $sum: '$items.quantity' },
                    totalEarnings: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                    orderCount: { $sum: 1 },
                    averageRating: { $avg: '$items.rating' }
                }
            }
        ]);

        // Create a map of product sales data
        const salesMap = {};
        salesData.forEach(item => {
            salesMap[item._id.toString()] = {
                totalSales: item.totalSales,
                totalEarnings: item.totalEarnings,
                orderCount: item.orderCount,
                averageRating: item.averageRating || 0
            };
        });

        // Combine product data with sales data
        const productsWithDetails = products.map(product => ({
            ...product,
            sales: salesMap[product._id.toString()]?.totalSales || 0,
            earnings: salesMap[product._id.toString()]?.totalEarnings || 0,
            orderCount: salesMap[product._id.toString()]?.orderCount || 0,
            averageRating: salesMap[product._id.toString()]?.averageRating || 0,
            inStock: product.stockStatus === 'in-stock' && product.quantity > 0
        }));

        // Calculate shop statistics
        const totalProducts = products.length;
        const activeProducts = products.filter(p => p.isActive).length;
        const inStockProducts = products.filter(p => p.inStock).length;
        const totalSales = products.reduce((sum, p) => sum + p.sales, 0);
        const totalEarnings = products.reduce((sum, p) => sum + p.earnings, 0);
        const averageProductRating = products.length > 0
            ? products.reduce((sum, p) => sum + (p.averageRating || 0), 0) / products.length
            : 0;

        // Get recent orders for the shop
        const recentOrders = await Order.find({ seller: sellerId })
            .populate('items.product', 'name images')
            .populate('user', 'name')
            .sort({ createdAt: -1 })
            .limit(5)
            .select('orderId status finalAmount createdAt items user')
            .lean();

        // Enhanced shop data
        const enhancedShop = {
            ...shop,
            products: productsWithDetails,
            statistics: {
                totalProducts,
                activeProducts,
                inStockProducts,
                outOfStockProducts: totalProducts - inStockProducts,
                totalSales,
                totalEarnings,
                averageProductRating: Math.round(averageProductRating * 10) / 10,
                totalReviews: shop.rating.totalReviews,
                shopRating: shop.rating.average,
                followersCount: shop.followersCount || 0
            },
            recentOrders: recentOrders.map(order => ({
                orderId: order.orderId,
                status: order.status,
                amount: order.finalAmount,
                date: order.createdAt,
                customerName: order.user?.name || 'Customer',
                itemCount: order.items?.length || 0
            }))
        };

        res.status(200).json({
            success: true,
            data: enhancedShop
        });
    } catch (error) {
        console.error('getMyShop error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching shop',
            error: error.message
        });
    }
};

// ─── GET: Shop products with pagination and filters ───────────────────────────────
exports.getShopProducts = async (req, res) => {
    try {
        const sellerId = req.seller._id || req.seller.id;
        const {
            page = 1,
            limit = 12,
            search = '',
            category,
            stockStatus,
            isActive,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Get shop to verify seller
        const shop = await Shop.findOne({ seller: sellerId }).select('products');
        if (!shop) {
            return res.status(404).json({
                success: false,
                message: 'Shop not found'
            });
        }

        const productIds = shop.products || [];
        const filter = { _id: { $in: productIds } };

        // Apply filters
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { brand: { $regex: search, $options: 'i' } }
            ];
        }
        if (category) {
            filter.category = category;
        }
        if (stockStatus) {
            filter.stockStatus = stockStatus;
        }
        if (isActive !== undefined) {
            filter.isActive = isActive === 'true';
        }

        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const products = await Product.find(filter)
            .populate('category', 'name')
            .sort(sort)
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .lean();

        // Get sales data for products
        const salesData = await Order.aggregate([
            { $unwind: '$items' },
            {
                $match: {
                    'items.product': { $in: productIds.map(id => new mongoose.Types.ObjectId(id)) },
                    status: { $in: ['confirmed', 'picked-up', 'delivered'] }
                }
            },
            {
                $group: {
                    _id: '$items.product',
                    totalSales: { $sum: '$items.quantity' },
                    totalEarnings: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                    orderCount: { $sum: 1 }
                }
            }
        ]);

        const salesMap = {};
        salesData.forEach(item => {
            salesMap[item._id.toString()] = {
                totalSales: item.totalSales,
                totalEarnings: item.totalEarnings,
                orderCount: item.orderCount
            };
        });

        // Add sales data to products
        const productsWithSales = products.map(product => ({
            ...product,
            sales: salesMap[product._id.toString()]?.totalSales || 0,
            earnings: salesMap[product._id.toString()]?.totalEarnings || 0,
            orderCount: salesMap[product._id.toString()]?.orderCount || 0,
            inStock: product.stockStatus === 'in-stock' && product.quantity > 0
        }));

        const total = await Product.countDocuments(filter);

        res.status(200).json({
            success: true,
            data: productsWithSales,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalProducts: total,
                hasNext: page * limit < total,
                hasPrev: page > 1,
                limit: parseInt(limit)
            },
            filters: {
                search,
                category,
                stockStatus,
                isActive,
                sortBy,
                sortOrder
            }
        });
    } catch (error) {
        console.error('getShopProducts error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching shop products',
            error: error.message
        });
    }
};

// ─── PUT: Update shop profile ───────────────────────────────────────────────────
exports.updateMyShop = async (req, res) => {
    try {
        const sellerId = req.seller._id || req.seller.id;

        const shop = await Shop.findOne({ seller: sellerId });
        if (!shop) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }

        const allowedFields = [
            'shopName',
            'description',
            'tagline',
            'contactEmail',
            'contactPhone',
            'address',
            'returnPolicy',
            'shippingPolicy',
            'socialLinks',
            'isOpen',
            'shopType',
            'timings',
        ];

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                if (typeof req.body[field] === 'string') {
                    try {
                        const parsed = JSON.parse(req.body[field]);
                        shop[field] = parsed;
                    } catch {
                        shop[field] = req.body[field];
                    }
                } else {
                    shop[field] = req.body[field];
                }
            }
        }

        // Handle logo upload
        if (req.files && req.files.logo && req.files.logo[0]) {
            const logoFile = req.files.logo[0];
            try {
                const uploadedLogo = await imagekit.upload({
                    file: logoFile.buffer.toString('base64'),
                    fileName: `shop_logo_${sellerId}_${Date.now()}.jpg`,
                    folder: '/shops/logos',
                    useUniqueFileName: true,
                });
                shop.logo = { url: uploadedLogo.url, fileId: uploadedLogo.fileId };
            } catch (err) {
                console.error('Logo upload error:', err);
            }
        }

        // Handle cover image upload
        if (req.files && req.files.coverImage && req.files.coverImage[0]) {
            const coverFile = req.files.coverImage[0];
            try {
                const uploadedCover = await imagekit.upload({
                    file: coverFile.buffer.toString('base64'),
                    fileName: `shop_cover_${sellerId}_${Date.now()}.jpg`,
                    folder: '/shops/covers',
                    useUniqueFileName: true,
                });
                shop.coverImage = { url: uploadedCover.url, fileId: uploadedCover.fileId };
            } catch (err) {
                console.error('Cover image upload error:', err);
            }
        }

        // Handle video upload
        if (req.files && req.files.video && req.files.video[0]) {
            const videoFile = req.files.video[0];
            try {
                const uploadedVideo = await imagekit.upload({
                    file: videoFile.buffer.toString('base64'),
                    fileName: `shop_video_${sellerId}_${Date.now()}.mp4`,
                    folder: '/shops/videos',
                    useUniqueFileName: true,
                    resourceType: 'video', // Added resourceType for video
                });
                shop.video = { url: uploadedVideo.url, fileId: uploadedVideo.fileId };
            } catch (err) {
                console.error('Video upload error:', err);
            }
        }

        await shop.save();

        res.status(200).json({
            success: true,
            message: 'Shop updated successfully',
            data: shop,
        });
    } catch (error) {
        console.error('updateMyShop error:', error);
        res.status(500).json({ success: false, message: 'Error updating shop', error: error.message });
    }
};

// ─── GET: Shop analytics / dashboard ───────────────────────────────────────────
exports.getShopAnalytics = async (req, res) => {
    try {
        const sellerId = req.seller._id || req.seller.id;

        const shop = await Shop.findOne({ seller: sellerId }).select('products analytics rating');
        if (!shop) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }

        const productIds = shop.products || [];

        // Orders breakdown by status
        const orderStats = await Order.aggregate([
            { $match: { seller: shop.seller } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    revenue: { $sum: '$finalAmount' },
                },
            },
        ]);

        // Revenue over past 30 days (daily)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const dailyRevenue = await Order.aggregate([
            {
                $match: {
                    seller: shop.seller,
                    createdAt: { $gte: thirtyDaysAgo },
                    status: { $in: ['confirmed', 'picked-up', 'delivered'] },
                },
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                        day: { $dayOfMonth: '$createdAt' },
                    },
                    revenue: { $sum: '$finalAmount' },
                    orders: { $sum: 1 },
                },
            },
            { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
        ]);

        // Top selling products
        const topProducts = await Order.aggregate([
            { $match: { seller: shop.seller, status: { $in: ['confirmed', 'picked-up', 'delivered'] } } },
            { $unwind: '$items' },
            { $match: { 'items.product': { $in: productIds } } },
            {
                $group: {
                    _id: '$items.product',
                    totalSold: { $sum: '$items.quantity' },
                    totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                },
            },
            { $sort: { totalSold: -1 } },
            { $limit: 5 },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'product',
                },
            },
            { $unwind: '$product' },
            {
                $project: {
                    totalSold: 1,
                    totalRevenue: 1,
                    'product.name': 1,
                    'product.price': 1,
                    'product.images': { $slice: ['$product.images', 1] },
                },
            },
        ]);

        // Payment method breakdown
        const paymentBreakdown = await Order.aggregate([
            { $match: { seller: shop.seller } },
            {
                $group: {
                    _id: '$paymentMethod',
                    count: { $sum: 1 },
                    amount: { $sum: '$finalAmount' },
                },
            },
        ]);

        const statusMap = {
            pending: 0, confirmed: 0, 'picked-up': 0, delivered: 0, cancelled: 0,
        };
        let totalRevenue = 0;
        let totalOrders = 0;
        orderStats.forEach((s) => {
            statusMap[s._id] = s.count;
            totalOrders += s.count;
            if (['confirmed', 'picked-up', 'delivered'].includes(s._id)) {
                totalRevenue += s.revenue;
            }
        });

        // Update analytics in shop document (non-blocking)
        Shop.findByIdAndUpdate(shop._id, {
            'analytics.totalOrders': totalOrders,
            'analytics.totalRevenue': totalRevenue,
            'analytics.totalProductsListed': productIds.length,
        }).exec();

        res.status(200).json({
            success: true,
            data: {
                overview: {
                    totalOrders,
                    totalRevenue,
                    totalProductsListed: productIds.length,
                    averageRating: shop.rating.average,
                    totalReviews: shop.rating.totalReviews,
                },
                ordersByStatus: statusMap,
                dailyRevenue,
                topProducts,
                paymentBreakdown,
            },
        });
    } catch (error) {
        console.error('getShopAnalytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching analytics',
            error: error.message,
        });
    }
};

// ─── GET: Reviews for seller's own shop ────────────────────────────────────────
exports.getMyShopReviews = async (req, res) => {
    try {
        const sellerId = req.seller._id || req.seller.id;
        const { page = 1, limit = 10, rating } = req.query;

        const shop = await Shop.findOne({ seller: sellerId }).select('_id rating');
        if (!shop) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }

        const filter = { shop: shop._id, isActive: true };
        if (rating) filter.rating = parseInt(rating);

        const total = await ShopReview.countDocuments(filter);
        const reviews = await ShopReview.find(filter)
            .populate('user', 'name profilePicture')
            .populate('order', 'orderId createdAt')
            .sort({ createdAt: -1 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit));

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
        console.error('getMyShopReviews error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching reviews',
            error: error.message,
        });
    }
};

// ─── POST: Respond to a review ──────────────────────────────────────────────────
exports.respondToReview = async (req, res) => {
    try {
        const sellerId = req.seller._id || req.seller.id;
        const { reviewId } = req.params;
        const { message } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ success: false, message: 'Response message is required' });
        }

        const shop = await Shop.findOne({ seller: sellerId }).select('_id');
        if (!shop) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }

        const review = await ShopReview.findOne({ _id: reviewId, shop: shop._id });
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        review.sellerResponse = {
            message: message.trim(),
            respondedAt: new Date(),
        };

        await review.save();

        res.status(200).json({
            success: true,
            message: 'Response added successfully',
            data: review,
        });
    } catch (error) {
        console.error('respondToReview error:', error);
        res.status(500).json({
            success: false,
            message: 'Error responding to review',
            error: error.message,
        });
    }
};

// ─── GET: Seller's shop orders (richer version with shop context) ───────────────
exports.getShopOrders = async (req, res) => {
    try {
        const sellerId = req.seller._id || req.seller.id;
        const {
            page = 1,
            limit = 10,
            status,
            paymentStatus,
            startDate,
            endDate,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = req.query;

        const filter = { seller: sellerId };
        if (status) filter.status = status;
        if (paymentStatus) filter.paymentStatus = paymentStatus;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }
        if (search) {
            filter.$or = [
                { orderId: { $regex: search, $options: 'i' } },
                { 'shippingAddress.phone': { $regex: search, $options: 'i' } },
            ];
        }

        const total = await Order.countDocuments(filter);
        const orders = await Order.find(filter)
            .populate('items.product', 'name images price')
            .populate('user', 'name email phone')
            .populate('driver', 'name phone')
            .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit))
            .lean();

        res.status(200).json({
            success: true,
            data: orders,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit)),
                totalOrders: total,
                hasNext: parseInt(page) * parseInt(limit) < total,
                hasPrev: parseInt(page) > 1,
                limit: parseInt(limit),
            },
        });
    } catch (error) {
        console.error('getShopOrders error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching shop orders',
            error: error.message,
        });
    }
};

// ─── PATCH: Toggle shop open/close (vacation mode) ─────────────────────────────
exports.toggleShopStatus = async (req, res) => {
    try {
        const sellerId = req.seller._id || req.seller.id;

        const shop = await Shop.findOne({ seller: sellerId });
        if (!shop) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }

        shop.isOpen = !shop.isOpen;
        await shop.save();

        res.status(200).json({
            success: true,
            message: `Shop is now ${shop.isOpen ? 'open' : 'closed'}`,
            isOpen: shop.isOpen,
        });
    } catch (error) {
        console.error('toggleShopStatus error:', error);
        res.status(500).json({
            success: false,
            message: 'Error toggling shop status',
            error: error.message,
        });
    }
};
