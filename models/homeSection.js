const mongoose = require('mongoose');

// A linkable target shared by tiles and "view all" buttons — points to
// whatever the admin wants (a tag-filtered list, a category, a single
// product, or a raw URL) without needing a different field per type.
const linkSchema = new mongoose.Schema({
  type: { type: String, enum: ['tag', 'category', 'subcategory', 'product', 'url', 'none'], default: 'none' },
  value: { type: String, default: '' }
}, { _id: false });

const tileSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true },
  image: { type: String, required: true },
  featured: { type: Boolean, default: false }, // renders larger in the grid (e.g. the Navratri "Fasting Flours" tile)
  priceLabel: { type: String, default: '' }, // optional small price callout on the tile, e.g. "Starting at ₹29"
  link: { type: linkSchema, default: () => ({}) }
}, { _id: false });

const homeSectionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  subtitle: { type: String, default: '', trim: true },
  type: { type: String, enum: ['product_carousel', 'tile_grid'], required: true },

  // Visual theme for the section header band (e.g. Navratri's yellow gradient).
  theme: {
    bannerImage: { type: String, default: '' },
    backgroundColor: { type: String, default: '' },
    textColor: { type: String, default: '' }
  },

  // product_carousel only — how to pick which products show up.
  productSource: {
    mode: { type: String, enum: ['manual', 'tag', 'maxPrice', 'minDiscount', 'scheduled'], default: 'manual' },
    manualProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    tag: { type: String, default: '' },
    maxPrice: { type: Number, default: null },
    minDiscountPercent: { type: Number, default: null },
    limit: { type: Number, default: 20 },
    // 'scheduled' mode ("Get Tomorrow") — admin hand-picks products and types the
    // exact discounted price charged when the customer accepts next-day delivery.
    // Validated server-side in cartController before it's ever actually charged.
    scheduledProducts: [{
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      tomorrowPrice: { type: Number }
    }]
  },

  // tile_grid only.
  tiles: { type: [tileSchema], default: [] },

  viewAllLink: { type: linkSchema, default: () => ({}) },

  isActive: { type: Boolean, default: true },
  startDate: { type: Date, default: null }, // optional scheduling window, e.g. a festival campaign
  endDate: { type: Date, default: null },
  order: { type: Number, default: 0 },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
}, { timestamps: true });

homeSectionSchema.index({ isActive: 1, order: 1 });

module.exports = mongoose.models.HomeSection || mongoose.model('HomeSection', homeSectionSchema);
