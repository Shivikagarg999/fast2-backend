const Category = require('../../models/category');
const Promotor = require('../../models/promotor'); 
const Product = require('../../models/product');
const Seller = require('../../models/seller');
const Warehouse = require('../../models/warehouse');
const imagekit = require('../../utils/imagekit');

const createProduct = async (req, res) => {
  try {
    const productData = req.body;
    console.log('Received product data:', productData);

    if (productData.dimensions && typeof productData.dimensions === 'string') {
      try {
        productData.dimensions = JSON.parse(productData.dimensions);
      } catch (error) {
        console.error('Error parsing dimensions:', error);
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
        
        parsedVariants = parsedVariants
          .filter(variant => variant.name && variant.name.trim())
          .map(variant => ({
            name: variant.name.trim(),
            options: variant.options
              .filter(option => option.value && option.value.trim())
              .map(option => ({
                value: option.value.trim(),
                price: option.price ? parseFloat(option.price) : undefined,
                quantity: option.quantity ? parseInt(option.quantity) : 0,
                sku: option.sku ? option.sku.trim() : undefined
              }))
          }))
          .filter(variant => variant.options.length > 0);
          
        console.log('Parsed variants:', parsedVariants);
      } catch (error) {
        console.error('Error parsing variants:', error);
      }
    }

    let parsedWeight = parseFloat(productData.weight);
    if (isNaN(parsedWeight)) {
      parsedWeight = 0;
    }
    
    const weightUnit = productData.weightUnit || 'g';
    let weightInGrams = parsedWeight;
    
    if (weightUnit === 'kg') {
      weightInGrams = parsedWeight * 1000;
    } else if (weightUnit === 'l') {
      weightInGrams = parsedWeight * 1000;
    } else if (weightUnit === 'ml') {
      weightInGrams = parsedWeight;
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

    if (!categoryId) {
      return res.status(400).json({
        success: false,
        message: 'Category is required'
      });
    }

    const foundCategory = await Category.findById(categoryId);
    if (!foundCategory) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    if (!productData.seller) {
      return res.status(400).json({
        success: false,
        message: 'Seller is required'
      });
    }
const sellerId = productData.seller?.id || productData.seller;
const seller = await Seller.findById(sellerId);

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }

    let promotorInfo = null;
    if (productData.promotor) {
      const promotor = await Promotor.findById(productData.promotor);
      if (!promotor) {
        return res.status(404).json({
          success: false,
          message: 'Promotor not found'
        });
      }
      
      promotorInfo = {
        id: promotor._id,
        commissionRate: productData.commissionRate ? parseFloat(productData.commissionRate) : promotor.commissionRate || 5,
        commissionType: productData.commissionType || promotor.commissionType || 'percentage'
      };
    } else {
      promotorInfo = {
        commissionRate: productData.commissionRate ? parseFloat(productData.commissionRate) : 5,
        commissionType: productData.commissionType || 'percentage'
      };
    }

    const price = parseFloat(productData.price) || 0;
    let commissionAmount = 0;
    if (promotorInfo.commissionType === 'percentage') {
      commissionAmount = (price * promotorInfo.commissionRate) / 100;
    } else {
      commissionAmount = promotorInfo.commissionRate;
    }

    let warehouseInfo = null;
    if (productData.warehouseId) {
      const warehouse = await Warehouse.findById(productData.warehouseId);
      if (warehouse) {
        warehouseInfo = {
          id: warehouse._id,
          name: warehouse.name,
          location: warehouse.location
        };
      }
    }

    const oldPrice = parseFloat(productData.oldPrice) || 0;
    const discountPercentage = oldPrice > 0 ? 
      Math.round(((oldPrice - price) / oldPrice) * 100) : 0;

    const quantity = parseInt(productData.quantity) || 0;
    const stockStatus = quantity > 0 ? 'in-stock' : 'out-of-stock';

    let uploadedImages = [];
    if (req.files && req.files.images) {
      const imageFiles = Array.isArray(req.files.images) ? req.files.images : [req.files.images];
      const filesToUpload = imageFiles.slice(0, 5);
      
      console.log(`Processing ${filesToUpload.length} images for ImageKit upload...`);
      
      for (let i = 0; i < filesToUpload.length; i++) {
        const imageFile = filesToUpload[i];
        
        try {
          const uploadResponse = await imagekit.upload({
            file: imageFile.buffer.toString('base64'),
            fileName: `product_${Date.now()}_${i}_${Math.random().toString(36).substring(7)}.jpg`,
            folder: '/products/images',
            useUniqueFileName: true,
            tags: ['product', 'image'],
            isPrivateFile: false
          });

          console.log(`Image ${i} uploaded to ImageKit:`, uploadResponse.url);
          
          uploadedImages.push({
            url: uploadResponse.url,
            thumbnailUrl: uploadResponse.thumbnailUrl,
            fileId: uploadResponse.fileId,
            altText: productData.imageAltText || `${productData.name || 'Product'} - Image ${i + 1}`,
            isPrimary: i === 0,
            order: i,
            width: uploadResponse.width,
            height: uploadResponse.height,
            size: uploadResponse.size,
            format: uploadResponse.format
          });
        } catch (uploadError) {
          console.error(`Error uploading image ${i + 1} to ImageKit:`, uploadError);
          uploadedImages.push({
            url: imageFile.path || imageFile.filename ? `/uploads/${imageFile.filename}` : '',
            altText: productData.imageAltText || `${productData.name || 'Product'} - Image ${i + 1}`,
            isPrimary: i === 0,
            order: i
          });
        }
      }
    } else {
      console.log('No images found in request');
    }

    let videoInfo = null;
    if (req.files && req.files.video) {
      const videoFile = req.files.video;
      
      try {
        const videoUploadResponse = await imagekit.upload({
          file: videoFile.buffer.toString('base64'),
          fileName: `product_video_${Date.now()}.mp4`,
          folder: '/products/videos',
          useUniqueFileName: true,
          tags: ['product', 'video'],
          isPrivateFile: false
        });

        console.log('Video uploaded to ImageKit:', videoUploadResponse.url);

        videoInfo = {
          url: videoUploadResponse.url,
          fileId: videoUploadResponse.fileId,
          filename: videoUploadResponse.name,
          size: videoUploadResponse.size,
          mimetype: videoUploadResponse.mimeType,
          thumbnail: videoUploadResponse.thumbnailUrl
        };
      } catch (videoUploadError) {
        console.error('Error uploading video to ImageKit:', videoUploadError);
        videoInfo = {
          url: videoFile.path || videoFile.filename ? `/uploads/${videoFile.filename}` : '',
          filename: videoFile.filename,
          size: videoFile.size,
          mimetype: videoFile.mimetype
        };
      }
    }

    const newProductData = {
      name: productData.name,
      description: productData.description,
      brand: productData.brand,
      category: categoryId,
      seller: seller._id,
      price: price,
      oldPrice: oldPrice,
      discountPercentage: discountPercentage,
      hsnCode: productData.hsnCode || foundCategory.hsnCode,
      gstPercent: productData.gstPercent !== undefined ? parseFloat(productData.gstPercent) : foundCategory.gstPercent,
      taxType: productData.taxType || foundCategory.taxType,
      unit: productData.unit || 'piece',
      unitValue: parseFloat(productData.unitValue) || 1,
      promotor: promotorInfo.id ? {
        id: promotorInfo.id,
        commissionRate: promotorInfo.commissionRate,
        commissionType: promotorInfo.commissionType,
        commissionAmount: commissionAmount
      } : undefined,
      warehouse: warehouseInfo,
      quantity: quantity,
      minOrderQuantity: parseInt(productData.minOrderQuantity) || 1,
      maxOrderQuantity: parseInt(productData.maxOrderQuantity) || 10,
      stockStatus: stockStatus,
      lowStockThreshold: parseInt(productData.lowStockThreshold) || 10,
      weight: weightInGrams,
      weightUnit: weightUnit,
      images: uploadedImages,
      video: videoInfo,
      delivery: {
        estimatedDeliveryTime: productData.estimatedDeliveryTime,
        deliveryCharges: parseFloat(productData.deliveryCharges) || 0,
        freeDeliveryThreshold: parseFloat(productData.freeDeliveryThreshold) || 0,
      },
      serviceablePincodes: parsedServiceablePincodes,
      variants: parsedVariants,
      isActive: productData.isActive !== undefined ? 
        (productData.isActive === 'true' || productData.isActive === true) : true,
      createdBy: 'admin',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    Object.keys(newProductData).forEach(key => {
      if (newProductData[key] === undefined) {
        delete newProductData[key];
      }
    });

    console.log('Creating product...');
    
    const newProduct = new Product(newProductData);
    await newProduct.save();

    if (promotorInfo.id) {
      await Promotor.findByIdAndUpdate(
        promotorInfo.id,
        { $inc: { totalProductsAdded: 1 } },
        { new: true }
      );
    }

    if (warehouseInfo) {
      await Warehouse.findByIdAndUpdate(
        warehouseInfo.id,
        { $inc: { productCount: 1 } },
        { new: true }
      );
    }

    await Seller.findByIdAndUpdate(
      seller._id,
      { $addToSet: { products: newProduct._id } },
      { new: true }
    );

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: newProduct
    });

  } catch (error) {
    console.error('Create product error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating product',
      error: error.message
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const existingProduct = await Product.findById(productId);
    
    if (!existingProduct) {
      return res.status(404).json({ 
        success: false,
        message: 'Product not found' 
      });
    }

    let parsedDimensions = existingProduct.dimensions || {};
    if (req.body.dimensions) {
      try {
        parsedDimensions = typeof req.body.dimensions === 'string' ? 
          JSON.parse(req.body.dimensions) : req.body.dimensions;
      } catch (error) {
        console.error('Error parsing dimensions:', error);
      }
    }

    let parsedAvailablePincodes = existingProduct.delivery?.availablePincodes || [];
    if (req.body.availablePincodes) {
      try {
        parsedAvailablePincodes = typeof req.body.availablePincodes === 'string' ? 
          JSON.parse(req.body.availablePincodes) : req.body.availablePincodes;
      } catch (error) {
        console.error('Error parsing availablePincodes:', error);
      }
    }

    let parsedServiceablePincodes = existingProduct.serviceablePincodes || [];
    if (req.body.serviceablePincodes) {
      try {
        parsedServiceablePincodes = typeof req.body.serviceablePincodes === 'string' ? 
          JSON.parse(req.body.serviceablePincodes) : req.body.serviceablePincodes;
      } catch (error) {
        console.error('Error parsing serviceablePincodes:', error);
      }
    }

    let parsedVariants = existingProduct.variants || [];
    if (req.body.variants) {
      try {
        parsedVariants = typeof req.body.variants === 'string' ? 
          JSON.parse(req.body.variants) : req.body.variants;
      } catch (error) {
        console.error('Error parsing variants:', error);
      }
    }

    let parsedVideo = existingProduct.video || {};
    if (req.body.video) {
      try {
        parsedVideo = typeof req.body.video === 'string' ? 
          JSON.parse(req.body.video) : req.body.video;
      } catch (error) {
        console.error('Error parsing video:', error);
      }
    }

    let categoryId = existingProduct.category;
    if (req.body.category) {
      const category = await Category.findById(req.body.category);
      if (!category) {
        return res.status(404).json({ 
          success: false,
          message: 'Category not found' 
        });
      }
      categoryId = category._id;
    }

    let promotorInfo = existingProduct.promotor || {};
    if (req.body.promotor) {
      const promotor = await Promotor.findById(req.body.promotor);
      if (!promotor) {
        return res.status(404).json({ 
          success: false,
          message: 'Promotor not found' 
        });
      }
      
      promotorInfo = {
        id: promotor._id,
        commissionRate: req.body.commissionRate ? parseFloat(req.body.commissionRate) : promotor.commissionRate || 5,
        commissionType: req.body.commissionType || promotor.commissionType || 'percentage',
        commissionAmount: req.body.commissionAmount ? parseFloat(req.body.commissionAmount) : existingProduct.promotor?.commissionAmount || 0
      };
    } else if (req.body.commissionRate || req.body.commissionType || req.body.commissionAmount) {
      promotorInfo = {
        ...promotorInfo,
        commissionRate: req.body.commissionRate ? parseFloat(req.body.commissionRate) : promotorInfo.commissionRate,
        commissionType: req.body.commissionType || promotorInfo.commissionType,
        commissionAmount: req.body.commissionAmount ? parseFloat(req.body.commissionAmount) : promotorInfo.commissionAmount
      };
    }

    if (req.body.price && promotorInfo.commissionRate && !req.body.commissionAmount) {
      const price = parseFloat(req.body.price) || existingProduct.price;
      if (promotorInfo.commissionType === 'percentage') {
        promotorInfo.commissionAmount = (price * promotorInfo.commissionRate) / 100;
      } else {
        promotorInfo.commissionAmount = promotorInfo.commissionRate;
      }
    }

    let warehouseInfo = existingProduct.warehouse || {};
    if (req.body.warehouseId) {
      const warehouse = await Warehouse.findById(req.body.warehouseId);
      if (!warehouse) {
        return res.status(404).json({ 
          success: false,
          message: 'Warehouse not found' 
        });
      }
      warehouseInfo = {
        id: warehouse._id,
        name: warehouse.name,
        code: req.body.warehouseCode || warehouse.code,
        storageType: req.body.storageType || warehouse.storageType
      };
    } else if (req.body.warehouseCode || req.body.storageType) {
      warehouseInfo = {
        ...warehouseInfo,
        code: req.body.warehouseCode || warehouseInfo.code,
        storageType: req.body.storageType || warehouseInfo.storageType
      };
    }

    let discountPercentage = existingProduct.discountPercentage;
    if (req.body.oldPrice !== undefined && req.body.price !== undefined) {
      const oldPrice = parseFloat(req.body.oldPrice) || 0;
      const price = parseFloat(req.body.price) || 0;
      discountPercentage = oldPrice > 0 ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
    }

    let stockStatus = existingProduct.stockStatus;
    if (req.body.quantity !== undefined) {
      const quantity = parseInt(req.body.quantity) || 0;
      stockStatus = quantity > 0 ? 'in-stock' : 'out-of-stock';
    }

    let weightInGrams = existingProduct.weight;
    if (req.body.weight !== undefined || req.body.weightUnit !== undefined) {
      const weight = parseFloat(req.body.weight) || existingProduct.weight || 0;
      const weightUnit = req.body.weightUnit || existingProduct.weightUnit || 'g';
      
      if (weightUnit === 'kg') {
        weightInGrams = weight * 1000;
      } else if (weightUnit === 'l') {
        weightInGrams = weight * 1000;
      } else if (weightUnit === 'ml') {
        weightInGrams = weight;
      } else {
        weightInGrams = weight;
      }
    }

    let images = existingProduct.images || [];
    
    if (req.body.imagesToRemove) {
      const imagesToRemove = Array.isArray(req.body.imagesToRemove) ? 
        req.body.imagesToRemove : [req.body.imagesToRemove];
      images = images.filter(img => !imagesToRemove.includes(img._id.toString()));
    }

    if (req.files && req.files.images) {
      const imageFiles = Array.isArray(req.files.images) ? req.files.images : [req.files.images];
      const maxImages = 5 - images.length;
      const filesToUpload = imageFiles.slice(0, maxImages);
      
      for (let i = 0; i < filesToUpload.length; i++) {
        const imageFile = filesToUpload[i];
        
        try {
          const uploadResponse = await imagekit.upload({
            file: imageFile.buffer.toString('base64'),
            fileName: `product_${Date.now()}_${i}_${Math.random().toString(36).substring(7)}.jpg`,
            folder: '/products/images',
            useUniqueFileName: true,
            tags: ['product', 'image'],
            isPrivateFile: false
          });
          
          images.push({
            url: uploadResponse.url,
            thumbnailUrl: uploadResponse.thumbnailUrl,
            fileId: uploadResponse.fileId,
            altText: req.body.imageAltText || `${req.body.name || existingProduct.name} - Image ${images.length + 1}`,
            isPrimary: images.length === 0, 
            order: images.length,
            width: uploadResponse.width,
            height: uploadResponse.height,
            size: uploadResponse.size,
            format: uploadResponse.format
          });
        } catch (uploadError) {
          console.error(`Error uploading image ${i + 1} to ImageKit:`, uploadError);
          images.push({
            url: imageFile.path || imageFile.filename ? `/uploads/${imageFile.filename}` : '',
            altText: req.body.imageAltText || `${req.body.name || existingProduct.name} - Image ${images.length + 1}`,
            isPrimary: images.length === 0,
            order: images.length
          });
        }
      }
    }

    if (req.body.primaryImageIndex !== undefined) {
      const primaryIndex = parseInt(req.body.primaryImageIndex);
      if (primaryIndex >= 0 && primaryIndex < images.length) {
        images = images.map((img, index) => ({
          ...img,
          isPrimary: index === primaryIndex
        }));
      }
    }

    let videoInfo = existingProduct.video || {};
    if (req.files && req.files.video) {
      const videoFile = Array.isArray(req.files.video) ? req.files.video[0] : req.files.video;
      
      try {
        const videoUploadResponse = await imagekit.upload({
          file: videoFile.buffer.toString('base64'),
          fileName: `product_video_${Date.now()}.mp4`,
          folder: '/products/videos',
          useUniqueFileName: true,
          tags: ['product', 'video'],
          isPrivateFile: false
        });

        videoInfo = {
          url: videoUploadResponse.url,
          fileId: videoUploadResponse.fileId,
          filename: videoUploadResponse.name,
          size: videoUploadResponse.size,
          mimetype: videoUploadResponse.mimeType,
          thumbnail: videoUploadResponse.thumbnailUrl,
          duration: req.body.videoDuration || parsedVideo.duration || 0,
          fileSize: req.body.videoFileSize || parsedVideo.fileSize || videoFile.size
        };
      } catch (videoUploadError) {
        console.error('Error uploading video to ImageKit:', videoUploadError);
        videoInfo = {
          url: videoFile.path || videoFile.filename ? `/uploads/${videoFile.filename}` : '',
          filename: videoFile.filename,
          size: videoFile.size,
          mimetype: videoFile.mimetype,
          duration: req.body.videoDuration || parsedVideo.duration || 0,
          fileSize: req.body.videoFileSize || parsedVideo.fileSize || videoFile.size
        };
      }
    } else if (req.body.removeVideo === 'true') {
      videoInfo = {};
    } else if (req.body.video) {
      videoInfo = {
        ...videoInfo,
        ...parsedVideo
      };
    }

    const updateData = {
      name: req.body.name !== undefined ? req.body.name : existingProduct.name,
      description: req.body.description !== undefined ? req.body.description : existingProduct.description,
      brand: req.body.brand !== undefined ? req.body.brand : existingProduct.brand,
      category: categoryId,
      price: req.body.price !== undefined ? parseFloat(req.body.price) : existingProduct.price,
      oldPrice: req.body.oldPrice !== undefined ? parseFloat(req.body.oldPrice) : existingProduct.oldPrice,
      discountPercentage: discountPercentage,
      hsnCode: req.body.hsnCode !== undefined ? req.body.hsnCode : existingProduct.hsnCode,
      gstPercent: req.body.gstPercent !== undefined ? parseFloat(req.body.gstPercent) : existingProduct.gstPercent,
      taxType: req.body.taxType !== undefined ? req.body.taxType : existingProduct.taxType,
      unit: req.body.unit !== undefined ? req.body.unit : existingProduct.unit,
      unitValue: req.body.unitValue !== undefined ? parseFloat(req.body.unitValue) : existingProduct.unitValue,
      quantity: req.body.quantity !== undefined ? parseInt(req.body.quantity) : existingProduct.quantity,
      minOrderQuantity: req.body.minOrderQuantity !== undefined ? parseInt(req.body.minOrderQuantity) : existingProduct.minOrderQuantity,
      maxOrderQuantity: req.body.maxOrderQuantity !== undefined ? parseInt(req.body.maxOrderQuantity) : existingProduct.maxOrderQuantity,
      stockStatus: stockStatus,
      lowStockThreshold: req.body.lowStockThreshold !== undefined ? parseInt(req.body.lowStockThreshold) : existingProduct.lowStockThreshold,
      weight: weightInGrams,
      weightUnit: req.body.weightUnit !== undefined ? req.body.weightUnit : existingProduct.weightUnit,
      dimensions: parsedDimensions,
      images: images,
      video: videoInfo,
      'delivery.estimatedDeliveryTime': req.body.estimatedDeliveryTime !== undefined ? 
        req.body.estimatedDeliveryTime : existingProduct.delivery?.estimatedDeliveryTime,
      'delivery.deliveryCharges': req.body.deliveryCharges !== undefined ? 
        parseFloat(req.body.deliveryCharges) : existingProduct.delivery?.deliveryCharges,
      'delivery.freeDeliveryThreshold': req.body.freeDeliveryThreshold !== undefined ? 
        parseFloat(req.body.freeDeliveryThreshold) : existingProduct.delivery?.freeDeliveryThreshold,
      'delivery.availablePincodes': parsedAvailablePincodes,
      serviceablePincodes: parsedServiceablePincodes,
      variants: parsedVariants,
      isActive: req.body.isActive !== undefined ? 
        (req.body.isActive === 'true' || req.body.isActive === true) : existingProduct.isActive,
      updatedAt: new Date()
    };

    if (Object.keys(promotorInfo).length > 0) {
      updateData.promotor = promotorInfo;
    } else {
      updateData.promotor = undefined;
    }

    if (Object.keys(warehouseInfo).length > 0) {
      updateData.warehouse = warehouseInfo;
    } else {
      updateData.warehouse = undefined;
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('category')
    .populate('promotor.id')
    .populate('seller');

    if (!updatedProduct) {
      return res.status(404).json({ 
        success: false,
        message: 'Product not found after update' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      product: updatedProduct
    });

  } catch (error) {
    console.error('Update product error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating product',
      error: error.message
    });
  }
};

const getProducts = async (req, res) => {
  try {
    const { 
      category, 
      search, 
      minPrice, 
      maxPrice, 
      sortBy = 'createdAt', 
      sortOrder = 'desc',
      page = 1,
      limit = 20,
      pincode 
    } = req.query;

    const filter = { isActive: true };

    if (category) {
      filter.category = category;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } }
      ];
    }

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    if (pincode) {
      filter.$or = [
        { 'delivery.availablePincodes': pincode },
        { serviceablePincodes: pincode },
        { 'delivery.availablePincodes': { $in: [pincode.substring(0, 3)] } },
        { serviceablePincodes: { $in: [pincode.substring(0, 3)] } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const products = await Product.find(filter)
      .populate('category')
      .populate('promotor.id')
      .populate('warehouse.id')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    res.json({
      products,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalProducts,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: error.message });
  }
};

const getProductsAdmin = async (req, res) => {
  try {
    const { 
      category, 
      search, 
      minPrice, 
      maxPrice, 
      sortBy = 'createdAt', 
      sortOrder = 'desc',
      page = 1,
      limit = 20,
      pincode 
    } = req.query;

    const filter = {};

    if (category) {
      filter.category = category;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } }
      ];
    }

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    if (pincode) {
      filter.$or = [
        { 'delivery.availablePincodes': pincode },
        { serviceablePincodes: pincode },
        { 'delivery.availablePincodes': { $in: [pincode.substring(0, 3)] } },
        { serviceablePincodes: { $in: [pincode.substring(0, 3)] } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const products = await Product.find(filter)
      .populate('category')
      .populate('promotor.id')
      .populate('warehouse.id')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    res.json({
      products,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalProducts,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: error.message });
  }
};

const getProductsByPincode = async (req, res) => {
  try {
    const { pincode } = req.params;
    const { 
      category, 
      search, 
      page = 1, 
      limit = 20 
    } = req.query;

    if (!pincode) {
      return res.status(400).json({ message: 'Pincode is required' });
    }

    const filter = { 
      isActive: true,
      $or: [
        { 'delivery.availablePincodes': pincode },
        { serviceablePincodes: pincode },
        { 'delivery.availablePincodes': { $in: [pincode.substring(0, 3)] } },
        { serviceablePincodes: { $in: [pincode.substring(0, 3)] } }
      ]
    };

    if (category) {
      filter.category = category;
    }

    if (search) {
      filter.$or = [
        ...filter.$or,
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const products = await Product.find(filter)
      .populate('category')
      .populate('promotor.id')
      .populate('warehouse.id')
      .skip(skip)
      .limit(parseInt(limit));

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    res.json({
      products,
      pincode,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalProducts,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get products by pincode error:', error);
    res.status(500).json({ message: error.message });
  }
};

const getProductOrders = async (req, res) => {
  try {
    const { productId } = req.params;
    const { 
      page = 1, 
      limit = 10, 
      status, 
      startDate, 
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const filter = {
      'items.product': productId
    };

    if (status) {
      filter.status = status;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const orders = await Order.find(filter)
      .populate('user', 'name email phone')
      .populate('driver', 'name phone')
      .populate('items.product', 'name images price')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const totalOrders = await Order.countDocuments(filter);

    const productStats = await Order.aggregate([
      { $match: { 'items.product': mongoose.Types.ObjectId(productId) } },
      { $unwind: '$items' },
      { $match: { 'items.product': mongoose.Types.ObjectId(productId) } },
      {
        $group: {
          _id: null,
          totalQuantitySold: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } },
          totalOrders: { $sum: 1 }
        }
      }
    ]);

    const stats = productStats.length > 0 ? productStats[0] : {
      totalQuantitySold: 0,
      totalRevenue: 0,
      totalOrders: 0
    };

    res.json({
      success: true,
      product: {
        _id: product._id,
        name: product.name,
        price: product.price,
        images: product.images
      },
      orders,
      stats,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalOrders / limit),
        totalOrders,
        hasNext: page < Math.ceil(totalOrders / limit),
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get product orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching product orders',
      error: error.message
    });
  }
};

const getProductSalesAnalytics = async (req, res) => {
  try {
    const { productId } = req.params;
    const { period = '30d' } = req.query;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const now = new Date();
    let startDate = new Date();

    switch (period) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    const dailySales = await Order.aggregate([
      {
        $match: {
          'items.product': mongoose.Types.ObjectId(productId),
          createdAt: { $gte: startDate },
          status: { $in: ['confirmed', 'picked-up', 'delivered'] }
        }
      },
      { $unwind: '$items' },
      { $match: { 'items.product': mongoose.Types.ObjectId(productId) } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } },
          orders: { $addToSet: '$_id' }
        }
      },
      {
        $project: {
          date: '$_id',
          quantity: 1,
          revenue: 1,
          ordersCount: { $size: '$orders' }
        }
      },
      { $sort: { date: 1 } }
    ]);

    // Get status-wise distribution
    const statusDistribution = await Order.aggregate([
      {
        $match: {
          'items.product': mongoose.Types.ObjectId(productId)
        }
      },
      { $unwind: '$items' },
      { $match: { 'items.product': mongoose.Types.ObjectId(productId) } },
      {
        $group: {
          _id: '$status',
          quantity: { $sum: '$items.quantity' },
          ordersCount: { $sum: 1 }
        }
      }
    ]);

    // Get top customers for this product
    const topCustomers = await Order.aggregate([
      {
        $match: {
          'items.product': mongoose.Types.ObjectId(productId),
          status: { $in: ['confirmed', 'picked-up', 'delivered'] }
        }
      },
      { $unwind: '$items' },
      { $match: { 'items.product': mongoose.Types.ObjectId(productId) } },
      {
        $group: {
          _id: '$user',
          totalQuantity: { $sum: '$items.quantity' },
          totalSpent: { $sum: { $multiply: ['$items.quantity', '$items.price'] } },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          'user.name': 1,
          'user.email': 1,
          'user.phone': 1,
          totalQuantity: 1,
          totalSpent: 1,
          orderCount: 1
        }
      }
    ]);

    res.json({
      success: true,
      product: {
        _id: product._id,
        name: product.name,
        price: product.price
      },
      analytics: {
        period,
        dailySales,
        statusDistribution,
        topCustomers
      }
    });

  } catch (error) {
    console.error('Get product sales analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching product sales analytics',
      error: error.message
    });
  }
};

