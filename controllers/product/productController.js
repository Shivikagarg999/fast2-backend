const Product = require('../../models/product');
const imagekit = require('../../utils/imagekit'); 
const fs = require('fs');

// ✅ Create Product
const createProduct = async (req, res) => {
  try {
    const { name, description, category, weight, price, oldPrice, quantity } = req.body;

    if (!req.file) return res.status(400).json({ message: 'Image is required' });

    // Upload image to ImageKit
    const uploadResponse = await imagekit.upload({
      file: req.file.buffer.toString('base64'),
      fileName: req.file.originalname,
      folder: '/products'
    });

    const imageUrl = uploadResponse.url;

    const product = new Product({ name, description, category, weight, price, oldPrice, quantity, image: imageUrl });
    await product.save();

    res.status(201).json({ message: 'Product created successfully', product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ Get All Products
const getProducts = async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ Get Single Product
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ Update Product
const updateProduct = async (req, res) => {
  try {
    const { name, description, category, weight, price, oldPrice, quantity } = req.body;
    const updateData = { name, description, category, weight, price, oldPrice, quantity };

    if (req.file) {
      const uploadResponse = await imagekit.upload({
        file: req.file.buffer.toString('base64'),
        fileName: req.file.originalname,
        folder: '/products'
      });
      updateData.image = uploadResponse.url;
    }

    const product = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    res.json({ message: 'Product updated successfully', product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ Delete Product
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct
};