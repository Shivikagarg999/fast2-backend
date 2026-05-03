const roundMoney = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? parseFloat(number.toFixed(2)) : 0;
};

const toPlainOrder = (order) => {
  if (!order) return order;
  if (typeof order.toObject === 'function') {
    return order.toObject({ virtuals: true });
  }
  return { ...order };
};

const calculateFinalOrderAmount = (order) => {
  if (!order) return 0;

  const total = roundMoney(order.total);
  const handlingCharge = roundMoney(order.handlingCharge);
  const totalGst = roundMoney(order.totalGst);
  const couponDiscount = roundMoney(order.coupon?.discount);
  const scratchCouponDiscount = roundMoney(order.scratchCouponDiscount);

  return roundMoney(Math.max(total + handlingCharge + totalGst - couponDiscount - scratchCouponDiscount, 0));
};

const getDisplayFinalAmount = (order) => {
  const savedFinalAmount = roundMoney(order?.finalAmount);
  const calculatedFinalAmount = calculateFinalOrderAmount(order);

  if (!savedFinalAmount) return calculatedFinalAmount;
  if (!calculatedFinalAmount) return savedFinalAmount;

  return savedFinalAmount < calculatedFinalAmount ? calculatedFinalAmount : savedFinalAmount;
};

const formatOrderAmounts = (order) => {
  const plain = toPlainOrder(order);
  if (!plain) return plain;

  const totalBeforeDiscount = roundMoney(plain.total);
  const finalAmount = getDisplayFinalAmount(plain);
  const walletDeduction = roundMoney(plain.walletDeduction);
  const cashOnDelivery = roundMoney(plain.cashOnDelivery);
  const amountToCollect = plain.paymentMethod === 'cod'
    ? roundMoney(cashOnDelivery > 0 ? cashOnDelivery : Math.max(finalAmount - walletDeduction, 0))
    : 0;

  return {
    ...plain,
    totalBeforeDiscount,
    finalAmount,
    total: finalAmount,
    amount: finalAmount,
    orderValue: finalAmount,
    payableAmount: finalAmount,
    walletDeduction,
    cashOnDelivery,
    amountToCollect,
    billing: {
      ...(plain.billing || {}),
      subtotal: roundMoney(plain.subtotal),
      deliveryCharges: roundMoney(plain.deliveryCharges),
      handlingCharge: roundMoney(plain.handlingCharge),
      totalGst: roundMoney(plain.totalGst),
      couponDiscount: roundMoney(plain.coupon?.discount),
      totalBeforeDiscount,
      finalAmount,
      walletDeduction,
      cashOnDelivery,
      amountToCollect
    }
  };
};

const formatOrdersAmounts = (orders) => orders.map(formatOrderAmounts);

module.exports = {
  calculateFinalOrderAmount,
  formatOrderAmounts,
  formatOrdersAmounts,
  getDisplayFinalAmount,
  roundMoney
};
