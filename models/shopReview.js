const mongoose = require('mongoose');

const shopReviewSchema = new mongoose.Schema(
    {
        shop: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Shop',
            required: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
        },
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
        },
        title: {
            type: String,
            trim: true,
            maxlength: 100,
        },
        comment: {
            type: String,
            trim: true,
            maxlength: 1000,
        },
        images: [
            {
                url: { type: String },
                altText: { type: String },
            },
        ],
        // Seller can respond to reviews
        sellerResponse: {
            message: { type: String, trim: true, maxlength: 500 },
            respondedAt: { type: Date },
        },
        isVerifiedPurchase: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
        helpfulVotes: { type: Number, default: 0 },
        helpfulVotedBy: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
    },
    { timestamps: true }
);

// One review per user per shop
shopReviewSchema.index({ shop: 1, user: 1 }, { unique: true });
shopReviewSchema.index({ shop: 1, rating: -1 });
shopReviewSchema.index({ shop: 1, createdAt: -1 });
shopReviewSchema.index({ user: 1 });

const ShopReview = mongoose.model('ShopReview', shopReviewSchema);
module.exports = ShopReview;
