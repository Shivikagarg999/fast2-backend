const HomeSection = require('../../../models/homeSection');
const imagekit = require('../../../utils/imagekit');

// @desc    Upload one image (section banner or a single tile's image) and get back its URL.
//          Kept as its own endpoint so the admin UI can upload each tile's image the
//          moment it's picked, instead of juggling a multipart array aligned to tiles.
// @route   POST /api/admin/home-sections/upload-image
exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Image file is required' });
    }
    const result = await imagekit.upload({
      file: req.file.buffer,
      fileName: `home_section_${Date.now()}_${req.file.originalname}`,
      folder: '/home-sections'
    });
    return res.status(201).json({ success: true, url: result.url });
  } catch (error) {
    console.error('Home section image upload error:', error);
    return res.status(500).json({ success: false, message: 'Failed to upload image' });
  }
};

exports.createHomeSection = async (req, res) => {
  try {
    const section = await HomeSection.create({
      ...req.body,
      createdBy: req.admin?._id
    });
    return res.status(201).json({ success: true, message: 'Section created', data: section });
  } catch (error) {
    console.error('Create home section error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: 'Failed to create section' });
  }
};

exports.updateHomeSection = async (req, res) => {
  try {
    const section = await HomeSection.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!section) {
      return res.status(404).json({ success: false, message: 'Section not found' });
    }
    return res.status(200).json({ success: true, message: 'Section updated', data: section });
  } catch (error) {
    console.error('Update home section error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: 'Failed to update section' });
  }
};

exports.deleteHomeSection = async (req, res) => {
  try {
    const section = await HomeSection.findByIdAndDelete(req.params.id);
    if (!section) {
      return res.status(404).json({ success: false, message: 'Section not found' });
    }
    return res.status(200).json({ success: true, message: 'Section deleted' });
  } catch (error) {
    console.error('Delete home section error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete section' });
  }
};

// @desc    Admin list — everything, including inactive/scheduled, for the management UI.
exports.getHomeSectionsAdmin = async (req, res) => {
  try {
    const sections = await HomeSection.find({})
      .sort({ order: 1, createdAt: -1 })
      .populate('productSource.manualProducts', 'name images price oldPrice')
      .populate('productSource.scheduledProducts.product', 'name images price oldPrice');
    return res.status(200).json({ success: true, data: sections });
  } catch (error) {
    console.error('Get home sections (admin) error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load sections' });
  }
};

// @desc    Reorder sections in bulk (drag-and-drop in the admin list).
exports.reorderHomeSections = async (req, res) => {
  try {
    const { sections } = req.body;
    if (!Array.isArray(sections)) {
      return res.status(400).json({ success: false, message: 'sections array is required' });
    }
    await HomeSection.bulkWrite(
      sections.map((s) => ({
        updateOne: { filter: { _id: s.id }, update: { $set: { order: s.order } } }
      }))
    );
    return res.status(200).json({ success: true, message: 'Order updated' });
  } catch (error) {
    console.error('Reorder home sections error:', error);
    return res.status(500).json({ success: false, message: 'Failed to reorder sections' });
  }
};
