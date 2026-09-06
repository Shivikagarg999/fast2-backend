const Coupon = require('../models/coupon');
const Order = require('../models/order');
const { calculateFinalOrderAmount, roundMoney } = require('./orderAmounts');

// Single source of truth for order pricing (subtotal, per-seller delivery charges,
// handling charge, coupon/scratch-coupon discounts, wallet deduction, final amount).
// Used by both order creation and the /calculate-total preview endpoint so the
// checkout screen and the actual charge can never drift apart again.
//
// Pure/read-only: does not mutate the user's wallet or persist anything — the caller
// is responsible for actually deducting wallet balance and saving the user if needed.
async function calculateOrderPricing({
  items,
  products,
  coupon,
  scratchCouponCode,
  paymentMethod = 'cod',
  useWallet = false,
  userId,
  walletBalance = 0,
  session
}) {
  let subtotal = 0;
  let totalGst = 0;
  let deliveryCharges = 0;
  let isFreeDelivery = false;

  const shopDeliveryMap = new Map();

  const toId = (value) => value?._id?.toString?.() || value?.toString?.() || '';
  const getShopDeliveryKey = (product) => {
    const shopId = toId(product.shop);
    if (shopId) return `shop:${shopId}`;

    const sellerId = toId(product.seller);
    if (sellerId) return `seller:${sellerId}`;

    return `product:${toId(product._id)}`;
  };

  const getShopName = (product) =>
    product.shop?.shopName || product.seller?.businessName || product.seller?.name || 'Shop';

  for (const item of items) {
    const product = products.find(p => p._id.toString() === item.product.toString());
    const itemTotal = item.price * item.quantity;
    subtotal += itemTotal;

    const itemGstPercent = product.category?.gstPercent || 0;
    totalGst += parseFloat(((itemTotal * itemGstPercent) / 100).toFixed(2));

    const productDelivery = product.delivery || {};
    const productDeliveryCharges = productDelivery.deliveryCharges || 0;
    const productFreeThreshold = productDelivery.freeDeliveryThreshold || 0;

    const shopKey = getShopDeliveryKey(product);

    if (shopDeliveryMap.has(shopKey)) {
      const existing = shopDeliveryMap.get(shopKey);
      shopDeliveryMap.set(shopKey, {
        ...existing,
        subtotal: existing.subtotal + itemTotal,
        highestDeliveryCharge: Math.max(existing.highestDeliveryCharge, productDeliveryCharges),
        lowestFreeThreshold: existing.lowestFreeThreshold > 0 ?
          Math.min(existing.lowestFreeThreshold, productFreeThreshold) :
          productFreeThreshold,
        items: [...existing.items, { productId: product._id, itemTotal }]
      });
    } else {
      shopDeliveryMap.set(shopKey, {
        shopKey,
        shopName: getShopName(product),
        subtotal: itemTotal,
        highestDeliveryCharge: productDeliveryCharges,
        lowestFreeThreshold: productFreeThreshold,
        items: [{ productId: product._id, itemTotal }]
      });
    }
  }

  const DEFAULT_FREE_DELIVERY_THRESHOLD_PER_SHOP = 199;

  for (const [, shopData] of shopDeliveryMap.entries()) {
    const hasCustomFreeThreshold = shopData.lowestFreeThreshold > 0;
    const freeThreshold = hasCustomFreeThreshold
      ? shopData.lowestFreeThreshold
      : DEFAULT_FREE_DELIVERY_THRESHOLD_PER_SHOP;

    if (
      freeThreshold > 0 &&
      (hasCustomFreeThreshold ? shopData.subtotal >= freeThreshold : shopData.subtotal > freeThreshold)
    ) {
      continue;
    }
    deliveryCharges += shopData.highestDeliveryCharge;
  }

  isFreeDelivery = deliveryCharges === 0;

  const HANDLING_CHARGE_PER_SHOP = 2;
  const numberOfShops = shopDeliveryMap.size;
  const handlingCharge = numberOfShops * HANDLING_CHARGE_PER_SHOP;

  const total = parseFloat((subtotal + deliveryCharges).toFixed(2));
  totalGst = parseFloat(totalGst.toFixed(2));

  let discount = 0;
  let finalAmount = calculateFinalOrderAmount({
    total,
    handlingCharge,
    totalGst,
    coupon: { discount: 0 }
  });

  let appliedCoupon = null;
  if (coupon && coupon.code) {
    const validCoupon = await Coupon.validateCoupon(coupon.code, userId, finalAmount);

    const userCouponUsage = await Order.countDocuments({
      user: userId,
      'coupon.code': validCoupon.code
    }).session(session || null);

    if (userCouponUsage >= validCoupon.perUserLimit) {
      throw new Error('You have already used this coupon');
    }

    if (validCoupon.benefitType === 'free_quantity') {
      const result = validCoupon.calculateFreeQuantityDiscount(items, products);
      discount = result.discount;

      if (discount <= 0) {
        throw new Error('Coupon is not applicable on selected products');
      }
    } else {
      discount = validCoupon.calculateScopedDiscount(items, products, finalAmount);

      if (discount <= 0) {
        throw new Error('Coupon is not applicable on selected products');
      }
    }

    finalAmount = parseFloat((finalAmount - discount).toFixed(2));
    appliedCoupon = {
      code: validCoupon.code,
      discount,
      benefitType: validCoupon.benefitType,
      ...(validCoupon.benefitType === 'free_quantity' && { freebieRule: validCoupon.freebieRule })
    };
  }

  let scratchCouponDiscount = 0;
  let scratchCouponOrder = null;
  let scratchCouponDetails = null;

  if (scratchCouponCode) {
    scratchCouponOrder = await Order.findOne({
      user: userId,
      'orderScratchCard.couponCode': scratchCouponCode.toUpperCase(),
      'orderScratchCard.isScratched': true,
      'orderScratchCard.isRedeemed': false
    }).session(session || null);

    if (!scratchCouponOrder) {
      throw new Error('Invalid or already redeemed scratch card coupon');
    }

    const scratchCoupon = await Coupon.validateCoupon(scratchCouponCode, userId, finalAmount);
    scratchCouponDiscount = scratchCoupon.calculateDiscount(finalAmount);
    finalAmount = parseFloat((finalAmount - scratchCouponDiscount).toFixed(2));
    scratchCouponDetails = {
      code: scratchCoupon.code,
      discountType: scratchCoupon.discountType,
      discountValue: scratchCoupon.discountValue,
      discountAmount: scratchCouponDiscount
    };
  }

  let walletDeduction = 0;
  let cashOnDelivery = finalAmount;

  if (useWallet && walletBalance > 0) {
    walletDeduction = Math.min(walletBalance, finalAmount);
    cashOnDelivery = finalAmount - walletDeduction;
  }

  const onlinePayableAmount = paymentMethod === 'online'
    ? roundMoney(Math.max(finalAmount - walletDeduction, 0))
    : 0;

  return {
    subtotal: roundMoney(subtotal),
    deliveryCharges: roundMoney(deliveryCharges),
    isFreeDelivery,
    numberOfShops,
    handlingCharge: roundMoney(handlingCharge),
    totalGst: roundMoney(totalGst),
    total: roundMoney(total),
    discount: roundMoney(discount),
    appliedCoupon,
    scratchCouponDiscount: roundMoney(scratchCouponDiscount),
    scratchCouponDetails,
    scratchCouponOrder,
    walletDeduction: roundMoney(walletDeduction),
    cashOnDelivery: roundMoney(cashOnDelivery),
    finalAmount: roundMoney(finalAmount),
    onlinePayableAmount: roundMoney(onlinePayableAmount)
  };
}

module.exports = { calculateOrderPricing };
