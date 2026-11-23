const mongoose = require('mongoose');

const scheduledPostSchema = new mongoose.Schema({
  title: {
    type: String,
    default: "Social Post"
  },
  // Not hard-required at the schema level — a video post uses videoUrl
  // instead. The controller validates "one of imageUrl/videoUrl is present"
  // for the given mediaType.
  imageUrl: {
    type: String,
    default: null
  },
  videoUrl: {
    type: String,
    default: null
  },
  mediaType: {
    type: String,
    enum: ["image", "video"],
    default: "image"
  },
  caption: {
    type: String,
    default: ""
  },
  platforms: {
    type: [String],
    default: ["facebook", "instagram"]
  },
  postType: {
    type: String,
    enum: ["lifestyle", "template", "custom", "video"],
    default: "lifestyle"
  },
  scheduledAt: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ["scheduled", "processing", "published", "failed", "cancelled"],
    default: "scheduled",
    index: true
  },
  publishedAt: {
    type: Date,
    default: null
  },
  publishResults: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  error: {
    type: String,
    default: ""
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('ScheduledPost', scheduledPostSchema);
