const Product = require('../../../models/product');

exports.attachScratchGift = async (req, res) => {
  try {
    const { productId } = req.params;
    const { coinsAmount } = req.body;

    if (!coinsAmount || coinsAmount <= 0) {
      return res.status(400).json({ success: false, message: 'coinsAmount must be a positive number' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (product.price <= 200) {
      return res.status(400).json({
        success: false,
        message: 'Scratch gift can only be attached to products with price above 200'
      });
    }

    product.scratchGift.isEnabled = true;
    product.scratchGift.coinsAmount = coinsAmount;
    await product.save();

    return res.status(200).json({
      success: true,
      message: 'Scratch gift attached successfully',
      scratchGift: product.scratchGift
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.removeScratchGift = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    product.scratchGift.isEnabled = false;
    product.scratchGift.coinsAmount = 0;
    await product.save();

    return res.status(200).json({
      success: true,
      message: 'Scratch gift removed successfully'
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

exports.getScratchGift = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findById(productId).select('name price scratchGift');
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    return res.status(200).json({
      success: true,
      productId: product._id,
      productName: product.name,
      price: product.price,
      scratchGift: product.scratchGift
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
