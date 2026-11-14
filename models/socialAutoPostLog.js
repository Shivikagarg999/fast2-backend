const mongoose = require('mongoose');

const socialAutoPostLogSchema = new mongoose.Schema({
  runAt: {
    type: Date,
    default: Date.now
  },
  triggerType: {
    type: String,
    enum: ["cron", "manual"],
    default: "cron"
  },
  postType: {
    type: String,
    default: "category-deals"
  },
  title: {
    type: String,
    default: ""
  },
  categoryName: {
    type: String,
    default: ""
  },
  productNames: {
    type: [String],
    default: []
  },
  imageUrl: {
    type: String,
    required: true
  },
  caption: {
    type: String,
    default: ""
  },
  platforms: {
    type: [String],
    default: ["facebook", "instagram"]
  },
  publishResults: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  status: {
    type: String,
    enum: ["success", "partial", "failed"],
    default: "success"
  },
  error: {
    type: String,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('SocialAutoPostLog', socialAutoPostLogSchema);
