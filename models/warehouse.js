const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, unique: true }, 

  // Warehouse belongs to a promotor
  promotor: { type: mongoose.Schema.Types.ObjectId, ref: 'Promotor', required: true },

  location: {
    address: String,
    city: String,
    state: String,
    pincode: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  storageType: { type: String, enum: ['ambient', 'cold-storage', 'frozen'], default: 'ambient' },

  // Stock & products
  capacity: { type: Number, default: 0 },
  currentStock: { type: Number, default: 0 },
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
}, { timestamps: true });

const Warehouse = mongoose.model('Warehouse', warehouseSchema);
module.exports = { Warehouse };