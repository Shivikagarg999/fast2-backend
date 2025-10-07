const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  subtitle: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  image: {
    type: String,
    required: true,
    trim: true
  },
  fallbackImage: {
    type: String,
    required: true,
    trim: true
  },
  cta: {
    type: String,
    required: true,
    trim: true
  },
  ctaColor: {
    type: String,
    required: true,
    trim: true
  },
  gradient: {
    type: String,
    required: true,
    trim: true
  },
  accentColor: {
    type: String,
    required: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

bannerSchema.index({ isActive: 1, order: 1 });

module.exports = mongoose.model('Banner', bannerSchema);