require('dotenv').config();

const mongoose = require('mongoose');
const Subcategory = require('../models/subcategory');

const backfillSubcategorySlugs = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required');
  }

  await mongoose.connect(process.env.MONGO_URI);

  const subcategories = await Subcategory.find({
    $or: [
      { slug: { $exists: false } },
      { slug: null },
      { slug: '' }
    ]
  }).select('_id name slug');

  let updated = 0;

  for (const subcategory of subcategories) {
    const slug = await Subcategory.createUniqueSlug(subcategory.name, subcategory._id);
    await Subcategory.updateOne({ _id: subcategory._id }, { $set: { slug } });
    updated += 1;
  }

  console.log(`Backfilled slugs for ${updated} subcategor${updated === 1 ? 'y' : 'ies'}.`);
};

backfillSubcategorySlugs()
  .catch((error) => {
    console.error('Subcategory slug backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
