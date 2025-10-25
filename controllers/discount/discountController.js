const Discount = require('../../models/discount');
const Product = require('../../models/product');
const Category = require('../../models/category');

exports.createDiscount = async (req, res) => {
  try {
    const { name, discountPercentage, categoryId, productIds, startDate, endDate } = req.body;

    if (!discountPercentage || (!categoryId && (!productIds || !productIds.length))) {
      return res.status(400).json({ message: "Discount percentage and category or products are required." });
    }

    const discount = new Discount({
      name,
      discountPercentage,
      category: categoryId,
      products: productIds,
      startDate,
      endDate
    });

    await discount.save();
    res.status(201).json({ message: "Discount created successfully.", discount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong." });
  }
};

exports.getActiveDiscounts = async (req, res) => {
  try {
    const now = new Date();
    const discounts = await Discount.find({
      isActive: true,
      $or: [
        { startDate: { $lte: now }, endDate: { $gte: now } },
        { startDate: { $lte: now }, endDate: null }
      ]
    })
    .populate('category', 'name')
    .populate('products', 'name price');

    res.status(200).json({ count: discounts.length, discounts });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong." });
  }
};
