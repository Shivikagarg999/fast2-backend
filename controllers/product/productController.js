const {Product} = require('../../models/product');
const imagekit = require('../../utils/imagekit'); 
const fs = require('fs');
const Category = require('../../models/category');

//Create Product
const createProduct = async (req, res) => {
  try {
    const { name, description, category, weight, price, oldPrice, quantity } = req.body;

    // Check required fields
    if (!req.file) return res.status(400).json({ message: 'Image is required' });

    // Validate category ID
    const foundCategory = await Category.findById(category); 
    if (!foundCategory) return res.status(404).json({ message: 'Category not found' });

    // Upload image to ImageKit
    const uploadedImage = await imagekit.upload({
      file: req.file.buffer.toString('base64'),
      fileName: `product_${Date.now()}.jpg`
    });

    const product = new Product({
      name,
      description,
      category: foundCategory._id, 
      weight,
      price,
      oldPrice: oldPrice || 0,
      quantity: quantity || 1,
      image: uploadedImage.url
    });

    await product.save();
    res.status(201).json({ message: 'Product created', product });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

//Get All Products
const getProducts = async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

//Get Single Product
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

//Update Product
const updateProduct = async (req, res) => {
  try {
    const { name, description, category, weight, price, oldPrice, quantity } = req.body;

    // Validate category ID if provided
    if (category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) return res.status(404).json({ message: 'Category not found' });
    }

    const updateData = { name, description, category, weight, price, oldPrice, quantity };

    // Remove undefined fields so they don't overwrite existing values
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    // Handle image update
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
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

// Get Products by Category ID
const getProductsByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    // Check if category exists
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Find products with that category
    const products = await Product.find({ category: categoryId });

    res.json({ category: category.name, products });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

//Delete Product
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
  deleteProduct,
  getProductsByCategory
};