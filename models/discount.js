const mongoose = require('mongoose');

const discountSchema = new mongoose.Schema({
  name: { type: String, required: true },
  discountPercentage: { type: Number, required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' }, 
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }], 
  isActive: { type: Boolean, default: true },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date } 
}, { timestamps: true });

module.exports = mongoose.models.Discount || mongoose.model('Discount', discountSchema);