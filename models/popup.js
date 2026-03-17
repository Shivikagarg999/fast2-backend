const mongoose = require('mongoose');

const popupSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    message: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500
    },
    imageUrl: {
        type: String,
        default: null
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
    type: {
        type: String,
        enum: ['info', 'warning', 'success', 'error'],
        default: 'info'
    },
    position: {
        type: String,
        enum: ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'],
        default: 'top-center'
    },
    showCloseButton: {
        type: Boolean,
        default: true
    },
    autoCloseAfter: {
        type: Number,
        default: null, // seconds, null for manual close only
        min: 1,
        max: 300
    },
    targetPages: [{
        type: String,
        trim: true
    }], // empty array means all pages
    targetUsers: [{
        type: String,
        trim: true
    }], // empty array means all users
    priority: {
        type: Number,
        default: 1,
        min: 1,
        max: 10
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        required: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
    }
}, {
    timestamps: true
});

popupSchema.index({ isActive: 1, startTime: 1, endTime: 1 });
popupSchema.index({ priority: -1 });

module.exports = mongoose.models.Popup || mongoose.model('Popup', popupSchema);
