const Category = require('../../models/category');
const imagekit = require('../../utils/imagekit');
const fs = require('fs');
const { parseCsv } = require('../../utils/csvParser');

// Create Category
exports.createCategory = async (req, res) => {
  try {
    const { 
      name,
      hsnCode,
      gstPercent,
      taxType,
      defaultUOM,
      isActive,
      sortOrder
    } = req.body;

    if (!req.file) return res.status(400).json({ message: 'Image is required' });

    const uploadedImage = await imagekit.upload({
      file: req.file.buffer.toString('base64'),
      fileName: `category_${Date.now()}.jpg`
    });

    const category = new Category({
      name,
      image: uploadedImage.url,
      hsnCode,
      gstPercent,
      taxType,
      defaultUOM,
      isActive,
      sortOrder
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
    const categories = await Category.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
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
    const { 
      name,
      hsnCode,
      gstPercent,
      taxType,
      defaultUOM,
      isActive,
      sortOrder
    } = req.body;

    const updateData = {
      name,
      hsnCode,
      gstPercent,
      taxType,
      defaultUOM,
      isActive,
      sortOrder
    };

    // Remove undefined fields (so they don't overwrite existing values)
    Object.keys(updateData).forEach(
      key => updateData[key] === undefined && delete updateData[key]
    );

    if (req.file) {
      const uploadedImage = await imagekit.upload({
        file: req.file.buffer.toString('base64'),
        fileName: `category_${Date.now()}.jpg`
      });
      updateData.image = uploadedImage.url;
    }

    const category = await Category.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

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

// Download a sample CSV template for bulk category upload
exports.downloadCategoryUploadTemplate = async (req, res) => {
  try {
    const templateHeaders = [
      'Category Name',
      'HSN Code',
      'GST Percent',
      'Tax Type',
      'Default UOM',
      'Sort Order',
      'Active Status',
      'Image URL'
    ];

    const templateRows = [
      ['"Atta, Rice & Dal"', '"1101"', '"5"', '"inclusive"', '"kg"', '"0"', '"Active"', '""'],
      ['"Fruits & Vegetables"', '"0709"', '"0"', '"inclusive"', '"kg"', '"10"', '"Active"', '""'],
      ['"Snacks & Namkeen"', '"2106"', '"12"', '"inclusive"', '"g"', '"20"', '"Active"', '""']
    ];

    const csvContent = [templateHeaders.join(','), ...templateRows.map(row => row.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="category_upload_template.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error('Download category template error:', error);
    res.status(500).json({ message: 'Server error generating template', error: error.message });
  }
};

// Bulk-create categories from an uploaded CSV. Existing categories (matched
// by exact, case-insensitive name) are skipped rather than overwritten, so
// re-running an import is safe.
exports.uploadCategoriesCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'CSV file is required' });
    }

    const csvFilePath = req.file.path;
    const csvContent = fs.readFileSync(csvFilePath, 'utf8');
    const { headers, rows } = parseCsv(csvContent);

    if (rows.length < 1) {
      fs.unlinkSync(csvFilePath);
      return res.status(400).json({ success: false, message: 'CSV file is empty or invalid' });
    }

    const expectedHeaders = [
      'Category Name',
      'HSN Code',
      'GST Percent',
      'Tax Type',
      'Default UOM',
      'Sort Order',
      'Active Status',
      'Image URL'
    ];

    const missingHeaders = expectedHeaders.filter(header =>
      !headers.some(h => h.toLowerCase() === header.toLowerCase())
    );

    if (missingHeaders.length > 0) {
      fs.unlinkSync(csvFilePath);
      return res.status(400).json({
        success: false,
        message: `Missing required columns: ${missingHeaders.join(', ')}`
      });
    }

    const getHeaderIndex = (headerName) =>
      headers.findIndex(h => h.toLowerCase() === headerName.toLowerCase());

    const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const created = [];
    const skipped = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const values = rows[i];
      const rowNumber = i + 2; // +1 for header row, +1 for 1-based numbering

      try {
        const name = values[getHeaderIndex('Category Name')];
        if (!name) {
          errors.push(`Row ${rowNumber}: Category Name is required`);
          continue;
        }

        const existing = await Category.findOne({
          name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' }
        });
        if (existing) {
          skipped.push(`Row ${rowNumber}: "${name}" already exists, skipped`);
          continue;
        }

        const imageUrl = values[getHeaderIndex('Image URL')] || null;

        const category = await Category.create({
          name,
          image: imageUrl,
          hsnCode: values[getHeaderIndex('HSN Code')] || '',
          gstPercent: parseFloat(values[getHeaderIndex('GST Percent')]) || 0,
          taxType: values[getHeaderIndex('Tax Type')] || 'inclusive',
          defaultUOM: values[getHeaderIndex('Default UOM')] || 'piece',
          isActive: values[getHeaderIndex('Active Status')]?.toLowerCase() !== 'inactive',
          sortOrder: parseInt(values[getHeaderIndex('Sort Order')]) || 0
        });

        created.push(category);
      } catch (error) {
        errors.push(`Row ${rowNumber}: ${error.message}`);
      }
    }

    fs.unlinkSync(csvFilePath);

    res.status(200).json({
      success: true,
      message: `Imported ${created.length} categories (${skipped.length} skipped, ${errors.length} errors)`,
      imported: created.length,
      skipped,
      errors: errors.length > 0 ? errors : null
    });
  } catch (error) {
    console.error('Upload categories CSV error:', error);

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: 'Server error during CSV import',
      error: error.message
    });
  }
};
