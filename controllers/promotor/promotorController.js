const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Promotor = require("../../models/promotor");
const Seller = require("../../models/seller");
const Product = require("../../models/product");
const Order = require("../../models/order");
const Category = require("../../models/category");
const Shop = require("../../models/shop");
const imagekit = require("../../utils/imagekit");
require("dotenv").config();

// POST /api/promotor/login
exports.loginPromotor = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const promotor = await Promotor.findOne({ email });
    if (!promotor) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, promotor.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!promotor.active) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Please contact support.",
      });
    }

    const token = jwt.sign(
      { id: promotor._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      promotor: {
        id: promotor._id,
        name: promotor.name,
        email: promotor.email,
        phone: promotor.phone,
        city: promotor.address?.city,
        commissionRate: promotor.commissionRate,
        commissionType: promotor.commissionType,
        totalCommissionEarned: promotor.totalCommissionEarned,
        totalProductsAdded: promotor.totalProductsAdded,
      },
    });
  } catch (error) {
    console.error("Promotor login error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// GET /api/promotor/profile
exports.getProfile = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      promotor: req.promotor,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/promotor/sellers
exports.getSellers = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { promotor: req.promotor._id };
    if (status) filter.approvalStatus = status;

    const [sellers, total] = await Promise.all([
      Seller.find(filter)
        .select("-password")
        .populate("shop", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Seller.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      sellers,
    });
  } catch (error) {
    console.error("Get sellers error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/promotor/products
exports.getProducts = async (req, res) => {
  try {
    const { page = 1, limit = 20, sellerId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get all sellers under this promotor
    const sellerFilter = { promotor: req.promotor._id };
    if (sellerId) sellerFilter._id = sellerId;

    const sellerIds = await Seller.find(sellerFilter).distinct("_id");

    const filter = { seller: { $in: sellerIds } };

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate("seller", "name businessName")
        .populate("category", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Product.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      products,
    });
  } catch (error) {
    console.error("Get products error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/promotor/orders
exports.getOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, sellerId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get all sellers under this promotor
    const sellerFilter = { promotor: req.promotor._id };
    if (sellerId) sellerFilter._id = sellerId;

    const sellerIds = await Seller.find(sellerFilter).distinct("_id");

    // Get all product IDs belonging to those sellers
    const productIds = await Product.find({ seller: { $in: sellerIds } }).distinct("_id");

    // Find orders that contain at least one of those products
    const orderFilter = { "items.product": { $in: productIds } };
    if (status) orderFilter.status = status;

    const [orders, total] = await Promise.all([
      Order.find(orderFilter)
        .populate("user", "name email phone")
        .populate("items.product", "name price seller")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Order.countDocuments(orderFilter),
    ]);

    res.status(200).json({
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      orders,
    });
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/promotor/dashboard
// POST /api/promotor/products
exports.addProduct = async (req, res) => {
  try {
    const promotorId = req.promotor._id;
    const productData = req.body;

    // sellerId must be provided — promotor adds on behalf of a seller
    const { sellerId } = productData;
    if (!sellerId) {
      return res.status(400).json({ success: false, message: "sellerId is required" });
    }

    // Verify the seller belongs to this promotor
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller not found" });
    }
    if (seller.promotor?.toString() !== promotorId.toString()) {
      return res.status(403).json({ success: false, message: "This seller does not belong to your account" });
    }
    if (seller.approvalStatus !== "approved") {
      return res.status(403).json({ success: false, message: "Seller is not approved yet" });
    }

    // Parse JSON string fields sent from multipart forms
    const parseField = (val, fallback) => {
      if (!val) return fallback;
      if (typeof val === "object") return val;
      try { return JSON.parse(val); } catch { return fallback; }
    };

    const parsedDimensions        = parseField(productData.dimensions, {});
    const parsedAvailablePincodes  = parseField(productData.availablePincodes, []);
    const parsedServiceablePincodes = parseField(productData.serviceablePincodes, []);
    const parsedVariants           = parseField(productData.variants, []);

    // Resolve category
    let categoryId = productData.category;
    if (categoryId && !/^[0-9a-fA-F]{24}$/.test(categoryId)) {
      const cat = await Category.findOne({ name: categoryId });
      if (!cat) return res.status(404).json({ success: false, message: `Category '${categoryId}' not found` });
      categoryId = cat._id;
    }
    const foundCategory = categoryId ? await Category.findById(categoryId) : null;

    const productTaxInfo = {
      hsnCode:    productData.hsnCode    || foundCategory?.hsnCode,
      gstPercent: productData.gstPercent !== undefined ? productData.gstPercent : foundCategory?.gstPercent,
      taxType:    productData.taxType    || foundCategory?.taxType,
    };

    // Commission from promotor's own rate
    const commissionRate = req.promotor.commissionRate || 5;
    const commissionType = req.promotor.commissionType || "percentage";
    const commissionAmount = commissionType === "percentage"
      ? (productData.price * commissionRate) / 100
      : commissionRate;

    const discountPercentage = productData.oldPrice > 0
      ? Math.round(((productData.oldPrice - productData.price) / productData.oldPrice) * 100)
      : 0;

    const stockStatus = productData.quantity > 0 ? "in-stock" : "out-of-stock";

    // Upload images to ImageKit
    let uploadedImages = [];
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        try {
          const uploaded = await imagekit.upload({
            file: req.files[i].buffer.toString("base64"),
            fileName: `product_${sellerId}_${Date.now()}_${i}.jpg`,
            folder: "/seller-products/images",
            useUniqueFileName: true,
          });
          uploadedImages.push({
            url: uploaded.url,
            fileId: uploaded.fileId,
            altText: productData.imageAltText || `${productData.name} - Image ${i + 1}`,
            isPrimary: i === 0,
            order: i,
          });
        } catch (err) {
          console.error(`Image upload error (${i}):`, err.message);
        }
      }
    }

    const newProduct = new Product({
      name:               productData.name,
      description:        productData.description,
      brand:              productData.brand,
      category:           categoryId,
      price:              productData.price,
      oldPrice:           productData.oldPrice || 0,
      discountPercentage,
      hsnCode:            productTaxInfo.hsnCode,
      gstPercent:         productTaxInfo.gstPercent,
      taxType:            productTaxInfo.taxType,
      unit:               productData.unit,
      unitValue:          productData.unitValue,
      promotor: {
        id:               promotorId,
        commissionRate,
        commissionType,
        commissionAmount,
      },
      seller:             sellerId,
      quantity:           productData.quantity || 0,
      minOrderQuantity:   productData.minOrderQuantity || 1,
      maxOrderQuantity:   productData.maxOrderQuantity || 10,
      stockStatus,
      lowStockThreshold:  productData.lowStockThreshold || 10,
      weight:             productData.weight,
      weightUnit:         productData.weightUnit || "g",
      dimensions:         parsedDimensions,
      images:             uploadedImages,
      delivery: {
        estimatedDeliveryTime: productData.estimatedDeliveryTime,
        deliveryCharges:       productData.deliveryCharges || 0,
        freeDeliveryThreshold: productData.freeDeliveryThreshold || 0,
        availablePincodes:     parsedAvailablePincodes,
      },
      serviceablePincodes: parsedServiceablePincodes,
      variants:            parsedVariants,
      isActive:            true,
    });

    await newProduct.save();

    // Add product to seller's products array
    seller.products.push(newProduct._id);
    await seller.save();

    // Sync product into the seller's shop
    const shop = await Shop.findOne({ seller: sellerId });
    if (shop) {
      shop.products.push(newProduct._id);
      shop.analytics.totalProductsListed = shop.products.length;
      if (categoryId && !shop.categories.some((c) => c.toString() === categoryId.toString())) {
        shop.categories.push(categoryId);
      }
      await shop.save();
      newProduct.shop = shop._id;
      await newProduct.save();
    }

    // Increment promotor's totalProductsAdded counter
    await Promotor.findByIdAndUpdate(promotorId, { $inc: { totalProductsAdded: 1 } });

    res.status(201).json({
      success: true,
      message: "Product added successfully",
      data: newProduct,
    });
  } catch (error) {
    console.error("Promotor addProduct error:", error);
    res.status(500).json({ success: false, message: "Error adding product", error: error.message });
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const promotorId = req.promotor._id;

    const sellerIds = await Seller.find({ promotor: promotorId }).distinct("_id");
    const productIds = await Product.find({ seller: { $in: sellerIds } }).distinct("_id");

    const [
      totalSellers,
      approvedSellers,
      pendingSellers,
      totalProducts,
      totalOrders,
      deliveredOrders,
    ] = await Promise.all([
      Seller.countDocuments({ promotor: promotorId }),
      Seller.countDocuments({ promotor: promotorId, approvalStatus: "approved" }),
      Seller.countDocuments({ promotor: promotorId, approvalStatus: "pending" }),
      Product.countDocuments({ seller: { $in: sellerIds } }),
      Order.countDocuments({ "items.product": { $in: productIds } }),
      Order.countDocuments({ "items.product": { $in: productIds }, status: "delivered" }),
    ]);

    res.status(200).json({
      success: true,
      dashboard: {
        sellers: {
          total: totalSellers,
          approved: approvedSellers,
          pending: pendingSellers,
        },
        products: {
          total: totalProducts,
        },
        orders: {
          total: totalOrders,
          delivered: deliveredOrders,
        },
        commission: {
          rate: req.promotor.commissionRate,
          type: req.promotor.commissionType,
          totalEarned: req.promotor.totalCommissionEarned,
        },
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
