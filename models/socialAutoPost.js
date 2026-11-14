const mongoose = require('mongoose');

const socialAutoPostSchema = new mongoose.Schema({
  isEnabled: {
    type: Boolean,
    default: false
  },
  scheduledTime: {
    type: String, // "HH:mm" in 24-hr IST format, e.g. "10:30"
    default: "10:00"
  },
  platforms: {
    type: [String],
    default: ["facebook", "instagram"]
  },
  postType: {
    type: String,
    enum: ["category-deals", "lifestyle-scene"],
    default: "category-deals"
  },
  customCaption: {
    type: String,
    default: ""
  },
  lastRunAt: {
    type: Date,
    default: null
  },
  lastStatus: {
    type: String,
    enum: ["idle", "success", "partial", "failed"],
    default: "idle"
  },
  lastMessage: {
    type: String,
    default: ""
  }
}, { timestamps: true });

module.exports = mongoose.model('SocialAutoPost', socialAutoPostSchema);
