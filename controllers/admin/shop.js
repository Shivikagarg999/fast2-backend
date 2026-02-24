const Shop = require('../../models/shop');
const Product = require('../../models/product');
const mongoose = require('mongoose');

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
