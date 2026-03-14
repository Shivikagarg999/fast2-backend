const Shop = require('../../models/shop');
const Product = require('../../models/product');
const mongoose = require('mongoose');
const imagekit = require('../../utils/imagekit');

// ─── POST: Create a new shop ──────────────────────────────────────────────────
exports.createShop = async (req, res) => {
    try {
        const {
            seller,
            shopName,
            description,
            tagline,
            contactEmail,
            contactPhone,
            address,
            categories,
            isOpen,
            isActive,
            isVerified,
            socialLinks,
            shopType
        } = req.body;

        if (!seller || !shopName) {
            return res.status(400).json({ success: false, message: 'Seller ID and Shop Name are required' });
        }

        // Check if seller already has a shop
        const existingShop = await Shop.findOne({ seller });
        if (existingShop) {
            return res.status(400).json({ success: false, message: 'This seller already has a shop registered' });
        }

        const newShop = new Shop({
            seller,
            shopName,
            description,
            tagline,
            contactEmail,
            contactPhone,
            address,
            categories,
            isOpen,
            isActive,
            isVerified,
            socialLinks,
            shopType
        });

        await newShop.save();

        // Link shop to seller
        await Seller.findByIdAndUpdate(seller, { shop: newShop._id });

        res.status(201).json({
            success: true,
            message: 'Shop created successfully',
            data: newShop
        });
    } catch (error) {
        console.error('Admin createShop error:', error);
        res.status(500).json({ success: false, message: 'Error creating shop', error: error.message });
    }
};

// ─── GET: All shops for admin ──────────────────────────────────────────────────
exports.getAllShops = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            city,
            pincode,
            isVerified,
            isActive,
            isOpen,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = req.query;

        const filter = {};

        if (search) {
            filter.$or = [
                { shopName: { $regex: search, $options: 'i' } },
                { shopSlug: { $regex: search, $options: 'i' } },
            ];
        }

        if (city) filter['address.city'] = { $regex: city, $options: 'i' };
        if (pincode) filter['address.pincode'] = pincode;
        if (isVerified !== undefined) filter.isVerified = isVerified === 'true';
        if (isActive !== undefined) filter.isActive = isActive === 'true';
        if (isOpen !== undefined) filter.isOpen = isOpen === 'true';

        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const total = await Shop.countDocuments(filter);
        const shops = await Shop.find(filter)
            .populate('seller', 'name businessName email phone')
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
            },
        });
    } catch (error) {
        console.error('Admin getAllShops error:', error);
        res.status(500).json({ success: false, message: 'Error fetching shops', error: error.message });
    }
};

// ─── GET: Shop Details for admin ───────────────────────────────────────────────
exports.getShopDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const shop = await Shop.findById(id)
            .populate('seller', 'name businessName email phone address bankDetails approvalStatus')
            .populate('categories', 'name');

        if (!shop) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }

        res.status(200).json({ success: true, data: shop });
    } catch (error) {
        console.error('Admin getShopDetails error:', error);
        res.status(500).json({ success: false, message: 'Error fetching shop details', error: error.message });
    }
};