const getProductsOrderStats = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20,
      sortBy = 'totalOrders',
      sortOrder = 'desc',
      category,
      search 
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build product filter
    const productFilter = { isActive: true };
    if (category) {
      productFilter.category = category;
    }
    if (search) {
      productFilter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } }
      ];
    }

    // Get products with pagination
    const products = await Product.find(productFilter)
      .populate('category', 'name')
      .skip(skip)
      .limit(parseInt(limit));

    // Get order stats for each product
    const productsWithStats = await Promise.all(
      products.map(async (product) => {
        const stats = await Order.aggregate([
          { $match: { 'items.product': product._id } },
          { $unwind: '$items' },
          { $match: { 'items.product': product._id } },
          {
            $group: {
              _id: '$items.product',
              totalQuantitySold: { $sum: '$items.quantity' },
              totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } },
              totalOrders: { $sum: 1 },
              deliveredOrders: {
                $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
              }
            }
          }
        ]);

        const productStats = stats.length > 0 ? stats[0] : {
          totalQuantitySold: 0,
          totalRevenue: 0,
          totalOrders: 0,
          deliveredOrders: 0
        };

        return {
          ...product.toObject(),
          stats: productStats
        };
      })
    );

    // Sort products by the specified field
    productsWithStats.sort((a, b) => {
      const aValue = a.stats[sortBy] || 0;
      const bValue = b.stats[sortBy] || 0;
      return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
    });

    const totalProducts = await Product.countDocuments(productFilter);

    res.json({
      success: true,
      products: productsWithStats,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalProducts / limit),
        totalProducts,
        hasNext: page < Math.ceil(totalProducts / limit),
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get products order stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products order stats',
      error: error.message
    });
  }
};

