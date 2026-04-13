const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Promotor = require("../../models/promotor");
const Seller = require("../../models/seller");
const Product = require("../../models/product");
const Order = require("../../models/order");
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
