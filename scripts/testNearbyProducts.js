require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/product');
const Shop = require('../models/shop');
const AppConfig = require('../models/appConfig');

const latitude = Number(process.env.LAT || process.argv[2] || 26.2123833);
const longitude = Number(process.env.LNG || process.argv[3] || 78.2120969);

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required');
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('LAT/LNG must be valid numbers');
  }

  await mongoose.connect(process.env.MONGO_URI);

  const config = await AppConfig.findOne({ app: 'customer' }).select('productServiceRadiusKm').lean();
  const radiusKm = config?.productServiceRadiusKm || 5;

  const shops = await Shop.find({
    isActive: true,
    isOpen: true,
    'address.location': {
      $near: {
        $geometry: { type: 'Point', coordinates: [longitude, latitude] },
        $maxDistance: radiusKm * 1000
      }
    }
  }).select('_id shopName seller address.pincode address.location').lean();

  const products = await Product.find({
    isActive: true,
    $or: [
      { shop: { $in: shops.map((shop) => shop._id) } },
      { seller: { $in: shops.map((shop) => shop.seller) } }
    ]
  }).select('_id name shop seller stockStatus').lean();

  console.log(JSON.stringify({
    userLocation: { latitude, longitude },
    radiusKm,
    shopsFound: shops.length,
    shops: shops.map((shop) => ({
      id: shop._id,
      shopName: shop.shopName,
      pincode: shop.address?.pincode,
      coordinates: shop.address?.location?.coordinates
    })),
    productsFound: products.length,
    productSamples: products.slice(0, 10).map((product) => ({
      id: product._id,
      name: product.name,
      stockStatus: product.stockStatus
    }))
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
