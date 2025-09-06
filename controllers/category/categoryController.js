const Category = require('../../models/category');
const imagekit = require('../../utils/imagekit');

// Create Category
exports.createCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!req.file) return res.status(400).json({ message: 'Image is required' });

    const uploadedImage = await imagekit.upload({
      file: req.file.buffer.toString('base64'),
      fileName: `category_${Date.now()}.jpg`
    });

    const category = new Category({
      name,
      image: uploadedImage.url
    });

    await category.save();
    res.status(201).json({ message: 'Category created', category });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

// Get all categories
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get category by ID
exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update category
exports.updateCategory = async (req, res) => {
  try {
    const { name } = req.body;
    const updateData = { name };

    if (req.file) {
      const uploadedImage = await imagekit.upload({
        file: req.file.buffer.toString('base64'),
        fileName: `category_${Date.now()}.jpg`
      });
      updateData.image = uploadedImage.url;
    }

    const category = await Category.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!category) return res.status(404).json({ message: 'Category not found' });

    res.json({ message: 'Category updated', category });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete category
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.json({ message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};