const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  
  name: { type: String, required: true, unique: true },
  image: { type: String },

  hsnCode: { type: String },
  gstPercent: { type: Number, default: 0 },
  taxType: { type: String, enum: ['inclusive', 'exclusive'], default: 'inclusive' },

  defaultUOM: { type: String, default: 'piece' },

  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

categorySchema.index({ name: 1 });

module.exports = mongoose.models.Category || mongoose.model('Category', categorySchema);