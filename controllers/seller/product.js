const Seller = require('../../models/seller');
const Product = require('../../models/product');
const Warehouse = require('../../models/warehouse');
const Promotor = require('../../models/promotor');
const Category = require('../../models/category');
const Order = require('../../models/order');
const mongoose = require('mongoose');

exports.addProduct = async (req, res) => {
  try {
    const sellerId = req.seller.id;
    const productData = req.body;

    // Parse JSON fields if they are strings
    if (productData.dimensions && typeof productData.dimensions === 'string') {
      try {
        productData.dimensions = JSON.parse(productData.dimensions);
      } catch (error) {
        console.error('Error parsing dimensions:', error);
      }
    }

    if (productData.features && typeof productData.features === 'string') {
      try {
        productData.features = JSON.parse(productData.features);
      } catch (error) {
        console.error('Error parsing features:', error);
      }
    }

    if (productData.tags && typeof productData.tags === 'string') {
      try {
        productData.tags = JSON.parse(productData.tags);
      } catch (error) {
        console.error('Error parsing tags:', error);
      }
    }

    if (productData.serviceablePincodes && typeof productData.serviceablePincodes === 'string') {
      try {
        productData.serviceablePincodes = JSON.parse(productData.serviceablePincodes);
      } catch (error) {
        console.error('Error parsing serviceablePincodes:', error);
        productData.serviceablePincodes = [];
      }
    }

    // Fetch seller with promotor populated
    const seller = await Seller.findById(sellerId).populate('promotor');
    
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }

    if (seller.approvalStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Your account is not approved yet'
      });
    }

    // Fetch warehouse from request body or find warehouse that contains this seller
    let warehouse;
    if (productData.warehouseId) {
      warehouse = await Warehouse.findById(productData.warehouseId);
      if (!warehouse) {
        return res.status(404).json({
          success: false,
          message: 'Warehouse not found'
        });
      }
      
      
    } else {
      // Find warehouse that contains this seller
      warehouse = await Warehouse.findOne({ sellers: sellerId });
      if (!warehouse) {
        return res.status(404).json({
          success: false,
          message: 'No warehouse found for this seller'
        });
      }
    }

    // Find category by name and convert to ObjectId
    let categoryId = productData.category;
    if (productData.category && typeof productData.category === 'string') {
      // Check if it's already an ObjectId or a category name
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(productData.category);
      
      if (!isObjectId) {
        // It's a category name, find the category
        const category = await Category.findOne({ name: productData.category });
        if (!category) {
          return res.status(404).json({
            success: false,
            message: `Category '${productData.category}' not found`
          });
        }
        categoryId = category._id;
      }
    }

    const stockStatus = productData.quantity > 0 ? 'in-stock' : 'out-of-stock';

    const promotorCommission = seller.promotor?.commissionRate || 5;
    const commissionType = seller.promotor?.commissionType || 'percentage';
    
    let commissionAmount = 0;
    if (commissionType === 'percentage') {
      commissionAmount = (productData.price * promotorCommission) / 100;
    } else {
      commissionAmount = promotorCommission;
    }

    const newProduct = new Product({
      ...productData,
      category: categoryId,
      stockStatus,
      promotor: {
        id: seller.promotor?._id,
        commissionRate: promotorCommission,
        commissionType: commissionType,
        commissionAmount: commissionAmount
      },
      warehouse: {
        id: warehouse._id,
        code: warehouse.code,
        storageType: productData.storageType || warehouse.storageType
      },
      isActive: true
    });

    await newProduct.save();

    // Add product to seller's products array
    seller.products.push(newProduct._id);
    await seller.save();

    // Add product to warehouse's products array and update stock
    warehouse.products.push(newProduct._id);
    warehouse.currentStock += productData.quantity || 0;
    await warehouse.save();

    // Update promotor stats if promotor exists
    if (seller.promotor?._id) {
      await Promotor.findByIdAndUpdate(
        seller.promotor._id,
        { $inc: { totalProductsAdded: 1 } }
      );
    }

    res.status(201).json({
      success: true,
      message: 'Product added successfully',
      data: newProduct
    });

  } catch (error) {
    console.error('Add product error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding product',
      error: error.message
    });
  }
};

