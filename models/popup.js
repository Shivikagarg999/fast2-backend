const mongoose = require('mongoose');

const popupSchema = new mongoose.Schema({
    imageUrl: {
        type: String,
        required: true,
        trim: true
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

module.exports = mongoose.models.Popup || mongoose.model('Popup', popupSchema);
