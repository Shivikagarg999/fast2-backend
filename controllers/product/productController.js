const imagekit = require('../../utils/imagekit');
const Category = require('../../models/category');
const Promotor = require('../../models/promotor'); 
const Product = require('../../models/product');

// Create Product with multiple images and video support
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
      availablePincodes,
      hsnCode,
      gstPercent,
      taxType,
      videoDuration,
      videoFileSize
    } = req.body;

    // Check required fields
    if (!req.files || !req.files.images) {
      return res.status(400).json({ message: 'At least one image is required' });
    }

    // Validate category
    const foundCategory = await Category.findById(category);
    if (!foundCategory) return res.status(404).json({ message: 'Category not found' });

    // Validate promotor
    const foundPromotor = await Promotor.findById(promotor);
    if (!foundPromotor) return res.status(404).json({ message: 'Promotor not found' });

    // Handle images upload (max 5)
    const imageFiles = Array.isArray(req.files.images) ? req.files.images : [req.files.images];
    
    if (imageFiles.length > 5) {
      return res.status(400).json({ message: 'Maximum 5 images allowed per product' });
    }

    const uploadedImages = [];
    
    for (let i = 0; i < imageFiles.length; i++) {
      const imageFile = imageFiles[i];
      const uploadedImage = await imagekit.upload({
        file: imageFile.buffer.toString('base64'),
        fileName: `product_${Date.now()}_${i}.jpg`,
        folder: '/products/images'
      });
      
      uploadedImages.push({
        url: uploadedImage.url,
        altText: `${name} - Image ${i + 1}`,
        isPrimary: i === 0,
        order: i
      });
    }

    // Handle video upload if provided
    let videoData = {};
    if (req.files.video) {
      const videoFile = Array.isArray(req.files.video) ? req.files.video[0] : req.files.video;
      
      const uploadedVideo = await imagekit.upload({
        file: videoFile.buffer.toString('base64'),
        fileName: `product_${Date.now()}_video.mp4`,
        folder: '/products/videos'
      });

      videoData = {
        url: uploadedVideo.url,
        thumbnail: uploadedImages[0]?.url || '', // Use first image as thumbnail
        duration: videoDuration || 0,
        fileSize: videoFileSize || videoFile.size
      };
    }

    // Parse JSON fields
    let parsedDimensions = {};
    if (dimensions) {
      try {
        parsedDimensions = JSON.parse(dimensions);
      } catch (error) {
        console.error('Error parsing dimensions:', error);
      }
    }

    let parsedPincodes = [];
    if (availablePincodes) {
      try {
        parsedPincodes = JSON.parse(availablePincodes);
      } catch (error) {
        console.error('Error parsing pincodes:', error);
      }
    }

    // Inherit tax information from category
    const productTaxInfo = {
      hsnCode: hsnCode || foundCategory.hsnCode,
      gstPercent: gstPercent !== undefined ? gstPercent : foundCategory.gstPercent,
      taxType: taxType || foundCategory.taxType
    };

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
      ...productTaxInfo,
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
      images: uploadedImages,
      video: videoData,
      warehouse: {
        id: warehouseId || null,
        storageType: storageType || null
      },
      delivery: {
        estimatedDeliveryTime,
        deliveryCharges: deliveryCharges || 0,
        freeDeliveryThreshold: freeDeliveryThreshold || 0,
        availablePincodes: parsedPincodes
      }
    });

    await product.save();
    res.status(201).json({ 
      message: 'Product created successfully', 
      product: await product.populate(['category', 'promotor.id'])
    });
  } catch (error) {
    console.error('Create product error:', error);
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
      availablePincodes,
      hsnCode,
      gstPercent,
      taxType,
      videoDuration,
      videoFileSize,
      primaryImageIndex,
      imagesToRemove,
      removeVideo
    } = req.body;

    // Find existing product
    const existingProduct = await Product.findById(req.params.id);
    if (!existingProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Validate category if provided
    let foundCategory;
    if (category) {
      foundCategory = await Category.findById(category);
      if (!foundCategory) return res.status(404).json({ message: 'Category not found' });
    }

    // Validate promotor if provided
    if (promotor) {
      const promotorExists = await Promotor.findById(promotor);
      if (!promotorExists) return res.status(404).json({ message: 'Promotor not found' });
    }

    const updateData = {
      name,
      description,
      brand,
      price,
      oldPrice,
      unit,
      unitValue,
      quantity,
      minOrderQuantity,
      maxOrderQuantity,
      weight,
      weightUnit,
      'warehouse.id': warehouseId,
      'warehouse.storageType': storageType
    };

    // Handle category change and tax inheritance
    if (category) {
      updateData.category = category;
      updateData.hsnCode = foundCategory.hsnCode;
      updateData.gstPercent = foundCategory.gstPercent;
      updateData.taxType = foundCategory.taxType;
    } else {
      // Allow product-specific tax overrides
      if (hsnCode !== undefined) updateData.hsnCode = hsnCode;
      if (gstPercent !== undefined) updateData.gstPercent = gstPercent;
      if (taxType !== undefined) updateData.taxType = taxType;
    }

    // Handle image removal
    if (imagesToRemove) {
      const removeArray = Array.isArray(imagesToRemove) ? imagesToRemove : [imagesToRemove];
      updateData.$pull = { images: { _id: { $in: removeArray } } };
    }

    // Handle new image uploads
    if (req.files && req.files.images) {
      const newImageFiles = Array.isArray(req.files.images) ? req.files.images : [req.files.images];
      const currentImageCount = existingProduct.images.length - (imagesToRemove ? 
        (Array.isArray(imagesToRemove) ? imagesToRemove.length : 1) : 0);
      
      if (currentImageCount + newImageFiles.length > 5) {
        return res.status(400).json({ 
          message: `Cannot add ${newImageFiles.length} images. Maximum 5 images allowed.` 
        });
      }

      const newImages = [];
      for (let i = 0; i < newImageFiles.length; i++) {
        const imageFile = newImageFiles[i];
        const uploadedImage = await imagekit.upload({
          file: imageFile.buffer.toString('base64'),
          fileName: `product_${Date.now()}_${i}.jpg`,
          folder: '/products/images'
        });
        
        newImages.push({
          url: uploadedImage.url,
          altText: `${name} - Image ${currentImageCount + i + 1}`,
          isPrimary: false,
          order: currentImageCount + i
        });
      }

      if (newImages.length > 0) {
        updateData.$push = { images: { $each: newImages } };
      }
    }

    // Handle primary image change
    if (primaryImageIndex !== undefined) {
      updateData.$set = updateData.$set || {};
      updateData.$set['images.$[].isPrimary'] = false;
      updateData.$set[`images.${primaryImageIndex}.isPrimary`] = true;
    }

    // Handle video upload/removal
    if (req.files && req.files.video) {
      const videoFile = Array.isArray(req.files.video) ? req.files.video[0] : req.files.video;
      
      const uploadedVideo = await imagekit.upload({
        file: videoFile.buffer.toString('base64'),
        fileName: `product_${Date.now()}_video.mp4`,
        folder: '/products/videos'
      });

      updateData.video = {
        url: uploadedVideo.url,
        thumbnail: existingProduct.images[0]?.url || '',
        duration: videoDuration || 0,
        fileSize: videoFileSize || videoFile.size
      };
    } else if (removeVideo === 'true') {
      updateData.video = {};
    }

    // Handle other fields
    if (dimensions) {
      try {
        updateData.dimensions = JSON.parse(dimensions);
      } catch (error) {
        console.error('Error parsing dimensions:', error);
      }
    }

    if (availablePincodes) {
      try {
        updateData['delivery.availablePincodes'] = JSON.parse(availablePincodes);
      } catch (error) {
        console.error('Error parsing pincodes:', error);
      }
    }

    // Update other fields
    if (estimatedDeliveryTime) updateData['delivery.estimatedDeliveryTime'] = estimatedDeliveryTime;
    if (deliveryCharges !== undefined) updateData['delivery.deliveryCharges'] = deliveryCharges;
    if (freeDeliveryThreshold !== undefined) updateData['delivery.freeDeliveryThreshold'] = freeDeliveryThreshold;

    if (promotor) updateData['promotor.id'] = promotor;
    if (commissionRate !== undefined) updateData['promotor.commissionRate'] = commissionRate;
    if (commissionType) updateData['promotor.commissionType'] = commissionType;

    // Calculate discount
    if (oldPrice !== undefined && price !== undefined) {
      updateData.discountPercentage = oldPrice > 0 ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
    }

    // Clean up undefined fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) delete updateData[key];
    });

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('category').populate('promotor.id');
    
    res.json({ message: 'Product updated successfully', product });
  } catch (error) {
    console.error('Update product error:', error);
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

const getProductsByPincode = async (req, res) => {
  try {
    const { pincode } = req.query;
    
    if (!pincode) {
      return res.status(400).json({
        success: false,
        message: 'Pincode is required'
      });
    }

    const products = await Product.find({
      'delivery.availablePincodes': pincode,
      isActive: true
    }).populate('category');

    res.json({
      success: true,
      data: products,
      count: products.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching products by pincode',
      error: error.message
    });
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getProductsByCategory,
  getProductsByPincode
};