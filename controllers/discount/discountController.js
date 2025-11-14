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
    
    const populatedDiscount = await Discount.findById(discount._id)
      .populate('category', 'name')
      .populate('products', 'name price');
    
    res.status(201).json({ 
      success: true,
      message: "Discount created successfully.", 
      discount: populatedDiscount 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false,
      message: "Something went wrong.",
      error: error.message 
    });
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

    res.status(200).json({ 
      success: true,
      count: discounts.length, 
      discounts 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false,
      message: "Something went wrong.",
      error: error.message 
    });
  }
};

exports.getAllDiscounts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } }
      ];
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const discounts = await Discount.find(filter)
      .populate('category', 'name')
      .populate('products', 'name price')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Discount.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: discounts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalDiscounts: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get all discounts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching discounts',
      error: error.message
    });
  }
};

exports.getDiscountById = async (req, res) => {
  try {
    const { id } = req.params;

    const discount = await Discount.findById(id)
      .populate('category', 'name')
      .populate('products', 'name price');

    if (!discount) {
      return res.status(404).json({
        success: false,
        message: 'Discount not found'
      });
    }

    res.status(200).json({
      success: true,
      data: discount
    });

  } catch (error) {
    console.error('Get discount by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching discount',
      error: error.message
    });
  }
};

exports.updateDiscount = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const discount = await Discount.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
    .populate('category', 'name')
    .populate('products', 'name price');

    if (!discount) {
      return res.status(404).json({
        success: false,
        message: 'Discount not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Discount updated successfully',
      data: discount
    });

  } catch (error) {
    console.error('Update discount error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating discount',
      error: error.message
    });
  }
};

exports.deleteDiscount = async (req, res) => {
  try {
    const { id } = req.params;

    const discount = await Discount.findByIdAndDelete(id);

    if (!discount) {
      return res.status(404).json({
        success: false,
        message: 'Discount not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Discount deleted successfully'
    });

  } catch (error) {
    console.error('Delete discount error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting discount',
      error: error.message
    });
  }
};

exports.toggleDiscountStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const discount = await Discount.findById(id);
    if (!discount) {
      return res.status(404).json({
        success: false,
        message: 'Discount not found'
      });
    }

    discount.isActive = isActive !== undefined ? isActive : !discount.isActive;
    await discount.save();

    const updatedDiscount = await Discount.findById(id)
      .populate('category', 'name')
      .populate('products', 'name price');

    res.status(200).json({
      success: true,
      message: `Discount ${discount.isActive ? 'activated' : 'deactivated'} successfully`,
      data: updatedDiscount
    });

  } catch (error) {
    console.error('Toggle discount status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating discount status',
      error: error.message
    });
  }
};