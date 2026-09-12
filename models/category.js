const mongoose = require('mongoose');

const slugify = (value) => {
  const slug = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || 'category';
};

const buildUniqueSlug = async (Category, name, categoryId) => {
  const baseSlug = slugify(name);
  let slug = baseSlug;
  let counter = 1;
  const query = { slug };

  if (categoryId) {
    query._id = { $ne: categoryId };
  }

  while (await Category.exists(query)) {
    slug = `${baseSlug}-${counter++}`;
    query.slug = slug;
  }

  return slug;
};

const categorySchema = new mongoose.Schema({

  name: { type: String, required: true, unique: true },
  slug: { type: String, lowercase: true, trim: true },
  image: { type: String },

  hsnCode: { type: String },
  gstPercent: { type: Number, default: 0 },
  taxType: { type: String, enum: ['inclusive', 'exclusive'], default: 'inclusive' },

  defaultUOM: { type: String, default: 'piece' },

  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

categorySchema.index({ name: 1 });
categorySchema.index({ slug: 1 }, { unique: true, sparse: true });

categorySchema.statics.createUniqueSlug = function (name, categoryId) {
  return buildUniqueSlug(this, name, categoryId);
};

categorySchema.statics.slugifyCategoryName = slugify;

categorySchema.pre('validate', async function (next) {
  if (this.isNew || this.isModified('name') || !this.slug) {
    this.slug = await buildUniqueSlug(this.constructor, this.name, this._id);
  }
  next();
});

categorySchema.pre('findOneAndUpdate', async function (next) {
  const update = this.getUpdate() || {};
  const nextName = update.name || update.$set?.name;

  if (!nextName) return next();

  const existingCategory = await this.model.findOne(this.getQuery()).select('name slug');
  if (!existingCategory) return next();

  if (existingCategory.slug && existingCategory.name === nextName) {
    return next();
  }

  const nextSlug = await buildUniqueSlug(this.model, nextName, existingCategory._id);

  if (update.$set) {
    update.$set.slug = nextSlug;
  } else {
    update.slug = nextSlug;
  }

  this.setUpdate(update);
  next();
});

module.exports = mongoose.models.Category || mongoose.model('Category', categorySchema);
