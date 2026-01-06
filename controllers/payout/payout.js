const SellerPayout = require("../../models/sellerPayout");
const PromotorPayout = require("../../models/promotorPayout");
const Order = require("../../models/order");
const Seller = require("../../models/seller");
const Promotor = require("../../models/promotor");
const mongoose= require("mongoose");

const getSellerOwnPayouts = async (req, res) => {
  try {
    if (!req.seller) {
      return res.status(401).json({
        success: false,
        message: "Seller authentication required"
      });
    }

    const { status, startDate, endDate, page = 1, limit = 10 } = req.query;
    const filter = { seller: req.seller._id }; // Only get payouts for authenticated seller
    
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    
    const skip = (page - 1) * limit;
    
    const payouts = await SellerPayout.find(filter)
      .populate('order', 'orderId finalAmount status createdAt')
      .populate('seller', 'name businessName email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await SellerPayout.countDocuments(filter);

    // Calculate summary statistics
    const summary = await SellerPayout.aggregate([
      {
        $match: { seller: new mongoose.Types.ObjectId(req.seller._id) }
      },
      {
        $group: {
          _id: "$status",
          totalAmount: { $sum: "$netAmount" },
          count: { $sum: 1 }
        }
      }
    ]);

    // Calculate available balance (delivered orders - paid payouts)
    const deliveredOrders = await Order.aggregate([
      {
        $match: {
          seller: new mongoose.Types.ObjectId(req.seller._id),
          status: 'delivered'
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$finalAmount" }
        }
      }
    ]);

    const paidPayouts = await SellerPayout.aggregate([
      {
        $match: {
          seller: new mongoose.Types.ObjectId(req.seller._id),
          status: 'paid'
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$netAmount" }
        }
      }
    ]);

    const availableBalance = (deliveredOrders[0]?.totalAmount || 0) - (paidPayouts[0]?.totalAmount || 0);

    res.json({
      success: true,
      data: {
        payouts,
        summary: {
          availableBalance: Math.max(0, availableBalance),
          pendingAmount: summary.find(s => s._id === 'pending')?.totalAmount || 0,
          paidAmount: summary.find(s => s._id === 'paid')?.totalAmount || 0,
          pendingCount: summary.find(s => s._id === 'pending')?.count || 0,
          paidCount: summary.find(s => s._id === 'paid')?.count || 0,
          totalPayouts: total
        }
      },
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error in getSellerOwnPayouts:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

const getSellerOwnPayoutDetails = async (req, res) => {
  try {
    if (!req.seller) {
      return res.status(401).json({
        success: false,
        message: "Seller authentication required"
      });
    }

    const { filter = 'month', page = 1, limit = 10 } = req.query;
    
    let startDate, endDate;
    const now = new Date();
    
    switch (filter) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date(now.setHours(23, 59, 59, 999));
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        endDate = new Date();
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
      default:
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        endDate = new Date();
    }

    const skip = (page - 1) * limit;

    const payouts = await SellerPayout.find({
      seller: req.seller._id,
      createdAt: { $gte: startDate, $lte: endDate }
    })
    .populate('order', 'orderId finalAmount status createdAt')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    const summary = await SellerPayout.aggregate([
      {
        $match: {
          seller: new mongoose.Types.ObjectId(req.seller._id),
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

    // Calculate totals
    const totalPayouts = await SellerPayout.countDocuments({
      seller: req.seller._id,
      createdAt: { $gte: startDate, $lte: endDate }
    });

    // Calculate available balance
    const deliveredOrders = await Order.aggregate([
      {
        $match: {
          seller: new mongoose.Types.ObjectId(req.seller._id),
          status: 'delivered',
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$finalAmount" }
        }
      }
    ]);

    const paidPayouts = await SellerPayout.aggregate([
      {
        $match: {
          seller: new mongoose.Types.ObjectId(req.seller._id),
          status: 'paid',
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$netAmount" }
        }
      }
    ]);

    const availableBalance = (deliveredOrders[0]?.totalAmount || 0) - (paidPayouts[0]?.totalAmount || 0);

    res.json({
      success: true,
      data: {
        seller: {
          _id: req.seller._id,
          name: req.seller.name,
          businessName: req.seller.businessName,
          email: req.seller.email,
          phone: req.seller.phone,
          gstNumber: req.seller.gstNumber,
          bankDetails: req.seller.bankDetails
        },
        payouts,
        summary: {
          availableBalance: Math.max(0, availableBalance),
          pendingAmount: summary.find(s => s._id === 'pending')?.totalAmount || 0,
          paidAmount: summary.find(s => s._id === 'paid')?.totalAmount || 0,
          pendingCount: summary.find(s => s._id === 'pending')?.count || 0,
          paidCount: summary.find(s => s._id === 'paid')?.count || 0,
          byStatus: summary
        },
        period: {
          startDate,
          endDate,
          filter
        },
        pagination: {
          total: totalPayouts,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalPayouts / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error in getSellerOwnPayoutDetails:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

const requestPayout = async (req, res) => {
  try {
    if (!req.seller) {
      return res.status(401).json({
        success: false,
        message: "Seller authentication required"
      });
    }

    const { orderIds, payoutMethod, accountDetails, notes } = req.body;
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one order is required for payout'
      });
    }

    // Get seller's pending payouts for the specified orders
    const pendingPayouts = await SellerPayout.find({
      _id: { $in: orderIds },
      seller: req.seller._id,
      status: 'pending'
    });

    if (pendingPayouts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No eligible payouts found for the specified orders'
      });
    }

    // Calculate total amount
    const totalAmount = pendingPayouts.reduce((sum, payout) => sum + payout.netAmount, 0);

    // Update payout status to processing and add payment details
    await SellerPayout.updateMany(
      { _id: { $in: pendingPayouts.map(p => p._id) } },
      {
        status: 'processing',
        paymentMethod: payoutMethod || 'bank_transfer',
        remarks: notes || 'Payout requested by seller'
      }
    );

    // Here you would typically:
    // 1. Create a payout request record
    // 2. Initiate payment through payment gateway
    // 3. Send notification to admin

    res.json({
      success: true,
      message: 'Payout request submitted successfully',
      data: {
        totalAmount,
        payoutCount: pendingPayouts.length,
        estimatedProcessingTime: '3-5 business days'
      }
    });

  } catch (error) {
    console.error('Error in requestPayout:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const getSellerPayouts = async (req, res) => {
  try {
    const { 
      sellerId, 
      status, 
      startDate, 
      endDate, 
      page = 1, 
      limit = 10,
      view = 'detailed'
    } = req.query;
    
    const filter = {};
    
    if (sellerId) filter.seller = sellerId;
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    
    const skip = (page - 1) * limit;
    
    if (view === 'aggregated') {
      const aggregatedData = await SellerPayout.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: "sellers",
            localField: "seller",
            foreignField: "_id",
            as: "sellerInfo"
          }
        },
        { $unwind: { path: "$sellerInfo", preserveNullAndEmptyArrays: true } },
        
        {
          $group: {
            _id: "$seller",
            sellerId: { $first: "$seller" },
            sellerName: { $first: "$sellerInfo.name" },
            businessName: { $first: "$sellerInfo.businessName" },
            sellerEmail: { $first: "$sellerInfo.email" },
            sellerPhone: { $first: "$sellerInfo.phone" },
            sellerBankDetails: { $first: "$sellerInfo.bankDetails" },
            totalOrderAmount: { $sum: "$orderAmount" },
            totalPlatformFee: { $sum: "$platformFee" },
            totalGstOnPlatformFee: { $sum: "$gstOnPlatformFee" },
            totalTdsDeduction: { $sum: "$tdsDeduction" },
            totalPayableAmount: { $sum: "$payableAmount" },
            totalNetAmount: { $sum: "$netAmount" },
            
            totalOrders: { $sum: 1 },
            pendingOrders: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] }
            },
            paidOrders: {
              $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] }
            },
            
            pendingAmount: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$netAmount", 0] }
            },
            paidAmount: {
              $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$netAmount", 0] }
            },
            
            lastUpdated: { $max: "$updatedAt" },
            earliestPayout: { $min: "$createdAt" },
            latestPayout: { $max: "$createdAt" },
            
            statuses: { $push: "$status" }
          }
        },
        {
          $addFields: {
            sellerName: { 
              $ifNull: ["$sellerName", "Seller"] 
            },
            businessName: { 
              $ifNull: ["$businessName", "Business"] 
            },
            sellerEmail: { 
              $ifNull: ["$sellerEmail", ""] 
            },
            sellerPhone: { 
              $ifNull: ["$sellerPhone", ""] 
            },
            bankDetails: { 
              $ifNull: ["$sellerBankDetails", {}] 
            }
          }
        },
        {
          $project: {
            sellerBankDetails: 0,
            statuses: 0
          }
        },
        { $sort: { totalNetAmount: -1 } },
        { $skip: skip },
        { $limit: parseInt(limit) }
      ]);
      
      const totalGroups = await SellerPayout.aggregate([
        { $match: filter },
        { $group: { _id: "$seller" } },
        { $count: "total" }
      ]);
      
      const total = totalGroups.length > 0 ? totalGroups[0].total : 0;
      
      res.json({
        payouts: aggregatedData,
        view: 'aggregated',
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      });
      
    } else {
      const payouts = await SellerPayout.find(filter)
        .populate('order', 'orderId finalAmount status')
        .populate('seller', 'name businessName email phone bankDetails')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));
      
      const total = await SellerPayout.countDocuments(filter);
      
      res.json({
        payouts,
        view: 'detailed',
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      });
    }
  } catch (error) {
    console.error('Error in getSellerPayouts:', error);
    res.status(500).json({ 
      error: error.message,
      success: false 
    });
  }
};

