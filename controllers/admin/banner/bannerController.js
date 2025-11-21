const Banner = require('../../../models/banner');
const imagekit = require('../../../utils/imagekit');

// @desc    Get all banners
// @route   GET /api/banners
// @access  Public
const getBanners = async (req, res) => {
  try {
    const { active } = req.query;
    
    let query = {};
    if (active === 'true') {
      query.isActive = true;
    }
    
    const banners = await Banner.find(query)
      .sort({ order: 1, createdAt: -1 })
      .select('-__v');
    
    res.json({
      success: true,
      count: banners.length,
      data: banners
    });
  } catch (error) {
    console.error('Get banners error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching banners',
      error: error.message
    });
  }
};

// @desc    Get single banner
// @route   GET /api/banners/:id
// @access  Public
const getBanner = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id).select('-__v');
    
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }
    
    res.json({
      success: true,
      data: banner
    });
  } catch (error) {
    console.error('Get banner error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while fetching banner',
      error: error.message
    });
  }
};

// @desc    Create new banner
// @route   POST /api/banners
// @access  Private/Admin
const createBanner = async (req, res) => {
  try {
    const {
      title,
      subtitle,
      description,
      cta,
      ctaColor,
      gradient,
      accentColor,
      isActive,
      order
    } = req.body;

    // Validate required fields
    const requiredFields = [
      'title', 'subtitle', 'description', 
      'cta', 'ctaColor', 'gradient', 'accentColor'
    ];
    
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Check if image file is provided
    if (!req.files || !req.files.image) {
      return res.status(400).json({
        success: false,
        message: 'Banner image is required'
      });
    }

    let imageUrl = '';
    let fallbackImageUrl = '';

    try {
      // Upload main image to ImageKit
      const imageFile = req.files.image[0];
      const imageUploadResult = await imagekit.upload({
        file: imageFile.buffer,
        fileName: `banner_${Date.now()}_${imageFile.originalname}`,
        folder: '/banners'
      });
      imageUrl = imageUploadResult.url;

      // Upload fallback image if provided, otherwise use main image
      if (req.files.fallbackImage && req.files.fallbackImage[0]) {
        const fallbackFile = req.files.fallbackImage[0];
        const fallbackUploadResult = await imagekit.upload({
          file: fallbackFile.buffer,
          fileName: `banner_fallback_${Date.now()}_${fallbackFile.originalname}`,
          folder: '/banners'
        });
        fallbackImageUrl = fallbackUploadResult.url;
      } else {
        fallbackImageUrl = imageUrl; // Use main image as fallback
      }
    } catch (uploadError) {
      console.error('Image upload error:', uploadError);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload images',
        error: uploadError.message
      });
    }

    const banner = new Banner({
      title,
      subtitle,
      description,
      image: imageUrl,
      fallbackImage: fallbackImageUrl,
      cta,
      ctaColor,
      gradient,
      accentColor,
      isActive: isActive !== undefined ? isActive : true,
      order: order || 0
    });

    const createdBanner = await banner.save();
    
    res.status(201).json({
      success: true,
      message: 'Banner created successfully',
      data: createdBanner
    });
  } catch (error) {
    console.error('Create banner error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while creating banner',
      error: error.message
    });
  }
};

// @desc    Update banner
// @route   PUT /api/banners/:id
// @access  Private/Admin
const updateBanner = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }

    const updateData = { ...req.body };

    // Handle image upload if new image is provided
    if (req.files && req.files.image && req.files.image[0]) {
      try {
        const imageFile = req.files.image[0];
        const imageUploadResult = await imagekit.upload({
          file: imageFile.buffer,
          fileName: `banner_${Date.now()}_${imageFile.originalname}`,
          folder: '/banners'
        });
        updateData.image = imageUploadResult.url;
      } catch (uploadError) {
        console.error('Image upload error:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload image',
          error: uploadError.message
        });
      }
    }

    // Handle fallback image upload if provided
    if (req.files && req.files.fallbackImage && req.files.fallbackImage[0]) {
      try {
        const fallbackFile = req.files.fallbackImage[0];
        const fallbackUploadResult = await imagekit.upload({
          file: fallbackFile.buffer,
          fileName: `banner_fallback_${Date.now()}_${fallbackFile.originalname}`,
          folder: '/banners'
        });
        updateData.fallbackImage = fallbackUploadResult.url;
      } catch (uploadError) {
        console.error('Fallback image upload error:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload fallback image',
          error: uploadError.message
        });
      }
    }

    const updatedBanner = await Banner.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-__v');

    res.json({
      success: true,
      message: 'Banner updated successfully',
      data: updatedBanner
    });
  } catch (error) {
    console.error('Update banner error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while updating banner',
      error: error.message
    });
  }
};

// @desc    Delete banner
// @route   DELETE /api/banners/:id
// @access  Private/Admin
const deleteBanner = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }

    await Banner.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Banner deleted successfully'
    });
  } catch (error) {
    console.error('Delete banner error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while deleting banner',
      error: error.message
    });
  }
};

// @desc    Bulk update banner order
// @route   PUT /api/banners/update-order
// @access  Private/Admin
const updateBannerOrder = async (req, res) => {
  try {
    const { banners } = req.body;
    
    if (!Array.isArray(banners)) {
      return res.status(400).json({
        success: false,
        message: 'Banners array is required'
      });
    }

    const bulkOperations = banners.map(banner => ({
      updateOne: {
        filter: { _id: banner.id },
        update: { $set: { order: banner.order } }
      }
    }));

    await Banner.bulkWrite(bulkOperations);
    
    res.json({
      success: true,
      message: 'Banner order updated successfully'
    });
  } catch (error) {
    console.error('Update banner order error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating banner order',
      error: error.message
    });
  }
};

module.exports = {
  getBanners,
  getBanner,
  createBanner,
  updateBanner,
  deleteBanner,
  updateBannerOrder
};