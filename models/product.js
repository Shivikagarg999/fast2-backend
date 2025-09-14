const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  // Basic Information
  name: { type: String },
  description: { type: String },
  brand: { type: String },
  
  // Category Information
  category: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Category',
  },
  subcategory: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Category'
  },
  
  // Pricing Information
  price: { type: Number },
  oldPrice: { type: Number, default: 0 },
  discountPercentage: { type: Number, default: 0 },
  unit: { type: String, enum: ['piece', 'kg', 'g', 'l', 'ml', 'pack'] },
  unitValue: { type: Number, default: 1 },   // ✅ made optional with default 1
  
  // Promotor Information
  promotor: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Promotor' },
    commissionRate: { type: Number },
    commissionType: { type: String, enum: ['percentage', 'fixed'] },
    commissionAmount: { type: Number, default: 0 }
  },
  
  // Inventory & Stock
  quantity: { type: Number, required: true, default: 0 },
  minOrderQuantity: { type: Number, default: 1 },
  maxOrderQuantity: { type: Number, default: 10 },
  stockStatus: { 
    type: String, 
    enum: ['in-stock', 'out-of-stock', 'low-stock', 'discontinued'],
    default: 'in-stock'
  },
  lowStockThreshold: { type: Number, default: 10 },
  
  // Physical Attributes
  weight: { type: String },
  weightUnit: { type: String, enum: ['g', 'kg', 'ml', 'l'], default: 'g' },
  dimensions: {
    length: { type: Number },
    width: { type: Number },
    height: { type: Number }
  },
  volume: { type: Number },
  
  // Warehouse Information
  warehouse: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
    name: { type: String },
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
    storageType: { type: String, enum: ['ambient', 'cold-storage', 'frozen'] },
    aisle: String,
    rack: String,
    shelf: String
  },
  
  // Images & Media
  images: [{ 
    url: { type: String },
    altText: String,
    isPrimary: { type: Boolean, default: false }
  }],
  
  // Ratings & Reviews
  ratings: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 }
  },

  // Delivery Information
  delivery: {
    estimatedDeliveryTime: String,
    deliveryCharges: { type: Number, default: 0 },
    freeDeliveryThreshold: { type: Number, default: 0 },
    availablePincodes: [String]
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Middleware to calculate commission amount before saving
productSchema.pre('save', function(next) {
  if (this.promotor.commissionType === 'percentage') {
    this.promotor.commissionAmount = (this.price * this.promotor.commissionRate) / 100;
  } else {
    this.promotor.commissionAmount = this.promotor.commissionRate || 0;
  }
  next();
});

// Virtual for discount amount
productSchema.virtual('discountAmount').get(function() {
  return this.oldPrice > 0 ? this.oldPrice - this.price : 0;
});

// Virtual for formatted price
productSchema.virtual('formattedPrice').get(function() {
  return `₹${this.price.toFixed(2)}`;
});

// Virtual for formatted old price
productSchema.virtual('formattedOldPrice').get(function() {
  return this.oldPrice > 0 ? `₹${this.oldPrice.toFixed(2)}` : null;
});

// Indexes for performance
productSchema.index({ name: 'text', description: 'text', brand: 'text' });
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ price: 1 });
productSchema.index({ 'ratings.average': -1 });
productSchema.index({ sku: 1 }, { unique: true });
productSchema.index({ 'promotor.id': 1 });

// ✅ Proper export (prevents overwrite & required cache issue)
const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
module.exports = Product;