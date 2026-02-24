const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema(
    {
        // ─── Identity ─────────────────────────────────────────────────────────────
        seller: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Seller',
            required: true,
            unique: true, // One shop per seller
        },

        // ─── Display Info ─────────────────────────────────────────────────────────
        shopName: {
            type: String,
            required: true,
            trim: true,
        },
        shopSlug: {
            type: String,
            unique: true,
            lowercase: true,
            trim: true,
        },
        description: {
            type: String,
            default: '',
        },
        tagline: {
            type: String,
            default: '',
        },
        logo: {
            url: { type: String, default: '' },
            fileId: { type: String, default: '' },
        },
        coverImage: {
            url: { type: String, default: '' },
            fileId: { type: String, default: '' },
        },

        // ─── Contact & Location ───────────────────────────────────────────────────
        contactEmail: { type: String },
        contactPhone: { type: String },
        address: {
            street: String,
            city: String,
            state: String,
            pincode: String,
            country: { type: String, default: 'India' },
            coordinates: {
                lat: Number,
                lng: Number,
            },
        },

        // ─── Products ─────────────────────────────────────────────────────────────
        products: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Product',
            },
        ],

        // ─── Categories offered ───────────────────────────────────────────────────
        categories: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Category',
            },
        ],

        // ─── Policies ─────────────────────────────────────────────────────────────
        returnPolicy: {
            isReturnable: { type: Boolean, default: true },
            returnWindowDays: { type: Number, default: 7 },
            description: { type: String, default: '' },
        },
        shippingPolicy: {
            freeShippingAbove: { type: Number, default: 0 },
            estimatedDeliveryDays: { type: Number, default: 5 },
            description: { type: String, default: '' },
        },

        // ─── Ratings & Reviews ────────────────────────────────────────────────────
        rating: {
            average: { type: Number, default: 0, min: 0, max: 5 },
            totalReviews: { type: Number, default: 0 },
            breakdown: {
                five: { type: Number, default: 0 },
                four: { type: Number, default: 0 },
                three: { type: Number, default: 0 },
                two: { type: Number, default: 0 },
                one: { type: Number, default: 0 },
            },
        },

        // ─── Order Analytics ──────────────────────────────────────────────────────
        analytics: {
            totalOrders: { type: Number, default: 0 },
            totalRevenue: { type: Number, default: 0 },
            totalProductsSold: { type: Number, default: 0 },
            totalProductsListed: { type: Number, default: 0 },
            repeatCustomers: { type: Number, default: 0 },
        },

        // ─── Badges / Achievements ────────────────────────────────────────────────
        badges: [
            {
                type: {
                    type: String,
                    enum: ['top_seller', 'fast_shipper', 'trusted_seller', 'new_arrival'],
                },
                awardedAt: { type: Date, default: Date.now },
            },
        ],

        // ─── Settings ─────────────────────────────────────────────────────────────
        isOpen: { type: Boolean, default: true },        // Vacation mode toggle
        isActive: { type: Boolean, default: true },      // Admin can deactivate
        isVerified: { type: Boolean, default: false },   // Verified badge

        // ─── Social Links ─────────────────────────────────────────────────────────
        socialLinks: {
            instagram: { type: String, default: '' },
            facebook: { type: String, default: '' },
            website: { type: String, default: '' },
        },

        // ─── Followers ────────────────────────────────────────────────────────────
        followers: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
        followersCount: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// ── Indexes ─────────────────────────────────────────────────────────────────
shopSchema.index({ seller: 1 });
shopSchema.index({ shopSlug: 1 });
shopSchema.index({ 'rating.average': -1 });
shopSchema.index({ 'analytics.totalOrders': -1 });
shopSchema.index({ 'address.pincode': 1 });
shopSchema.index({ isActive: 1, isOpen: 1 });

// ── Auto-generate slug from shopName ─────────────────────────────────────────
shopSchema.pre('save', async function (next) {
    if (this.isModified('shopName') || this.isNew) {
        let baseSlug = this.shopName
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim();

        // Ensure uniqueness
        let slug = baseSlug;
        let counter = 1;
        while (await mongoose.model('Shop').findOne({ shopSlug: slug, _id: { $ne: this._id } })) {
            slug = `${baseSlug}-${counter++}`;
        }
        this.shopSlug = slug;
    }
    next();
});

// ── Method: Recalculate rating ────────────────────────────────────────────────
shopSchema.methods.recalculateRating = async function () {
    const ShopReview = mongoose.model('ShopReview');
    const result = await ShopReview.aggregate([
        { $match: { shop: this._id, isActive: true } },
        {
            $group: {
                _id: null,
                average: { $avg: '$rating' },
                total: { $sum: 1 },
                five: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
                four: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
                three: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
                two: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
                one: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
            },
        },
    ]);

    if (result.length > 0) {
        this.rating.average = Math.round(result[0].average * 10) / 10;
        this.rating.totalReviews = result[0].total;
        this.rating.breakdown = {
            five: result[0].five,
            four: result[0].four,
            three: result[0].three,
            two: result[0].two,
            one: result[0].one,
        };
    } else {
        this.rating = {
            average: 0,
            totalReviews: 0,
            breakdown: { five: 0, four: 0, three: 0, two: 0, one: 0 },
        };
    }

    return this.save();
};

const Shop = mongoose.model('Shop', shopSchema);
module.exports = Shop;
