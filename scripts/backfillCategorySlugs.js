require('dotenv').config();

const mongoose = require('mongoose');
const Category = require('../models/category');

const backfillCategorySlugs = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required');
  }

  await mongoose.connect(process.env.MONGO_URI);

  const categories = await Category.find({
    $or: [
      { slug: { $exists: false } },
      { slug: null },
      { slug: '' }
    ]
  }).select('_id name slug');

  let updated = 0;

  for (const category of categories) {
    const slug = await Category.createUniqueSlug(category.name, category._id);
    await Category.updateOne({ _id: category._id }, { $set: { slug } });
    updated += 1;
  }

  console.log(`Backfilled slugs for ${updated} categor${updated === 1 ? 'y' : 'ies'}.`);
};

backfillCategorySlugs()
  .catch((error) => {
    console.error('Category slug backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