const getLowPerformingProducts = async (req, res) => {
  try {
    const { limit = 10, days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const lowPerformingProducts = await Product.aggregate([
      {
        $lookup: {
          from: 'orders',
          let: { productId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $in: ['$$productId', '$items.product'] },
                createdAt: { $gte: startDate },
                status: { $in: ['confirmed', 'picked-up', 'delivered'] }
              }
            },
            { $unwind: '$items' },
            { $match: { $expr: { $eq: ['$items.product', '$$productId'] } } },
            {
              $group: {
                _id: null,
                totalSold: { $sum: '$items.quantity' },
                totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
              }
            }
          ],
          as: 'salesData'
        }
      },
      {
        $project: {
          name: 1,
          price: 1,
          quantity: 1,
          category: 1,
          images: 1,
          totalSold: { $ifNull: [{ $arrayElemAt: ['$salesData.totalSold', 0] }, 0] },
          totalRevenue: { $ifNull: [{ $arrayElemAt: ['$salesData.totalRevenue', 0] }, 0] },
          isActive: 1
        }
      },
      { $match: { isActive: true, totalSold: { $lte: 5 } } }, // Products with 5 or less sales
      { $sort: { totalSold: 1 } },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } }
    ]);

    res.json({
      success: true,
      lowPerformingProducts,
      period: `${days} days`,
      count: lowPerformingProducts.length
    });

  } catch (error) {
    console.error('Get low performing products error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching low performing products',
      error: error.message
    });
  }
};

