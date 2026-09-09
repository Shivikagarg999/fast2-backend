const mongoose = require('mongoose');

const subcategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  image: { type: String },

  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

subcategorySchema.index({ category: 1, name: 1 });

module.exports = mongoose.models.Subcategory || mongoose.model('Subcategory', subcategorySchema);
