const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  category: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Category',
    required: true
  },
  weight: { type: String, required: true },
  price: { type: Number, required: true },
  oldPrice: { type: Number, default: 0 },
  quantity: { type: Number, required: true, default: 1 },
  image: { type: String, required: true }, 
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);