const { Product } = require('../../models/product');
const imagekit = require('../../utils/imagekit');
const fs = require('fs');
const Category = require('../../models/category');
const Promotor = require('../../models/promotor'); 

// Create Product
const createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      brand,
      category,
      price,
      oldPrice,
      unit,
      unitValue,
      promotor,
      commissionRate,
      commissionType,
      quantity,
      minOrderQuantity,
      maxOrderQuantity,
      weight,
      weightUnit,
      dimensions,
      warehouseId,
      storageType,
      estimatedDeliveryTime,
      deliveryCharges,
      freeDeliveryThreshold,
      availablePincodes
    } = req.body;

    // Check required fields
    if (!req.file) return res.status(400).json({ message: 'Image is required' });

    // Validate category ID
    const foundCategory = await Category.findById(category);
    if (!foundCategory) return res.status(404).json({ message: 'Category not found' });

    // Validate promotor ID
    const foundPromotor = await Promotor.findById(promotor);
    if (!foundPromotor) return res.status(404).json({ message: 'Promotor not found' });

    // Upload image to ImageKit
    const uploadedImage = await imagekit.upload({
      file: req.file.buffer.toString('base64'),
      fileName: `product_${Date.now()}.jpg`,
      folder: '/products'
    });

    // Parse dimensions if provided
    let parsedDimensions = {};
    if (dimensions) {
      try {
        parsedDimensions = JSON.parse(dimensions);
      } catch (error) {
        console.error('Error parsing dimensions:', error);
      }
    }

    // Parse available pincodes if provided
    let parsedPincodes = [];
    if (availablePincodes) {
      try {
        parsedPincodes = JSON.parse(availablePincodes);
      } catch (error) {
        console.error('Error parsing pincodes:', error);
      }
    }

    const product = new Product({
      name,
      description,
      brand,
      category: foundCategory._id,
      price,
      oldPrice: oldPrice || 0,
      discountPercentage: oldPrice > 0 ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0,
      unit,
      unitValue,
      promotor: {
        id: foundPromotor._id,
        commissionRate,
        commissionType,
        commissionAmount: commissionType === 'percentage' ? (price * commissionRate) / 100 : commissionRate
      },
      quantity: quantity || 0,
      minOrderQuantity: minOrderQuantity || 1,
      maxOrderQuantity: maxOrderQuantity || 10,
      stockStatus: quantity > 0 ? 'in-stock' : 'out-of-stock',
      lowStockThreshold: 10,
      weight,
      weightUnit: weightUnit || 'g',
      dimensions: parsedDimensions,
      warehouse: {
        id: warehouseId || null
      },
      images: [{
        url: uploadedImage.url,
        altText: name,
        isPrimary: true
      }],
      delivery: {
        estimatedDeliveryTime,
        deliveryCharges: deliveryCharges || 0,
        freeDeliveryThreshold: freeDeliveryThreshold || 0,
        availablePincodes: parsedPincodes
      }
    });

    await product.save();
    res.status(201).json({ message: 'Product created', product });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

// Get All Products
const getProducts = async (req, res) => {
  try {
    const products = await Product.find()
      .populate('category')
      .populate('promotor.id');
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Single Product
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category')
      .populate('promotor.id');
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update Product
const updateProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      brand,
      category,
      price,
      oldPrice,
      unit,
      unitValue,
      promotor,
      commissionRate,
      commissionType,
      quantity,
      minOrderQuantity,
      maxOrderQuantity,
      weight,
      weightUnit,
      dimensions,
      warehouseId,
      storageType,
      estimatedDeliveryTime,
      deliveryCharges,
      freeDeliveryThreshold,
      availablePincodes
    } = req.body;

    // Validate category ID if provided
    if (category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) return res.status(404).json({ message: 'Category not found' });
    }

    // Validate promotor ID if provided
    if (promotor) {
      const promotorExists = await Promotor.findById(promotor);
      if (!promotorExists) return res.status(404).json({ message: 'Promotor not found' });
    }

    const updateData = {
      name,
      description,
      brand,
      category,
      price,
      oldPrice,
      unit,
      unitValue,
      quantity,
      minOrderQuantity,
      maxOrderQuantity,
      weight,
      weightUnit,
      'warehouse.id': warehouseId
    };

    // Parse dimensions if provided
    if (dimensions) {
      try {
        updateData.dimensions = JSON.parse(dimensions);
      } catch (error) {
        console.error('Error parsing dimensions:', error);
      }
    }

    // Parse available pincodes if provided
    if (availablePincodes) {
      try {
        updateData['delivery.availablePincodes'] = JSON.parse(availablePincodes);
      } catch (error) {
        console.error('Error parsing pincodes:', error);
      }
    }

    // Update delivery information if provided
    if (estimatedDeliveryTime) updateData['delivery.estimatedDeliveryTime'] = estimatedDeliveryTime;
    if (deliveryCharges !== undefined) updateData['delivery.deliveryCharges'] = deliveryCharges;
    if (freeDeliveryThreshold !== undefined) updateData['delivery.freeDeliveryThreshold'] = freeDeliveryThreshold;

    // Update promotor information if provided
    if (promotor) updateData['promotor.id'] = promotor;
    if (commissionRate !== undefined) updateData['promotor.commissionRate'] = commissionRate;
    if (commissionType) updateData['promotor.commissionType'] = commissionType;

    // Calculate discount percentage if oldPrice is provided
    if (oldPrice !== undefined && price !== undefined) {
      updateData.discountPercentage = oldPrice > 0 ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
    }

    // Remove undefined fields so they don't overwrite existing values
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    // Handle image update
    if (req.file) {
      const uploadResponse = await imagekit.upload({
        file: req.file.buffer.toString('base64'),
        fileName: req.file.originalname,
        folder: '/products'
      });
      
      // Add new image and set as primary
      updateData.$push = {
        images: {
          url: uploadResponse.url,
          altText: name || '',
          isPrimary: true
        }
      };
      
      // Set all other images as not primary
      updateData.$set = { 
        ...updateData.$set,
        'images.$[].isPrimary': false 
      };
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('category').populate('promotor.id');
    
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
    const products = await Product.find({ category: categoryId })
      .populate('category')
      .populate('promotor.id');

    res.json({ category: category.name, products });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

// Delete Product
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