const processBulkPayout = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { status, paymentMethod, transactionId, remarks } = req.body;

    if (!sellerId) {
      return res.status(400).json({ error: 'Seller ID is required' });
    }

    const result = await SellerPayout.updateMany(
      {
        seller: sellerId,
        status: 'pending'
      },
      {
        $set: {
          status: status || 'paid',
          paymentMethod,
          transactionId,
          remarks,
          paidAt: new Date()
        }
      }
    );

    res.json({
      success: true,
      message: `Updated ${result.modifiedCount} payouts`,
      processedCount: result.modifiedCount
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getPromotorPayouts = async (req, res) => {
  try {
    const { 
      promotorId, 
      status, 
      startDate, 
      endDate, 
      page = 1, 
      limit = 10,
      view = 'detailed'
    } = req.query;
    
    const filter = {};
    
    if (promotorId) filter.promotor = promotorId;
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    
    const skip = (page - 1) * limit;
    
    if (view === 'aggregated') {
      const aggregatedData = await PromotorPayout.aggregate([
        { $match: filter },
        
        {
          $lookup: {
            from: "promotors", 
            localField: "promotor",
            foreignField: "_id",
            as: "promotorInfo"
          }
        },
        { $unwind: { path: "$promotorInfo", preserveNullAndEmptyArrays: true } },
        
        {
          $group: {
            _id: "$promotor",
            promotorId: { $first: "$promotor" },
            
            promotorName: { $first: "$promotorInfo.name" },
            promotorEmail: { $first: "$promotorInfo.email" },
            promotorPhone: { $first: "$promotorInfo.phone" },
            promotorBankDetails: { $first: "$promotorInfo.bankDetails" },
            
            totalCommissionAmount: { $sum: "$commissionAmount" },
            
            totalOrders: { $sum: 1 },
            pendingOrders: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] }
            },
            paidOrders: {
              $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] }
            },
            
            pendingAmount: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$commissionAmount", 0] }
            },
            paidAmount: {
              $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$commissionAmount", 0] }
            },
            
            lastUpdated: { $max: "$updatedAt" },
            earliestPayout: { $min: "$createdAt" },
            latestPayout: { $max: "$createdAt" }
          }
        },
        {
          $addFields: {
            promotorName: { 
              $ifNull: ["$promotorName", "Promotor"] 
            },
            promotorEmail: { 
              $ifNull: ["$promotorEmail", ""] 
            },
            promotorPhone: { 
              $ifNull: ["$promotorPhone", ""] 
            },
            bankDetails: { 
              $ifNull: ["$promotorBankDetails", {}] 
            }
          }
        },
        {
          $project: {
            promotorBankDetails: 0 
          }
        },
        { $sort: { totalCommissionAmount: -1 } },
        { $skip: skip },
        { $limit: parseInt(limit) }
      ]);

      const totalGroups = await PromotorPayout.aggregate([
        { $match: filter },
        { $group: { _id: "$promotor" } },
        { $count: "total" }
      ]);
      
      const total = totalGroups.length > 0 ? totalGroups[0].total : 0;
      
      res.json({
        payouts: aggregatedData,
        view: 'aggregated',
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      });
      
    } else {
      const payouts = await PromotorPayout.find(filter)
        .populate('order', 'orderId finalAmount')
        .populate('promotor', 'name email phone bankDetails')
        .populate('seller', 'name businessName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));
      
      const total = await PromotorPayout.countDocuments(filter);
      
      res.json({
        payouts,
        view: 'detailed',
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const processBulkPromotorPayout = async (req, res) => {
  try {
    const { promotorId } = req.params;
    const { status, paymentMethod, transactionId, remarks } = req.body;

    if (!promotorId) {
      return res.status(400).json({ error: 'Promotor ID is required' });
    }

    const result = await PromotorPayout.updateMany(
      {
        promotor: promotorId,
        status: 'pending'
      },
      {
        $set: {
          status: status || 'paid',
          paymentMethod,
          transactionId,
          remarks,
          paidAt: new Date()
        }
      }
    );

    res.json({
      success: true,
      message: `Updated ${result.modifiedCount} payouts`,
      processedCount: result.modifiedCount
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
  getSellerOwnPayoutDetails,
  getSellerOwnPayouts,
  requestPayout,
  processBulkPayout,
  processBulkPromotorPayout,
  getSellerPayouts,
  getPromotorPayouts,
  updateSellerPayoutStatus,
  updatePromotorPayoutStatus,
  getPayoutSummary,
  getSellerPayoutDetails,
  getPromotorPayoutDetails
};