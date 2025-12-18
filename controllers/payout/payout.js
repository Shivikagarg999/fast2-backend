const SellerPayout = require("../../models/sellerPayout");
const PromotorPayout = require("../../models/promotorPayout");
const Order = require("../../models/order");
const Seller = require("../../models/seller");
const Promotor = require("../../models/promotor");
const mongoose= require("mongoose");

const getSellerPayouts = async (req, res) => {
  try {
    const { sellerId, status, startDate, endDate, page = 1, limit = 10 } = req.query;
    const filter = {};
    
    if (sellerId) filter.seller = sellerId;
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    
    const skip = (page - 1) * limit;
    
    const payouts = await SellerPayout.find(filter)
      .populate('order', 'orderId finalAmount status')
      .populate('seller', 'name businessName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await SellerPayout.countDocuments(filter);
    
    res.json({
      payouts,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getPromotorPayouts = async (req, res) => {
  try {
    const { promotorId, status, startDate, endDate, page = 1, limit = 10 } = req.query;
    const filter = {};
    
    if (promotorId) filter.promotor = promotorId;
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    
    const skip = (page - 1) * limit;
    
    const payouts = await PromotorPayout.find(filter)
      .populate('order', 'orderId finalAmount')
      .populate('promotor', 'name email phone')
      .populate('seller', 'name businessName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await PromotorPayout.countDocuments(filter);
    
    res.json({
      payouts,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateSellerPayoutStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentMethod, transactionId, remarks } = req.body;
    
    const payout = await SellerPayout.findById(id);
    if (!payout) {
      return res.status(404).json({ error: "Payout not found" });
    }
    
    if (status === 'paid') {
      payout.paidAt = new Date();
      payout.paymentMethod = paymentMethod || payout.paymentMethod;
      payout.transactionId = transactionId;
    }
    
    payout.status = status;
    if (remarks) payout.remarks = remarks;
    
    await payout.save();
    
    res.json(payout);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updatePromotorPayoutStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentMethod, transactionId, remarks } = req.body;
    
    const payout = await PromotorPayout.findById(id);
    if (!payout) {
      return res.status(404).json({ error: "Payout not found" });
    }
    
    if (status === 'paid') {
      payout.paidAt = new Date();
      payout.paymentMethod = paymentMethod || payout.paymentMethod;
      payout.transactionId = transactionId;
    }
    
    payout.status = status;
    if (remarks) payout.remarks = remarks;
    
    await payout.save();
    
    res.json(payout);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getPayoutSummary = async (req, res) => {
  try {
    const { filter } = req.query;
    let startDate, endDate;

    const now = new Date();
    startDate = new Date(now);
    endDate = new Date(now);

    switch (filter) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'week':
        startDate.setDate(now.getDate() - now.getDay());
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(now.getDate() + (6 - now.getDay()));
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'month':
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setMonth(now.getMonth() + 1);
        endDate.setDate(0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'year':
        startDate.setMonth(0, 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setMonth(11, 31);
        endDate.setHours(23, 59, 59, 999);
        break;
      default:
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
    }

    const sellerPayouts = await SellerPayout.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $nin: ['cancelled', 'failed'] }
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$netAmount" },
          totalOrders: { $sum: 1 },
          totalPlatformFee: { $sum: "$platformFee" },
          totalGst: { $sum: "$gstOnPlatformFee" },
          totalTds: { $sum: "$tdsDeduction" }
        }
      }
    ]);

    const promotorPayouts = await PromotorPayout.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $nin: ['cancelled', 'failed'] }
        }
      },
      {
        $group: {
          _id: null,
          totalCommission: { $sum: "$commissionAmount" },
          totalPayouts: { $sum: 1 }
        }
      }
    ]);

    const sellerPayoutResult = sellerPayouts[0] || {
      totalAmount: 0,
      totalOrders: 0,
      totalPlatformFee: 0,
      totalGst: 0,
      totalTds: 0
    };

    const promotorPayoutResult = promotorPayouts[0] || {
      totalCommission: 0,
      totalPayouts: 0
    };

    res.json({
      sellerPayouts: {
        totalAmount: sellerPayoutResult.totalAmount,
        totalOrders: sellerPayoutResult.totalOrders,
        totalPlatformFee: sellerPayoutResult.totalPlatformFee,
        totalGst: sellerPayoutResult.totalGst,
        totalTds: sellerPayoutResult.totalTds
      },
      promotorPayouts: {
        totalCommission: promotorPayoutResult.totalCommission,
        totalPayouts: promotorPayoutResult.totalPayouts
      },
      platformEarnings: {
        serviceFee: sellerPayoutResult.totalPlatformFee,
        gstCollection: sellerPayoutResult.totalGst,
        total: sellerPayoutResult.totalPlatformFee + sellerPayoutResult.totalGst
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getSellerPayoutDetails = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { filter } = req.query;
    
    let startDate, endDate;
    const now = new Date();
    
    switch (filter) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date(now.setHours(23, 59, 59, 999));
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
        break;
      default:
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        endDate = new Date();
    }

    const payouts = await SellerPayout.find({
      seller: sellerId,
      createdAt: { $gte: startDate, $lte: endDate }
    })
    .populate('order', 'orderId product finalAmount status createdAt')
    .sort({ createdAt: -1 });

    const summary = await SellerPayout.aggregate([
      {
        $match: {
          seller: new mongoose.Types.ObjectId(sellerId),
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$status",
          totalAmount: { $sum: "$netAmount" },
          count: { $sum: 1 }
        }
      }
    ]);

    const seller = await Seller.findById(sellerId);

    res.json({
      success: true,
      data: {
        seller: {
          _id: seller?._id,
          name: seller?.name,
          businessName: seller?.businessName,
          email: seller?.email,
          phone: seller?.phone,
          gstNumber: seller?.gstNumber,
          bankDetails: seller?.bankDetails
        },
        payouts,
        summary,
        period: {
          startDate,
          endDate,
          filter: filter || 'year'
        }
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

const getPromotorPayoutDetails = async (req, res) => {
  try {
    const { promotorId } = req.params;
    const { filter } = req.query;
    
    let startDate, endDate;
    const now = new Date();
    
    switch (filter) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date(now.setHours(23, 59, 59, 999));
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
        break;
      default:
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        endDate = new Date();
    }

    const payouts = await PromotorPayout.find({
      promotor: promotorId,
      createdAt: { $gte: startDate, $lte: endDate }
    })
    .populate('order', 'orderId finalAmount createdAt')
    .populate('seller', 'name businessName')
    .sort({ createdAt: -1 });

    const summary = await PromotorPayout.aggregate([
      {
        $match: {
          promotor: new mongoose.Types.ObjectId(promotorId), // Fixed: added 'new' keyword
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$status",
          totalCommission: { $sum: "$commissionAmount" },
          count: { $sum: 1 }
        }
      }
    ]);

    const promotor = await Promotor.findById(promotorId);

    res.json({
      promotor: {
        name: promotor?.name,
        email: promotor?.email,
        phone: promotor?.phone,
        commissionRate: promotor?.commissionRate
      },
      payouts,
      summary,
      period: {
        startDate,
        endDate,
        filter
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getSellerPayouts,
  getPromotorPayouts,
  updateSellerPayoutStatus,
  updatePromotorPayoutStatus,
  getPayoutSummary,
  getSellerPayoutDetails,
  getPromotorPayoutDetails
};