// ─── PUT: Update Shop Details ──────────────────────────────────────────────────
exports.updateShop = async (req, res) => {
    try {
        const { id } = req.params;
        
        const shop = await Shop.findById(id);
        if (!shop) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }

        const allowedFields = [
            'shopName', 'description', 'tagline', 'contactEmail', 'contactPhone',
            'address', 'socialLinks', 'isVerified', 'isActive', 'isOpen',
            'shopType', 'seller'
        ];

        console.log(`--- Admin Update Shop ${id} ---`);
        console.log('Incoming fields:', Object.keys(req.body));
        console.log('shopType in body:', req.body.shopType);
        console.log('seller in body:', req.body.seller);

        const oldSellerId = shop.seller?.toString();
        const newSellerId = req.body.seller;

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                console.log(`Updating field: ${field} with value:`, req.body[field]);
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

        // --- Seller Transfer Logic ---
        if (newSellerId && newSellerId !== oldSellerId) {
            console.log(`Transferring shop from ${oldSellerId} to ${newSellerId}`);
            
            // 1. Verify new seller exists
            const Seller = require('../../models/seller'); // Ensure Seller model is available
            const newSeller = await Seller.findById(newSellerId);
            if (!newSeller) {
                return res.status(404).json({ success: false, message: 'New seller not found' });
            }

            // 2. Link shop to new seller
            newSeller.shop = shop._id;
            await newSeller.save();

            // 3. Unlink shop from old seller (if exists)
            if (oldSellerId) {
                await Seller.findByIdAndUpdate(oldSellerId, { $unset: { shop: "" } });
            }
        }
        
        console.log('Shop object after update but before save:', {
            shopName: shop.shopName,
            shopType: shop.shopType,
            seller: shop.seller,
            isModifiedLabel: shop.isModified('shopType')
        });

        // Handle logo upload
        if (req.files && req.files.logo && req.files.logo[0]) {
            const logoFile = req.files.logo[0];
            try {
                const uploadedLogo = await imagekit.upload({
                    file: logoFile.buffer.toString('base64'),
                    fileName: `shop_logo_admin_${id}_${Date.now()}.jpg`,
                    folder: '/shops/logos',
                    useUniqueFileName: true,
                });
                shop.logo = { url: uploadedLogo.url, fileId: uploadedLogo.fileId };
            } catch (err) {
                console.error('Admin logo upload error:', err);
            }
        }

        // Handle cover image upload
        if (req.files && req.files.coverImage && req.files.coverImage[0]) {
            const coverFile = req.files.coverImage[0];
            try {
                const uploadedCover = await imagekit.upload({
                    file: coverFile.buffer.toString('base64'),
                    fileName: `shop_cover_admin_${id}_${Date.now()}.jpg`,
                    folder: '/shops/covers',
                    useUniqueFileName: true,
                });
                shop.coverImage = { url: uploadedCover.url, fileId: uploadedCover.fileId };
            } catch (err) {
                console.error('Admin cover image upload error:', err);
            }
        }

        // Handle video upload
        if (req.files && req.files.video && req.files.video[0]) {
            const videoFile = req.files.video[0];
            try {
                const uploadedVideo = await imagekit.upload({
                    file: videoFile.buffer.toString('base64'),
                    fileName: `shop_video_admin_${id}_${Date.now()}.mp4`,
                    folder: '/shops/videos',
                    useUniqueFileName: true,
                    resourceType: 'video',
                });
                shop.video = { url: uploadedVideo.url, fileId: uploadedVideo.fileId };
            } catch (err) {
                console.error('Admin video upload error:', err);
            }
        }

        await shop.save();

        res.status(200).json({
            success: true,
            message: 'Shop updated successfully',
            data: shop
        });
    } catch (error) {
        console.error('Admin updateShop error:', error);
        res.status(500).json({ success: false, message: 'Error updating shop', error: error.message });
    }
};

// ─── PATCH: Toggle Shop Verification ───────────────────────────────────────────
exports.toggleVerification = async (req, res) => {
    try {
        const { id } = req.params;
        const shop = await Shop.findById(id);

        if (!shop) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }

        shop.isVerified = !shop.isVerified;
        await shop.save();

        res.status(200).json({
            success: true,
            message: `Shop ${shop.isVerified ? 'verified' : 'unverified'} successfully`,
            isVerified: shop.isVerified,
        });
    } catch (error) {
        console.error('Admin toggleVerification error:', error);
        res.status(500).json({ success: false, message: 'Error updating verification status', error: error.message });
    }
};

// ─── PATCH: Toggle Shop Active Status ──────────────────────────────────────────
exports.toggleActiveStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const shop = await Shop.findById(id);

        if (!shop) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }

        shop.isActive = !shop.isActive;
        await shop.save();

        res.status(200).json({
            success: true,
            message: `Shop ${shop.isActive ? 'activated' : 'deactivated'} successfully`,
            isActive: shop.isActive,
        });
    } catch (error) {
        console.error('Admin toggleActiveStatus error:', error);
        res.status(500).json({ success: false, message: 'Error updating active status', error: error.message });
    }
};

// ─── POST: Manage Shop Badges ──────────────────────────────────────────────────
exports.manageBadges = async (req, res) => {
    try {
        const { id } = req.params;
        const { badgeType, action } = req.body; // action: 'add' | 'remove'

        const shop = await Shop.findById(id);
        if (!shop) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }

        if (action === 'add') {
            // Check if badge already exists
            const exists = shop.badges.some(b => b.type === badgeType);
            if (!exists) {
                shop.badges.push({ type: badgeType, awardedAt: new Date() });
            }
        } else if (action === 'remove') {
            shop.badges = shop.badges.filter(b => b.type !== badgeType);
        } else {
            return res.status(400).json({ success: false, message: 'Invalid action' });
        }

        await shop.save();
        res.status(200).json({ success: true, message: 'Badges updated successfully', badges: shop.badges });
    } catch (error) {
        console.error('Admin manageBadges error:', error);
        res.status(500).json({ success: false, message: 'Error managing badges', error: error.message });
    }
};

// ─── DELETE: Delete Shop (Hard Delete) ─────────────────────────────────────────
exports.deleteShop = async (req, res) => {
    try {
        const { id } = req.params;
        const shop = await Shop.findById(id);

        if (!shop) {
            return res.status(404).json({ success: false, message: 'Shop not found' });
        }

        // Optional: Also do something with products? Deactivate them?
        // For now just delete the shop record
        await Shop.findByIdAndDelete(id);

        res.status(200).json({ success: true, message: 'Shop deleted successfully' });
    } catch (error) {
        console.error('Admin deleteShop error:', error);
        res.status(500).json({ success: false, message: 'Error deleting shop', error: error.message });
    }
};
