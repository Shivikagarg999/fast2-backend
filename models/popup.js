const mongoose = require('mongoose');

const popupSchema = new mongoose.Schema({
    imageUrl: {
        type: String,
        required: true,
        trim: true
    },
    title: {
        type: String,
        trim: true,
        maxlength: 80,
        default: ''
    },
    subtitle: {
        type: String,
        trim: true,
        maxlength: 200,
        default: ''
    },
    ctaText: {
        type: String,
        trim: true,
        maxlength: 30,
        default: ''
    },
    ctaLink: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ''
    },
    startTime: {
        type: Date,
        required: true
    },
    endTime: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
}, {
    timestamps: true
});

popupSchema.index({ isActive: 1, startTime: 1, endTime: 1 });

module.exports = mongoose.models.Popup || mongoose.model('Popup', popupSchema);
