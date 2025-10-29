const { Seller } = require('../../models/seller');
const Product = require('../../models/product');
const Warehouse = require('../../models/warehouse');

exports.addProduct = async (req, res) => {
  try {
    const sellerId = req.seller.id;
    const productData = req.body;

    const seller = await Seller.findById(sellerId)
      .populate('promotor')
      .populate('warehouse');
    
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

    const stockStatus = productData.quantity > 0 ? 'in-stock' : 'out-of-stock';

    const promotorCommission = seller.promotor.commissionRate || 5;
    const commissionType = seller.promotor.commissionType || 'percentage';
    
    let commissionAmount = 0;
    if (commissionType === 'percentage') {
      commissionAmount = (productData.price * promotorCommission) / 100;
    } else {
      commissionAmount = promotorCommission;
    }

    const newProduct = new Product({
      ...productData,
      seller: sellerId,
      stockStatus,
      promotor: {
        id: seller.promotor._id,
        commissionRate: promotorCommission,
        commissionType: commissionType,
        commissionAmount: commissionAmount
      },
      warehouse: {
        id: seller.warehouse._id,
        code: seller.warehouse.code,
        storageType: seller.warehouse.storageType
      },
      isActive: true
    });

    await newProduct.save();

    seller.products.push(newProduct._id);
    await seller.save();

    seller.warehouse.products.push(newProduct._id);
    seller.warehouse.currentStock += productData.quantity || 0;
    await seller.warehouse.save();

    await Promotor.findByIdAndUpdate(
      seller.promotor._id,
      { $inc: { totalProductsAdded: 1 } }
    );

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

    const filter = { seller: sellerId };
    
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
      .skip((page - 1) * limit);

    const total = await Product.countDocuments(filter);

    const stats = await Product.aggregate([
      { $match: { seller: mongoose.Types.ObjectId(sellerId) } },
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

    res.status(200).json({
      success: true,
      data: products,
      stats: stats[0] || {
        totalProducts: 0,
        activeProducts: 0,
        outOfStock: 0,
        totalValue: 0
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