const Product = require('../../../models/product');
const Category = require('../../../models/category');
const Seller = require('../../../models/seller');
const Warehouse = require('../../../models/warehouse');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file upload
const upload = multer({ 
  dest: 'uploads/csv/',
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

const uploadProductsCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'CSV file is required'
      });
    }

    const csvFilePath = req.file.path;
    const csvContent = fs.readFileSync(csvFilePath, 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'CSV file is empty or invalid'
      });
    }

    // Parse CSV headers
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    // Expected headers (case-insensitive)
    const expectedHeaders = [
      'Product Name',
      'Description', 
      'Brand',
      'Category',
      'Price',
      'Quantity',
      'Stock Status',
      'Active Status',
      'Low Stock Threshold',
      'Min Order Quantity',
      'Max Order Quantity',
      'Weight',
      'Weight Unit',
      'SKU',
      'Seller',
      'Warehouse',
      'Storage Type',
      'Estimated Delivery Time',
      'Delivery Charges',
      'Free Delivery Threshold',
      'Serviceable Pincodes',
      'Images',
      'Video'
    ];

    // Validate headers
    const missingHeaders = expectedHeaders.filter(header => 
      !headers.some(h => h.toLowerCase() === header.toLowerCase())
    );

    if (missingHeaders.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required columns: ${missingHeaders.join(', ')}`
      });
    }

    // Get header indices
    const getHeaderIndex = (headerName) => {
      return headers.findIndex(h => h.toLowerCase() === headerName.toLowerCase());
    };

    const results = [];
    const errors = [];

    // Process each row
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i];
      if (!row.trim()) continue;

      const values = row.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      
      try {
        const productData = {
          name: values[getHeaderIndex('Product Name')] || '',
          description: values[getHeaderIndex('Description')] || '',
          brand: values[getHeaderIndex('Brand')] || '',
          price: parseFloat(values[getHeaderIndex('Price')]) || 0,
          quantity: parseInt(values[getHeaderIndex('Quantity')]) || 0,
          stockStatus: values[getHeaderIndex('Stock Status')] || 'out-of-stock',
          isActive: values[getHeaderIndex('Active Status')]?.toLowerCase() === 'active',
          lowStockThreshold: parseInt(values[getHeaderIndex('Low Stock Threshold')]) || 10,
          minOrderQuantity: parseInt(values[getHeaderIndex('Min Order Quantity')]) || 1,
          maxOrderQuantity: parseInt(values[getHeaderIndex('Max Order Quantity')]) || 10,
          weight: parseFloat(values[getHeaderIndex('Weight')]) || 0,
          weightUnit: values[getHeaderIndex('Weight Unit')] || 'g',
          sku: values[getHeaderIndex('SKU')] || '',
          storageType: values[getHeaderIndex('Storage Type')] || '',
          estimatedDeliveryTime: values[getHeaderIndex('Estimated Delivery Time')] || '',
          deliveryCharges: parseFloat(values[getHeaderIndex('Delivery Charges')]) || 0,
          freeDeliveryThreshold: parseFloat(values[getHeaderIndex('Free Delivery Threshold')]) || 0,
          serviceablePincodes: values[getHeaderIndex('Serviceable Pincodes')] ? 
            values[getHeaderIndex('Serviceable Pincodes')].split(';').filter(p => p.trim()) : [],
          images: values[getHeaderIndex('Images')] ? 
            values[getHeaderIndex('Images')].split(';').filter(img => img.trim()) : [],
          video: values[getHeaderIndex('Video')] || null
        };

        // Find category
        if (productData.category) {
          const category = await Category.findOne({ 
            name: { $regex: productData.category, $options: 'i' } 
          });
          if (category) {
            productData.category = category._id;
          } else {
            errors.push(`Row ${i + 1}: Category "${productData.category}" not found`);
          }
        }

        // Find seller
        if (productData.seller) {
          const seller = await Seller.findOne({ 
            name: { $regex: productData.seller, $options: 'i' } 
          });
          if (seller) {
            productData.seller = seller._id;
          } else {
            errors.push(`Row ${i + 1}: Seller "${productData.seller}" not found`);
          }
        }

        // Find warehouse
        if (productData.warehouse) {
          const warehouse = await Warehouse.findOne({ 
            name: { $regex: productData.warehouse, $options: 'i' } 
          });
          if (warehouse) {
            productData.warehouseId = warehouse._id;
            productData.warehouseCode = warehouse.code;
          } else {
            errors.push(`Row ${i + 1}: Warehouse "${productData.warehouse}" not found`);
          }
        }

        // Set default values
        productData.unit = 'piece';
        productData.unitValue = '1';
        productData.discountPercentage = 0;
        productData.gstPercent = 0;
        productData.taxType = 'inclusive';
        productData.hsnCode = '';
        productData.dimensions = {
          length: '',
          width: '',
          height: '',
          unit: 'cm'
        };
        productData.variants = [];
        productData.video = {
          url: productData.video || '',
          thumbnail: '',
          duration: '',
          fileSize: ''
        };

        results.push(productData);

      } catch (error) {
        errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(csvFilePath);

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'CSV validation failed',
        errors: errors
      });
    }

    // Insert products in batch
    const createdProducts = await Product.insertMany(results);

    res.status(200).json({
      success: true,
      message: `Successfully imported ${createdProducts.length} products`,
      imported: createdProducts.length,
      errors: errors.length > 0 ? errors : null
    });

  } catch (error) {
    console.error('Upload products CSV error:', error);
    
    // Clean up uploaded file on error
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

module.exports = { uploadProductsCSV };