const getBestSellingProducts = async (req, res) => {
  try {
    const { limit = 10, days, category } = req.query;

    const matchStage = {
      status: { $in: ['confirmed', 'picked-up', 'delivered'] }
    };

    if (days) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));
      matchStage.createdAt = { $gte: startDate };
    }

    const bestSellingProducts = await Order.aggregate([
      { $match: matchStage },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $match: category ? { 'product.category': mongoose.Types.ObjectId(category) } : {}
      },
      {
        $project: {
          'product.name': 1,
          'product.price': 1,
          'product.images': 1,
          'product.category': 1,
          totalQuantity: 1,
          totalRevenue: 1,
          orderCount: 1
        }
      },
      {
        $lookup: {
          from: 'categories',
          localField: 'product.category',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } }
    ]);

    res.json({
      success: true,
      bestSellingProducts,
      period: days ? `${days} days` : 'all time',
      count: bestSellingProducts.length
    });

  } catch (error) {
    console.error('Get best selling products error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching best selling products',
      error: error.message
    });
  }
};

const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category')
      .populate('promotor.id')
      .select('-__v');
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getProductsByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    const products = await Product.find({ category: categoryId })
      .populate('category')
      .populate('promotor.id');

    res.json({ category: category.name, products });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getProductStats = async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();

    const allProducts = await Product.find({});
    
    const inStockProducts = allProducts.filter(product => product.stockStatus === 'in-stock').length;
    const outOfStockProducts = allProducts.filter(product => product.stockStatus === 'out-of-stock').length;
    
    const lowStockProducts = allProducts.filter(product => 
      product.stockStatus === 'in-stock' && 
      product.quantity <= (product.lowStockThreshold || 10)
    ).length;

    const result = {
      totalProducts: totalProducts,
      inStockProducts: inStockProducts,
      outOfStockProducts: outOfStockProducts,
      lowStockProducts: lowStockProducts
    };

    res.json(result);
  } catch (error) {
    console.error('Error in getProductStats:', error);
    res.status(500).json({ 
      message: "Server error", 
      error: error.message
    });
  }
};