exports.getSellerProducts = async (req, res) => {
  try {
    const sellerId = req.seller.id;
    const {
      page = 1,
      limit = 10,
      search = '',
      category,
      stockStatus,
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Get seller's product IDs
    const seller = await Seller.findById(sellerId).select('products');
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }

    const productIds = seller.products || [];

    // Build filter using product IDs
    const filter = { _id: { $in: productIds } };
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } }
      ];
    }
    if (category) {
      filter.category = category;
    }

    if (stockStatus) {
      filter.stockStatus = stockStatus;
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const products = await Product.find(filter)
      .populate('category', 'name')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await Product.countDocuments(filter);

    // Get sales and earnings data for each product
    const salesData = await Order.aggregate([
      { $unwind: '$items' },
      { 
        $match: { 
          'items.product': { $in: productIds.map(id => new mongoose.Types.ObjectId(id)) },
          status: { $in: ['confirmed', 'picked-up', 'delivered'] } // Only count confirmed and delivered orders
        } 
      },
      {
        $group: {
          _id: '$items.product',
          totalSales: { $sum: '$items.quantity' },
          totalEarnings: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          orderCount: { $sum: 1 }
        }
      }
    ]);

    // Create a map of product sales data
    const salesMap = {};
    salesData.forEach(item => {
      salesMap[item._id.toString()] = {
        totalSales: item.totalSales,
        totalEarnings: item.totalEarnings,
        orderCount: item.orderCount
      };
    });

    // Add sales and earnings data to each product
    const productsWithSales = products.map(product => ({
      ...product,
      sales: salesMap[product._id.toString()]?.totalSales || 0,
      earnings: salesMap[product._id.toString()]?.totalEarnings || 0,
      orderCount: salesMap[product._id.toString()]?.orderCount || 0
    }));

    const stats = await Product.aggregate([
      { $match: { _id: { $in: productIds.map(id => new mongoose.Types.ObjectId(id)) } } },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          activeProducts: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
          outOfStock: { $sum: { $cond: [{ $eq: ['$stockStatus', 'out-of-stock'] }, 1, 0] } },
          totalValue: { $sum: { $multiply: ['$price', '$quantity'] } }
        }
      }
    ]);

    // Calculate total sales and earnings across all products
    const totalSalesEarnings = salesData.reduce((acc, item) => {
      acc.totalSales += item.totalSales;
      acc.totalEarnings += item.totalEarnings;
      return acc;
    }, { totalSales: 0, totalEarnings: 0 });

    res.status(200).json({
      success: true,
      data: productsWithSales,
      stats: {
        ...(stats[0] || {
          totalProducts: 0,
          activeProducts: 0,
          outOfStock: 0,
          totalValue: 0
        }),
        totalSales: totalSalesEarnings.totalSales,
        totalEarnings: totalSalesEarnings.totalEarnings
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalProducts: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get seller products error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: error.message
    });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const sellerId = req.seller.id;
    const { productId } = req.params;
    const updateData = req.body;

    // Parse JSON fields if they are strings
    if (updateData.dimensions && typeof updateData.dimensions === 'string') {
      try {
        updateData.dimensions = JSON.parse(updateData.dimensions);
      } catch (error) {
        console.error('Error parsing dimensions:', error);
      }
    }

    if (updateData.features && typeof updateData.features === 'string') {
      try {
        updateData.features = JSON.parse(updateData.features);
      } catch (error) {
        console.error('Error parsing features:', error);
      }
    }

    if (updateData.tags && typeof updateData.tags === 'string') {
      try {
        updateData.tags = JSON.parse(updateData.tags);
      } catch (error) {
        console.error('Error parsing tags:', error);
      }
    }

    if (updateData.serviceablePincodes && typeof updateData.serviceablePincodes === 'string') {
      try {
        updateData.serviceablePincodes = JSON.parse(updateData.serviceablePincodes);
      } catch (error) {
        console.error('Error parsing serviceablePincodes:', error);
      }
    }

    const product = await Product.findOne({ _id: productId, seller: sellerId });
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or access denied'
      });
    }

    if (updateData.quantity !== undefined) {
      updateData.stockStatus = updateData.quantity > 0 ? 'in-stock' : 'out-of-stock';
      
      const warehouse = await Warehouse.findOne({ seller: sellerId });
      if (warehouse) {
        const stockDifference = updateData.quantity - product.quantity;
        warehouse.currentStock += stockDifference;
        await warehouse.save();
      }
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('category', 'name');

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: updatedProduct
    });

  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating product',
      error: error.message
    });
  }
};

exports.toggleProductStatus = async (req, res) => {
  try {
    const sellerId = req.seller.id;
    const { productId } = req.params;

    const product = await Product.findOne({ _id: productId, seller: sellerId });
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or access denied'
      });
    }

    product.isActive = !product.isActive;
    await product.save();

    res.status(200).json({
      success: true,
      message: `Product ${product.isActive ? 'activated' : 'deactivated'} successfully`,
      data: product
    });

  } catch (error) {
    console.error('Toggle product status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating product status',
      error: error.message
    });
  }
};