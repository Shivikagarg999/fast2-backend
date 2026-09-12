const mongoose = require('mongoose');

const slugify = (value) => {
  const slug = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || 'subcategory';
};

const buildUniqueSlug = async (Subcategory, name, subcategoryId) => {
  const baseSlug = slugify(name);
  let slug = baseSlug;
  let counter = 1;
  const query = { slug };

  if (subcategoryId) {
    query._id = { $ne: subcategoryId };
  }

  while (await Subcategory.exists(query)) {
    slug = `${baseSlug}-${counter++}`;
    query.slug = slug;
  }

  return slug;
};

const subcategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, lowercase: true, trim: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  image: { type: String },

  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

subcategorySchema.index({ category: 1, name: 1 });
subcategorySchema.index({ slug: 1 }, { unique: true, sparse: true });

subcategorySchema.statics.createUniqueSlug = function (name, subcategoryId) {
  return buildUniqueSlug(this, name, subcategoryId);
};

subcategorySchema.statics.slugifySubcategoryName = slugify;

subcategorySchema.pre('validate', async function (next) {
  if (this.isNew || this.isModified('name') || !this.slug) {
    this.slug = await buildUniqueSlug(this.constructor, this.name, this._id);
  }
  next();
});

subcategorySchema.pre('findOneAndUpdate', async function (next) {
  const update = this.getUpdate() || {};
  const nextName = update.name || update.$set?.name;

  if (!nextName) return next();

  const existingSubcategory = await this.model.findOne(this.getQuery()).select('name slug');
  if (!existingSubcategory) return next();

  if (existingSubcategory.slug && existingSubcategory.name === nextName) {
    return next();
  }

  const nextSlug = await buildUniqueSlug(this.model, nextName, existingSubcategory._id);

  if (update.$set) {
    update.$set.slug = nextSlug;
  } else {
    update.slug = nextSlug;
  }

  this.setUpdate(update);
  next();
});

module.exports = mongoose.models.Subcategory || mongoose.model('Subcategory', subcategorySchema);
