const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  // Basic Info
  name: { type: String, required: true, unique: true },
  image: { type: String },

  // Tax Information (default for all products in this category)
  hsnCode: { type: String },
  gstPercent: { type: Number, default: 0 },
  taxType: { type: String, enum: ['inclusive', 'exclusive'], default: 'inclusive' },

  // Unit of Measure (UOM) – default for products under this category
  defaultUOM: { type: String, default: 'piece' },

  // Additional Flags
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

// Index for faster searches
categorySchema.index({ name: 1 });

module.exports = mongoose.models.Category || mongoose.model('Category', categorySchema);