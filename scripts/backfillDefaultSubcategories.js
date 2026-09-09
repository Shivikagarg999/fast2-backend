require('dotenv').config();

const mongoose = require('mongoose');
const Category = require('../models/category');
const Subcategory = require('../models/subcategory');
const Product = require('../models/product');

const DEFAULT_SUBCATEGORY_NAME = 'General';

const backfillDefaultSubcategories = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required');
  }

  await mongoose.connect(process.env.MONGO_URI);

  const categoryIds = await Product.distinct('category', {
    $or: [
      { subcategory: { $exists: false } },
      { subcategory: null }
    ]
  });

  let categoriesProcessed = 0;
  let subcategoriesCreated = 0;
  let productsUpdated = 0;

  for (const categoryId of categoryIds) {
    const category = await Category.findById(categoryId);
    if (!category) continue;

    // One "General" subcategory per category, reused across runs so this
    // script stays safe to re-run without creating duplicates.
    let defaultSubcategory = await Subcategory.findOne({
      category: categoryId,
      name: DEFAULT_SUBCATEGORY_NAME
    });

    if (!defaultSubcategory) {
      defaultSubcategory = await Subcategory.create({
        name: DEFAULT_SUBCATEGORY_NAME,
        category: categoryId,
        // No image yet - kept inactive (same rule as image-less categories)
        // until an admin uploads one and activates it from the admin panel.
        isActive: false,
        sortOrder: 0
      });
      subcategoriesCreated += 1;
    }

    const result = await Product.updateMany(
      {
        category: categoryId,
        $or: [
          { subcategory: { $exists: false } },
          { subcategory: null }
        ]
      },
      { $set: { subcategory: defaultSubcategory._id } }
    );

    productsUpdated += result.modifiedCount;
    categoriesProcessed += 1;
  }

  console.log(`Processed ${categoriesProcessed} categor(y/ies), created ${subcategoriesCreated} default subcategor(y/ies), linked ${productsUpdated} product(s).`);
};

backfillDefaultSubcategories()
  .catch((error) => {
    console.error('Default subcategory backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
