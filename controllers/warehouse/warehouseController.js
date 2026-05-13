const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Warehouse = require("../../models/warehouse");
const Order = require("../../models/order");
const Product = require("../../models/product");
const Seller = require("../../models/seller");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getPagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};

const getWarehouseProductQuery = (warehouse) => ({
  $or: [
    { _id: { $in: warehouse.products || [] } },
    { "warehouse.id": warehouse._id },
  ],
});

const getWarehouseProductIds = async (warehouse) => {
  const products = await Product.find(getWarehouseProductQuery(warehouse)).select("_id");
  return products.map((product) => product._id);
};

// POST /api/warehouse/login
const login = async (req, res) => {
  try {
    const { name, code } = req.body;
    if (!name || !code) {
      return res.status(400).json({ success: false, message: "Warehouse name and code are required" });
    }
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ success: false, message: "JWT secret is not configured" });
    }

    const warehouse = await Warehouse.findOne({
      name: { $regex: `^${escapeRegex(name.trim())}$`, $options: "i" },
      code: String(code).trim(),
    }).populate("promotor", "name email phone");

    if (!warehouse) {
      return res.status(401).json({ success: false, message: "Invalid warehouse name or code" });
    }
    if (!warehouse.isActive) {
      return res.status(403).json({ success: false, message: "Warehouse is inactive. Please contact support." });
    }

    const token = jwt.sign({ id: warehouse._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({
      success: true,
      message: "Login successful",
      token,
      warehouse: {
        _id: warehouse._id,
        name: warehouse.name,
        code: warehouse.code,
        warehouseManager: warehouse.warehouseManager,
        contact: warehouse.contact,
        location: warehouse.location,
        storageType: warehouse.storageType,
        capacity: warehouse.capacity,
        currentStock: warehouse.currentStock,
        isActive: warehouse.isActive,
        promotor: warehouse.promotor,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// GET /api/warehouse/profile
const getProfile = async (req, res) => {
  try {
    const warehouse = await Warehouse.findById(req.warehouse._id)
      .populate("promotor", "name email phone")
      .populate("sellers", "name email phone businessName approvalStatus isActive")
      .populate("products", "name price stockStatus images");

    const products = await Product.find(getWarehouseProductQuery(warehouse))
      .select("name price stockStatus images category seller")
      .populate("category", "name")
      .populate("seller", "name businessName")
      .sort({ createdAt: -1 });

    res.json({ success: true, warehouse, products });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// GET /api/warehouse/products
const getProducts = async (req, res) => {
  try {
    const { search, stockStatus, category } = req.query;
    const { page, limit, skip } = getPagination(req.query);

    if (category && !mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ success: false, message: "Invalid category id" });
    }

    const warehouse = await Warehouse.findById(req.warehouse._id).select("products");
    const productQuery = getWarehouseProductQuery(warehouse);
    if (search) productQuery.name = { $regex: escapeRegex(search.trim()), $options: "i" };
    if (stockStatus) productQuery.stockStatus = stockStatus;
    if (category) productQuery.category = new mongoose.Types.ObjectId(category);

    const [products, total] = await Promise.all([
      Product.find(productQuery)
        .populate("category", "name")
        .populate("seller", "name businessName")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      Product.countDocuments(productQuery),
    ]);

    res.json({
      success: true,
      products,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// GET /api/warehouse/sellers
const getSellers = async (req, res) => {
  try {
    const { search, approvalStatus } = req.query;
    const { page, limit, skip } = getPagination(req.query);

    const warehouse = await Warehouse.findById(req.warehouse._id).select("sellers");
    const sellerIds = warehouse.sellers;

    const sellerQuery = { _id: { $in: sellerIds } };
    if (search) {
      const safeSearch = escapeRegex(search.trim());
      sellerQuery.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { businessName: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
      ];
    }
    if (approvalStatus) sellerQuery.approvalStatus = approvalStatus;

    const [sellers, total] = await Promise.all([
      Seller.find(sellerQuery)
        .select("-password")
        .populate("shop", "name logo isOpen isActive")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      Seller.countDocuments(sellerQuery),
    ]);

    res.json({
      success: true,
      sellers,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// GET /api/warehouse/orders
const getOrders = async (req, res) => {
  try {
    const { status, paymentStatus, paymentMethod, from, to } = req.query;
    const { page, limit, skip } = getPagination(req.query);

    const warehouse = await Warehouse.findById(req.warehouse._id).select("sellers");
    const sellerIds = warehouse.sellers;

    const orderQuery = { seller: { $in: sellerIds } };
    if (status) orderQuery.status = status;
    if (paymentStatus) orderQuery.paymentStatus = paymentStatus;
    if (paymentMethod) orderQuery.paymentMethod = paymentMethod;
    if (from || to) {
      orderQuery.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        if (Number.isNaN(fromDate.getTime())) {
          return res.status(400).json({ success: false, message: "Invalid from date" });
        }
        orderQuery.createdAt.$gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (Number.isNaN(toDate.getTime())) {
          return res.status(400).json({ success: false, message: "Invalid to date" });
        }
        orderQuery.createdAt.$lte = toDate;
      }
    }

    const [orders, total] = await Promise.all([
      Order.find(orderQuery)
        .populate("user", "name email phone")
        .populate("seller", "name businessName")
        .populate("items.product", "name images price")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      Order.countDocuments(orderQuery),
    ]);

    res.json({
      success: true,
      orders,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// GET /api/warehouse/analytics
const getAnalytics = async (req, res) => {
  try {
    const warehouse = await Warehouse.findById(req.warehouse._id).select("sellers products capacity currentStock");
    const sellerIds = warehouse.sellers;
    const productIds = await getWarehouseProductIds(warehouse);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      totalOrders,
      totalRevenue,
      ordersThisMonth,
      revenueThisMonth,
      ordersToday,
      revenueToday,
      ordersByStatus,
      ordersByPaymentMethod,
      monthlyTrend,
      totalSellers,
      activeSellers,
      totalProducts,
    ] = await Promise.all([
      Order.countDocuments({ seller: { $in: sellerIds } }),

      Order.aggregate([
        { $match: { seller: { $in: sellerIds }, paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$finalAmount" } } },
      ]),

      Order.countDocuments({ seller: { $in: sellerIds }, createdAt: { $gte: startOfMonth } }),

      Order.aggregate([
        { $match: { seller: { $in: sellerIds }, paymentStatus: "paid", createdAt: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: "$finalAmount" } } },
      ]),

      Order.countDocuments({ seller: { $in: sellerIds }, createdAt: { $gte: startOfToday } }),

      Order.aggregate([
        { $match: { seller: { $in: sellerIds }, paymentStatus: "paid", createdAt: { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: "$finalAmount" } } },
      ]),

      Order.aggregate([
        { $match: { seller: { $in: sellerIds } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      Order.aggregate([
        { $match: { seller: { $in: sellerIds } } },
        { $group: { _id: "$paymentMethod", count: { $sum: 1 } } },
      ]),

      Order.aggregate([
        {
          $match: {
            seller: { $in: sellerIds },
            paymentStatus: "paid",
            createdAt: { $gte: sixMonthsAgo },
          },
        },
        {
          $group: {
            _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            revenue: { $sum: "$finalAmount" },
            orders: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),

      Seller.countDocuments({ _id: { $in: sellerIds } }),
      Seller.countDocuments({ _id: { $in: sellerIds }, isActive: true, approvalStatus: "approved" }),
      Product.countDocuments({ _id: { $in: productIds } }),
    ]);

    res.json({
      success: true,
      analytics: {
        overview: {
          totalOrders,
          totalRevenue: totalRevenue[0]?.total || 0,
          ordersThisMonth,
          revenueThisMonth: revenueThisMonth[0]?.total || 0,
          ordersToday,
          revenueToday: revenueToday[0]?.total || 0,
          totalSellers,
          activeSellers,
          totalProducts,
          capacity: warehouse.capacity,
          currentStock: warehouse.currentStock,
          utilizationPercent: warehouse.capacity
            ? Math.round((warehouse.currentStock / warehouse.capacity) * 100)
            : 0,
        },
        ordersByStatus,
        ordersByPaymentMethod,
        monthlyTrend,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// GET /api/warehouse/for-pincode
const getWarehouseForPincode = async (req, res) => {
  try {
    const { pincode } = req.query;

    if (!pincode) {
      return res.status(400).json({ success: false, message: "Pincode is required" });
    }

    const pincodeValue = String(pincode).trim();
    const areaCode = escapeRegex(pincodeValue.substring(0, 3));

    let warehouse = await Warehouse.findOne({
      serviceablePincodes: pincodeValue,
      isActive: true,
    });

    if (!warehouse && areaCode) {
      warehouse = await Warehouse.findOne({
        $or: [
          { "location.pincode": new RegExp(`^${areaCode}`) },
          { serviceablePincodes: new RegExp(`^${areaCode}`) },
        ],
        isActive: true,
      });
    }

    if (!warehouse) {
      warehouse = await Warehouse.findOne({ isActive: true });
    }

    if (!warehouse) {
      return res.status(404).json({ success: false, message: "No warehouse found for this pincode" });
    }

    res.json({ success: true, data: warehouse });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

module.exports = { login, getProfile, getProducts, getSellers, getOrders, getAnalytics, getWarehouseForPincode };
