const mongoose = require('mongoose');

const slugify = (value) => {
  const slug = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || 'product';
};

const buildUniqueSlug = async (Product, name, productId) => {
  const baseSlug = slugify(name);
  let slug = baseSlug;
  let counter = 1;
  const query = { slug };

  if (productId) {
    query._id = { $ne: productId };
  }

  while (await Product.exists(query)) {
    slug = `${baseSlug}-${counter++}`;
    query.slug = slug;
  }

  return slug;
};

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, lowercase: true, trim: true },
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
        ref: 'Seller',},
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
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

  isActive: { type: Boolean, default: true },
  scratchGift: {
    isEnabled: { type: Boolean, default: false },
    coinsAmount: { type: Number, default: 0 }
  }
}, { timestamps: true });

productSchema.index({ slug: 1 }, { unique: true, sparse: true });

productSchema.statics.createUniqueSlug = function (name, productId) {
  return buildUniqueSlug(this, name, productId);
};

productSchema.pre('save', function (next) {
  if (this.scratchGift && this.scratchGift.isEnabled && this.price <= 200) {
    return next(new Error('Scratch gift can only be attached to products with price above 200'));
  }
  next();
});

productSchema.pre('validate', async function (next) {
  if (this.isNew || this.isModified('name') || !this.slug) {
    this.slug = await buildUniqueSlug(this.constructor, this.name, this._id);
  }
  next();
});

productSchema.pre('insertMany', async function (next, docs) {
  if (!Array.isArray(docs) || docs.length === 0) return next();

  const Product = this;
  const usedSlugs = new Set();

  for (const doc of docs) {
    if (!doc.slug && doc.name) {
      let slug = await buildUniqueSlug(Product, doc.name, doc._id);
      const baseSlug = slug;
      let counter = 1;

      while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${counter++}`;
      }

      doc.slug = slug;
      usedSlugs.add(slug);
    }
  }

  next();
});

productSchema.pre('findOneAndUpdate', async function (next) {
  const update = this.getUpdate() || {};
  const nextName = update.name || update.$set?.name;

  if (!nextName) return next();

  const existingProduct = await this.model.findOne(this.getQuery()).select('name slug');
  if (!existingProduct) return next();

  if (existingProduct.slug && existingProduct.name === nextName) {
    return next();
  }

  const nextSlug = await buildUniqueSlug(this.model, nextName, existingProduct._id);

  if (update.$set) {
    update.$set.slug = nextSlug;
  } else {
    update.slug = nextSlug;
  }

  this.setUpdate(update);
  next();
});

productSchema.path('images').validate(function(images) {
  return images.length <= 5;
}, 'A product can have maximum 5 images.');

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);
