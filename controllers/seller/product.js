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

    if (productData.dimensions && typeof productData.dimensions === 'string') {
      try {
        productData.dimensions = JSON.parse(productData.dimensions);
      } catch (error) {
        console.error('Error parsing dimensions:', error);
      }
    }

    let parsedAvailablePincodes = [];
    if (productData.availablePincodes) {
      try {
        parsedAvailablePincodes = typeof productData.availablePincodes === 'string' ? 
          JSON.parse(productData.availablePincodes) : productData.availablePincodes;
      } catch (error) {
        console.error('Error parsing availablePincodes:', error);
      }
    }

    let parsedServiceablePincodes = [];
    if (productData.serviceablePincodes) {
      try {
        parsedServiceablePincodes = typeof productData.serviceablePincodes === 'string' ?
          JSON.parse(productData.serviceablePincodes) : productData.serviceablePincodes;
        if (!Array.isArray(parsedServiceablePincodes)) parsedServiceablePincodes = [];
      } catch (error) {
        console.error('Error parsing serviceablePincodes:', error);
        parsedServiceablePincodes = [];
      }
    }

    let parsedVariants = [];
    if (productData.variants) {
      try {
        parsedVariants = typeof productData.variants === 'string' ?
          JSON.parse(productData.variants) : productData.variants;
        if (!Array.isArray(parsedVariants)) parsedVariants = [];
      } catch (error) {
        console.error('Error parsing variants:', error);
      }
    }

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

    let categoryId = productData.category;
    if (productData.category && typeof productData.category === 'string') {
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(productData.category);
      
      if (!isObjectId) {
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

    const foundCategory = await Category.findById(categoryId);
    const productTaxInfo = {
      hsnCode: productData.hsnCode || foundCategory?.hsnCode,
      gstPercent: productData.gstPercent !== undefined ? productData.gstPercent : foundCategory?.gstPercent,
      taxType: productData.taxType || foundCategory?.taxType
    };

    const stockStatus = productData.quantity > 0 ? 'in-stock' : 'out-of-stock';
    const promotorCommission = seller.promotor?.commissionRate || 5;
    const commissionType = seller.promotor?.commissionType || 'percentage';
    
    let commissionAmount = 0;
    if (commissionType === 'percentage') {
      commissionAmount = (productData.price * promotorCommission) / 100;
    } else {
      commissionAmount = promotorCommission;
    }

    const discountPercentage = productData.oldPrice > 0 ? 
      Math.round(((productData.oldPrice - productData.price) / productData.oldPrice) * 100) : 0;

    const imagekit = require('../../utils/imagekit');
    let uploadedImages = [];
    
    if (req.files && req.files.length > 0) {
      console.log('Uploading images to ImageKit...');
      
      for (let i = 0; i < req.files.length; i++) {
        const imageFile = req.files[i];
        
        try {
          const uploadedImage = await imagekit.upload({
            file: imageFile.buffer.toString('base64'),
            fileName: `product_${sellerId}_${Date.now()}_${i}.jpg`,
            folder: '/seller-products/images'
          });
          
          console.log(`Image ${i} uploaded:`, uploadedImage.url);
          
          uploadedImages.push({
            url: uploadedImage.url,
            altText: productData.imageAltText || `${productData.name} - Image ${i + 1}`,
            isPrimary: i === 0,
            order: i
          });
          
        } catch (imageError) {
          console.error(`Error uploading image ${i}:`, imageError);
        }
      }
    }
    
    console.log('Final images array:', uploadedImages);

    const newProduct = new Product({
      name: productData.name,
      description: productData.description,
      brand: productData.brand,
      category: categoryId,
      price: productData.price,
      oldPrice: productData.oldPrice || 0,
      discountPercentage: discountPercentage,
      hsnCode: productTaxInfo.hsnCode,
      gstPercent: productTaxInfo.gstPercent,
      taxType: productTaxInfo.taxType,
      unit: productData.unit,
      unitValue: productData.unitValue,
      promotor: {
        id: seller.promotor?._id,
        commissionRate: promotorCommission,
        commissionType: commissionType,
        commissionAmount: commissionAmount
      },
      seller: sellerId,
      quantity: productData.quantity || 0,
      minOrderQuantity: productData.minOrderQuantity || 1,
      maxOrderQuantity: productData.maxOrderQuantity || 10,
      stockStatus: stockStatus,
      lowStockThreshold: productData.lowStockThreshold || 10,
      weight: productData.weight,
      weightUnit: productData.weightUnit || 'g',
      dimensions: productData.dimensions,
      images: uploadedImages,
      delivery: {
        estimatedDeliveryTime: productData.estimatedDeliveryTime,
        deliveryCharges: productData.deliveryCharges || 0,
        freeDeliveryThreshold: productData.freeDeliveryThreshold || 0,
        availablePincodes: parsedAvailablePincodes
      },
      serviceablePincodes: parsedServiceablePincodes,
      variants: parsedVariants,
      isActive: true
    });

    await newProduct.save();

    seller.products.push(newProduct._id);
    await seller.save();

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

exports.updateProduct = async (req, res) => {
  try {
    const sellerId = req.seller.id;
    const { productId } = req.params;
    const updateData = req.body;

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

    if (updateData.availablePincodes) {
      try {
        updateData['delivery.availablePincodes'] = JSON.parse(updateData.availablePincodes);
      } catch (error) {
        console.error('Error parsing availablePincodes:', error);
      }
    }

    if (updateData.serviceablePincodes) {
      try {
        const parsedServiceablePincodes = JSON.parse(updateData.serviceablePincodes);
        if (Array.isArray(parsedServiceablePincodes)) {
          updateData.serviceablePincodes = parsedServiceablePincodes;
        }
      } catch (error) {
        console.error('Error parsing serviceablePincodes:', error);
      }
    }

    if (updateData.variants) {
      try {
        const parsedVariants = JSON.parse(updateData.variants);
        updateData.variants = Array.isArray(parsedVariants) ? parsedVariants : [];
      } catch (error) {
        console.error('Error parsing variants:', error);
      }
    }

    const product = await Product.findOne({ _id: productId });
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (updateData.quantity !== undefined) {
      updateData.stockStatus = updateData.quantity > 0 ? 'in-stock' : 'out-of-stock';
      
      const warehouse = await Warehouse.findOne({ sellers: sellerId });
      if (warehouse) {
        const stockDifference = updateData.quantity - product.quantity;
        warehouse.currentStock += stockDifference;
        await warehouse.save();
      }
    }

    if (updateData.oldPrice !== undefined && updateData.price !== undefined) {
      updateData.discountPercentage = updateData.oldPrice > 0 ? 
        Math.round(((updateData.oldPrice - updateData.price) / updateData.oldPrice) * 100) : 0;
    }

    if (updateData.estimatedDeliveryTime) updateData['delivery.estimatedDeliveryTime'] = updateData.estimatedDeliveryTime;
    if (updateData.deliveryCharges !== undefined) updateData['delivery.deliveryCharges'] = updateData.deliveryCharges;
    if (updateData.freeDeliveryThreshold !== undefined) updateData['delivery.freeDeliveryThreshold'] = updateData.freeDeliveryThreshold;

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