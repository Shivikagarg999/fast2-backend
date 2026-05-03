require('dotenv').config();

const mongoose = require('mongoose');
const Order = require('../models/order');
const { calculateFinalOrderAmount, roundMoney } = require('../utils/orderAmounts');

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DB_URI;

const run = async () => {
  if (!mongoUri) {
    throw new Error('Mongo connection string not found. Set MONGO_URI, MONGODB_URI, or DB_URI.');
  }

  await mongoose.connect(mongoUri);

  const orders = await Order.find({});
  let scanned = 0;
  let updated = 0;

  for (const order of orders) {
    scanned += 1;
    const expectedFinalAmount = calculateFinalOrderAmount(order);

    if (expectedFinalAmount && roundMoney(order.finalAmount) < expectedFinalAmount) {
      order.finalAmount = expectedFinalAmount;

      if (order.walletDeduction > 0) {
        order.cashOnDelivery = roundMoney(Math.max(expectedFinalAmount - order.walletDeduction, 0));
      } else if (order.paymentMethod === 'cod') {
        order.cashOnDelivery = expectedFinalAmount;
      }

      await order.save();
      updated += 1;
      console.log(`Updated ${order.orderId || order._id}: finalAmount=${expectedFinalAmount}`);
    }
  }

  console.log(`Done. Scanned ${scanned} orders, updated ${updated}.`);
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
