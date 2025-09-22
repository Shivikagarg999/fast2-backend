const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, unique: true },
  
  // New fields from frontend
  warehouseManager: { type: String, required: true },
  contact: { type: String, required: true },
  
  // Warehouse belongs to a promotor
  promotor: { type: mongoose.Schema.Types.ObjectId, ref: 'Promotor', required: true },

  location: {
    address: String,
    city: { type: String, required: true },
    state: String,
    pincode: String,
    coordinates: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true }
    }
  },
  
  storageType: { 
    type: String, 
    enum: ['ambient', 'cold-storage', 'frozen'], 
    default: 'ambient' 
  },

  // Stock & products
  capacity: { type: Number, default: 0 },
  currentStock: { type: Number, default: 0 },
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
}, { timestamps: true });

const Warehouse = mongoose.model('Warehouse', warehouseSchema);
module.exports = { Warehouse };