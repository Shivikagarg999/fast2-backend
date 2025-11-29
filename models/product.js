const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  brand: { type: String },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  
  price: { type: Number, required: true },
  oldPrice: { type: Number, default: 0 },
  discountPercentage: { type: Number, default: 0 },
  
  hsnCode: { type: String },
  gstPercent: { type: Number, default: 0 },
  taxType: { type: String, enum: ['inclusive', 'exclusive'], default: 'inclusive' },
  
  unit: { type: String },
  unitValue: { type: Number },
  
  promotor: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Promotor' },
    commissionRate: { type: Number, default: 0 },
    commissionType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    commissionAmount: { type: Number, default: 0 }
  },
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Seller',
        required: true
      },
  quantity: { type: Number, default: 0 },
  minOrderQuantity: { type: Number, default: 1 },
  maxOrderQuantity: { type: Number, default: 10 },
  stockStatus: { type: String, enum: ['in-stock', 'out-of-stock'], default: 'out-of-stock' },
  lowStockThreshold: { type: Number, default: 10 },
  
  weight: { type: Number },
  weightUnit: { type: String, default: 'g' },
  dimensions: {
    length: { type: Number },
    width: { type: Number },
    height: { type: Number },
    unit: { type: String, default: 'cm' }
  },
  
  images: [{
    url: { type: String, required: true },
    altText: { type: String },
    isPrimary: { type: Boolean, default: false },
    order: { type: Number, default: 0 }
  }],
  
  video: {
    url: { type: String },
    thumbnail: { type: String },
    duration: { type: Number },
    fileSize: { type: Number }
  },
  
  warehouse: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
    code: { type: String },
    storageType: { type: String }
  },
  
  delivery: {
    estimatedDeliveryTime: { type: String },
    deliveryCharges: { type: Number, default: 0 },
    freeDeliveryThreshold: { type: Number, default: 0 },
    availablePincodes: [{ type: String }]
  },
  
  variants: [
    {
      name: { type: String },
      options: [
        {
          value: { type: String },
          price: { type: Number },
          quantity: { type: Number, default: 0 },
          sku: { type: String }
        }
      ]
    }
  ],
  
  serviceablePincodes: [{ type: String }],
  
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

productSchema.path('images').validate(function(images) {
  return images.length <= 5;
}, 'A product can have maximum 5 images.');

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);