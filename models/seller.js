const mongoose = require('mongoose');

const sellerSchema = new mongoose.Schema({
  // Basic Info
  name: { type: String, required: true }, // seller person name
  email: { type: String, unique: true, required: true },
  phone: { type: String, unique: true, required: true },

  // Business Details
  businessName: { type: String, required: true },
  gstNumber: { type: String },
  panNumber: { type: String },

  // Address
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },

  // Banking Details (for payouts)
  bankDetails: {
    accountHolder: String,
    accountNumber: String,
    ifscCode: String,
    bankName: String
  },

  // Relation → Seller belongs to a Promotor
  promotor: { type: mongoose.Schema.Types.ObjectId, ref: 'Promotor', required: true },

  // Seller’s Products
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],

  // Status & Analytics
  isActive: { type: Boolean, default: true },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  totalOrders: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 }
}, { timestamps: true });

const Seller = mongoose.model('Seller', sellerSchema);

module.exports = { Seller };
