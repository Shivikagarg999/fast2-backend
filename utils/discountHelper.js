const Discount = require('../models/discount');

async function getActiveDiscounts() {
  const now = new Date();
  return Discount.find({
    isActive: true,
    startDate: { $lte: now },
    $or: [{ endDate: { $gte: now } }, { endDate: null }]
  }).lean();
}

// Returns { effectivePrice, campaignDiscountPercentage } for a single product.
// product must have _id, price, and category (either populated object or raw ObjectId string).
function getEffectivePrice(product, discounts) {
  const productId = product._id.toString();
  const categoryId = product.category?._id
    ? product.category._id.toString()
    : product.category?.toString();

  let bestDiscount = 0;
  for (const discount of discounts) {
    const matchesProduct = discount.products?.some(p => p.toString() === productId);
    const matchesCategory = discount.category && discount.category.toString() === categoryId;
    if (matchesProduct || matchesCategory) {
      bestDiscount = Math.max(bestDiscount, discount.discountPercentage);
    }
  }

  const effectivePrice = bestDiscount > 0
    ? parseFloat((product.price * (1 - bestDiscount / 100)).toFixed(2))
    : product.price;

  return { effectivePrice, campaignDiscountPercentage: bestDiscount };
}

// Merges discount fields into a plain product object.
function applyDiscountToProduct(productObj, discounts) {
  const { effectivePrice, campaignDiscountPercentage } = getEffectivePrice(productObj, discounts);
  return { ...productObj, effectivePrice, campaignDiscountPercentage };
}

module.exports = { getActiveDiscounts, getEffectivePrice, applyDiscountToProduct };
