require('dotenv').config();

const mongoose = require('mongoose');
const Product = require('../models/product');

const backfillProductSlugs = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required');
  }

  await mongoose.connect(process.env.MONGO_URI);

  const products = await Product.find({
    $or: [
      { slug: { $exists: false } },
      { slug: null },
      { slug: '' }
    ]
  }).select('_id name slug');

  let updated = 0;

  for (const product of products) {
    const slug = await Product.createUniqueSlug(product.name, product._id);
    await Product.updateOne({ _id: product._id }, { $set: { slug } });
    updated += 1;
  }

  console.log(`Backfilled slugs for ${updated} product(s).`);
};

backfillProductSlugs()
  .catch((error) => {
    console.error('Product slug backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
