require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/product');
const Seller = require('../models/seller');
const Shop = require('../models/shop');

const DEFAULTS = {
  pincode: '474011',
  // GMKart Online Shopping, Thatipur, Gwalior 474011.
  latitude: 26.2123833,
  longitude: 78.2120969
};

const pincode = process.env.PINCODE || process.argv[2] || DEFAULTS.pincode;
const latitude = Number(process.env.LAT || process.argv[3] || DEFAULTS.latitude);
const longitude = Number(process.env.LNG || process.argv[4] || DEFAULTS.longitude);
const applyChanges = process.env.APPLY === 'true';
const overwrite = process.env.OVERWRITE === 'true';
const includeProductLinkedShops = process.env.INCLUDE_PRODUCT_LINKED_SHOPS === 'true';

const hasValidCoordinate = (shop) => {
  const lat = Number(shop.address?.coordinates?.lat);
  const lng = Number(shop.address?.coordinates?.lng);
  const geo = shop.address?.location?.coordinates;

  return (
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180 &&
    Array.isArray(geo) &&
    geo.length === 2
  );
};

const uniqueIds = (values) => {
  const ids = values.filter(Boolean).map((value) => value.toString());
  return [...new Set(ids)].map((value) => new mongoose.Types.ObjectId(value));
};

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required');
  }
  if (!/^\d{6}$/.test(pincode)) {
    throw new Error('PINCODE must be a 6-digit Indian pincode');
  }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('LAT must be a valid latitude');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('LNG must be a valid longitude');
  }

  await mongoose.connect(process.env.MONGO_URI);

  const products = await Product.find({
    $or: [
      { serviceablePincodes: pincode },
      { 'delivery.availablePincodes': pincode }
    ]
  }).select('_id name seller shop serviceablePincodes delivery.availablePincodes').lean();

  const productShopIds = uniqueIds(products.map((product) => product.shop));
  const productSellerIds = uniqueIds(products.map((product) => product.seller));

  const sellersWithPincode = await Seller.find({ 'address.pincode': pincode }).select('_id shop').lean();
  const sellerIdsWithPincode = uniqueIds(sellersWithPincode.map((seller) => seller._id));
  const sellerIds = includeProductLinkedShops
    ? uniqueIds([...productSellerIds, ...sellerIdsWithPincode])
    : sellerIdsWithPincode;
  const sellerShopIds = uniqueIds(sellersWithPincode.map((seller) => seller.shop));

  const shopFilters = [
    { _id: { $in: sellerShopIds } },
    { seller: { $in: sellerIdsWithPincode } },
    { 'address.pincode': pincode }
  ];

  if (includeProductLinkedShops) {
    shopFilters.push(
      { _id: { $in: productShopIds } },
      { seller: { $in: productSellerIds } }
    );
  }

  const shops = await Shop.find({ $or: shopFilters }).select('_id shopName seller address').lean();

  const shopsToUpdate = shops.filter((shop) => overwrite || !hasValidCoordinate(shop));
  const matchedShopSellerIds = new Set(shops.map((shop) => shop.seller?.toString()).filter(Boolean));
  const productsWithoutMatchedShop = products.filter((product) => {
    const productShopId = product.shop?.toString();
    const productSellerId = product.seller?.toString();
    return (
      !shops.some((shop) => shop._id.toString() === productShopId) &&
      !matchedShopSellerIds.has(productSellerId)
    );
  });

  console.log(JSON.stringify({
    dryRun: !applyChanges,
    pincode,
    latitude,
    longitude,
    overwrite,
    includeProductLinkedShops,
    productsMatchedByPincode: products.length,
    shopsMatched: shops.length,
    shopsToUpdate: shopsToUpdate.length,
    productsWithoutMatchedShop: productsWithoutMatchedShop.length,
    shopSamples: shopsToUpdate.slice(0, 10).map((shop) => ({
      id: shop._id,
      shopName: shop.shopName,
      currentPincode: shop.address?.pincode,
      currentCoordinates: shop.address?.coordinates,
      currentLocation: shop.address?.location
    }))
  }, null, 2));

  if (!applyChanges) {
    await mongoose.disconnect();
    return;
  }

  const locationUpdate = {
    'address.coordinates.lat': latitude,
    'address.coordinates.lng': longitude,
    'address.location': {
      type: 'Point',
      coordinates: [longitude, latitude]
    }
  };

  const shopIdsToUpdate = shopsToUpdate.map((shop) => shop._id);
  const shopResult = await Shop.updateMany(
    { _id: { $in: shopIdsToUpdate } },
    { $set: locationUpdate }
  );

  const sellerResult = await Seller.updateMany(
    {
      _id: { $in: sellerIds },
      'address.pincode': pincode,
      $or: [
        { 'address.coordinates.lat': { $exists: false } },
        { 'address.coordinates.lng': { $exists: false } },
        ...(overwrite ? [{}] : [])
      ]
    },
    {
      $set: {
        'address.coordinates.lat': latitude,
        'address.coordinates.lng': longitude
      }
    }
  );

  console.log(JSON.stringify({
    updatedShops: shopResult.modifiedCount,
    updatedSellers: sellerResult.modifiedCount
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
