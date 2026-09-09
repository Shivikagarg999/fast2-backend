const Subcategory = require('../../models/subcategory');
const Category = require('../../models/category');
const imagekit = require('../../utils/imagekit');

// Create Subcategory
exports.createSubcategory = async (req, res) => {
  try {
    const {
      name,
      category,
      isActive,
      sortOrder
    } = req.body;

    if (!category) return res.status(400).json({ message: 'Category is required' });

    const parentCategory = await Category.findById(category);
    if (!parentCategory) return res.status(400).json({ message: 'Category not found' });

    if (!req.file) return res.status(400).json({ message: 'Image is required' });

    const uploadedImage = await imagekit.upload({
      file: req.file.buffer.toString('base64'),
      fileName: `subcategory_${Date.now()}.jpg`
    });

    const subcategory = new Subcategory({
      name,
      category,
      image: uploadedImage.url,
      isActive,
      sortOrder
    });

    await subcategory.save();
    res.status(201).json({ message: 'Subcategory created', subcategory });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

// Get all subcategories.
// `category` query param filters to that category's subcategories.
// `isActive` follows the same convention as getCategories: omitted -> active-only
// (storefront default), 'true'/'false' explicit, 'all' -> everything (admin).
exports.getSubcategories = async (req, res) => {
  try {
    const { category, isActive } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (isActive === 'true') filter.isActive = true;
    else if (isActive === 'false') filter.isActive = false;
    else if (isActive === undefined) filter.isActive = true;

    const subcategories = await Subcategory.find(filter)
      .populate('category')
      .sort({ sortOrder: 1, name: 1 });
    res.json(subcategories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get subcategory by ID. Same visibility rule as getCategoryById - only
// active subcategories are reachable by direct link on the storefront.
exports.getSubcategoryById = async (req, res) => {
  try {
    const subcategory = await Subcategory.findById(req.params.id).populate('category');
    if (!subcategory || !subcategory.isActive) return res.status(404).json({ message: 'Subcategory not found' });
    res.json(subcategory);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update subcategory
exports.updateSubcategory = async (req, res) => {
  try {
    const {
      name,
      category,
      isActive,
      sortOrder
    } = req.body;

    if (category) {
      const parentCategory = await Category.findById(category);
      if (!parentCategory) return res.status(400).json({ message: 'Category not found' });
    }

    const updateData = {
      name,
      category,
      isActive,
      sortOrder
    };

    Object.keys(updateData).forEach(
      key => updateData[key] === undefined && delete updateData[key]
    );

    if (req.file) {
      const uploadedImage = await imagekit.upload({
        file: req.file.buffer.toString('base64'),
        fileName: `subcategory_${Date.now()}.jpg`
      });
      updateData.image = uploadedImage.url;
    }

    if (!updateData.image) {
      const existingSubcategory = await Subcategory.findById(req.params.id);
      if (!existingSubcategory?.image) {
        updateData.isActive = false;
      }
    }

    const subcategory = await Subcategory.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('category');

    if (!subcategory) return res.status(404).json({ message: 'Subcategory not found' });

    res.json({ message: 'Subcategory updated', subcategory });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete subcategory
exports.deleteSubcategory = async (req, res) => {
  try {
    const subcategory = await Subcategory.findByIdAndDelete(req.params.id);
    if (!subcategory) return res.status(404).json({ message: 'Subcategory not found' });
    res.json({ message: 'Subcategory deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Bulk delete by explicit ID list
exports.bulkDeleteSubcategories = async (req, res) => {
  try {
    const { subcategoryIds } = req.body;
    if (!Array.isArray(subcategoryIds) || subcategoryIds.length === 0) {
      return res.status(400).json({ success: false, message: 'subcategoryIds array is required' });
    }

    let deletedCount = 0;
    const errors = [];

    for (const subcategoryId of subcategoryIds) {
      try {
        const subcategory = await Subcategory.findByIdAndDelete(subcategoryId);
        if (!subcategory) {
          errors.push(`Subcategory ${subcategoryId} not found`);
          continue;
        }
        deletedCount++;
      } catch (error) {
        errors.push(`Subcategory ${subcategoryId}: ${error.message}`);
      }
    }

    res.json({
      success: true,
      message: `Deleted ${deletedCount} of ${subcategoryIds.length} subcategories`,
      deletedCount,
      errors: errors.length > 0 ? errors : null
    });
  } catch (error) {
    console.error('Bulk delete subcategories error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during bulk delete',
      error: error.message
    });
  }
};
