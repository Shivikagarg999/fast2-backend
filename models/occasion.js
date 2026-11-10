const mongoose = require("mongoose");

// A festival/occasion the admin might want to run a themed social post for.
// keywords are matched (case-insensitive) against category name, product name
// and product tags to suggest which category fits the occasion.
const occasionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    emoji: { type: String, default: "🎉" },
    date: { type: Date, required: true },
    keywords: [{ type: String }],
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

occasionSchema.index({ date: 1 });

module.exports = mongoose.model("Occasion", occasionSchema);