const getLowStockAlerts = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const lowStockProducts = await Product.find({
      $expr: { $lte: ["$quantity", "$lowStockThreshold"] },
      stockStatus: "in-stock"
    })
    .populate('category', 'name')
    .select('name quantity lowStockThreshold price stockStatus images')
    .sort({ quantity: 1 })
    .limit(parseInt(limit));

    res.json({
      lowStockProducts,
      count: lowStockProducts.length
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getOutOfStockProducts = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const outOfStockProducts = await Product.find({
      stockStatus: "out-of-stock"
    })
    .populate('category', 'name')
    .select('name quantity price stockStatus images createdAt')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit));

    res.json({
      outOfStockProducts,
      count: outOfStockProducts.length
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getProductsByWarehouse = async (req, res) => {
  try {
    const { warehouseCode } = req.params;
    
    const products = await Product.find({
      'warehouse.code': warehouseCode,
      isActive: true
    })
    .populate('category')
    .populate('promotor.id')
    .populate('warehouse.id');

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getProductsForPincode = async (req, res) => {
  try {
    const { pincode } = req.query;
    
    if (!pincode) {
      return res.status(400).json({
        success: false,
        message: 'Pincode is required'
      });
    }

    const warehouseResponse = await fetch(`http://localhost:5000/api/warehouse/for-pincode?pincode=${pincode}`);
    const warehouseData = await warehouseResponse.json();

    if (!warehouseData.success) {
      return res.status(404).json({
        success: false,
        message: 'No warehouse found for this pincode'
      });
    }

    const warehouse = warehouseData.data;
    
    const products = await Product.find({
      'warehouse.code': warehouse.code,
      isActive: true
    })
    .populate('category')
    .populate('promotor.id')
    .populate('warehouse.id');

    res.json({
      success: true,
      data: products,
      warehouse: {
        name: warehouse.name,
        code: warehouse.code,
        city: warehouse.location.city
      },
      count: products.length
    });

  } catch (error) {
    console.error('Error fetching products for pincode:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: error.message
    });
  }
};

const getProductActiveStatus = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findById(productId).select('isActive');
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      productId,
      isActive: product.isActive
    });

  } catch (error) {
    console.error('Get product active status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching product status',
      error: error.message
    });
  }
};

const toggleProductActiveStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { 
        isActive: !product.isActive,
        ...(!product.isActive && product.quantity > 0 ? { stockStatus: 'in-stock' } : {})
      },
      { new: true, runValidators: true }
    ).populate('category').populate('promotor.id').populate('warehouse.id');

    res.json({
      success: true,
      message: `Product ${updatedProduct.isActive ? 'activated' : 'deactivated'} successfully`,
      product: updatedProduct
    });

  } catch (error) {
    console.error('Toggle product active status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error toggling product status',
      error: error.message
    });
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductsAdmin,
  getProductById,
  updateProduct,
  deleteProduct,
  getProductsByCategory,
  getProductOrders,
  getProductSalesAnalytics,
  getProductsOrderStats,
  getLowPerformingProducts,
  getBestSellingProducts,
  getProductsByPincode,
  getProductStats,
  getLowStockAlerts,
  getOutOfStockProducts,
  getProductsByWarehouse,
  getProductsForPincode,
  toggleProductActiveStatus,
  getProductActiveStatus
};