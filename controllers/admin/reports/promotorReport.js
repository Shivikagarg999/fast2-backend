// controllers/admin/reports/promotorReport.js
const Promotor = require("../../../models/promotor");
const Seller = require("../../../models/seller");
const Product = require("../../../models/product");
const Order = require("../../../models/order");

const getPromotorReport = async (req, res) => {
  try {
    const {
      promotorId,
      active,
      format = "json",
      page = 1,
      limit = 20
    } = req.query;

    const filter = {};
    if (promotorId) filter._id = promotorId;
    if (active !== undefined) filter.active = active === 'true';

    // Get total count for pagination
    const totalCount = await Promotor.countDocuments(filter);

    const promotors = await Promotor.find(filter)
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    const reportData = await Promise.all(promotors.map(async (promotor) => {
      // Get all sellers under this promotor
      const sellers = await Seller.find({ promotor: promotor._id })
        .select("name email phone businessName totalOrders totalEarnings")
        .lean();

      // Get all products added by this promotor's sellers
      const products = await Product.find({ 
        seller: { $in: sellers.map(s => s._id) } 
      }).populate("seller", "businessName").lean();

      // Get all orders through this promotor's sellers
      const orders = await Order.find({
        seller: { $in: sellers.map(s => s._id) }
      }).lean();

      // Calculate commission from orders
      let totalCommissionFromOrders = 0;
      orders.forEach(order => {
        if (order.payout?.promotor?.commissionAmount) {
          totalCommissionFromOrders += order.payout.promotor.commissionAmount;
        }
      });

      const totalSales = orders.reduce((sum, o) => sum + o.finalAmount, 0);
      const totalOrders = orders.length;
      const completedOrders = orders.filter(o => o.status === 'delivered').length;

      return {
        promotorId: promotor._id,
        name: promotor.name,
        email: promotor.email,
        phone: promotor.phone,
        address: promotor.address ? 
          `${promotor.address.street}, ${promotor.address.city}, ${promotor.address.state} - ${promotor.address.pincode}` : 'N/A',
        commissionRate: promotor.commissionRate,
        commissionType: promotor.commissionType,
        bankAccountNumber: promotor.bankDetails?.accountNumber ? `****${promotor.bankDetails.accountNumber.slice(-4)}` : 'N/A',
        bankIFSC: promotor.bankDetails?.ifscCode || 'N/A',
        bankName: promotor.bankDetails?.bankName || 'N/A',
        totalProductsAdded: promotor.totalProductsAdded || 0,
        totalCommissionEarned: promotor.totalCommissionEarned || 0,
        totalCommissionFromOrders,
        totalSellers: sellers.length,
        sellersList: sellers.map(s => ({
          name: s.name,
          businessName: s.businessName,
          email: s.email,
          phone: s.phone,
          totalOrders: s.totalOrders || 0,
          totalEarnings: s.totalEarnings || 0
        })),
        totalProducts: products.length,
        totalSales,
        totalOrders,
        completedOrders,
        pendingOrders: orders.filter(o => o.status === 'pending').length,
        cancelledOrders: orders.filter(o => o.status === 'cancelled').length,
        active: promotor.active,
        joinedAt: new Date(promotor.createdAt).toLocaleString(),
        lastUpdated: new Date(promotor.updatedAt).toLocaleString()
      };
    }));

    // Calculate summary from all data without pagination limit
    const allPromotorsForSummary = await Promotor.find(filter).lean();
    const allSellersForSummary = await Seller.find({ 
      promotor: { $in: allPromotorsForSummary.map(p => p._id) } 
    }).lean();
    const allOrdersForSummary = await Order.find({ 
      seller: { $in: allSellersForSummary.map(s => s._id) } 
    }).lean();
    
    const summary = {
      totalPromotors: totalCount,
      totalSellers: allSellersForSummary.length,
      totalCommission: allPromotorsForSummary.reduce((sum, p) => sum + (p.totalCommissionEarned || 0), 0),
      totalSales: allOrdersForSummary.reduce((sum, o) => sum + (o.finalAmount || 0), 0),
      totalOrders: allOrdersForSummary.length,
      activePromotors: allPromotorsForSummary.filter(p => p.active).length
    };

    if (format === 'csv') {
      const csvHeaders = [
        'Promotor Name', 'Email', 'Phone', 'Address', 'Commission Rate (%)',
        'Commission Type', 'Total Sellers', 'Total Products Added',
        'Total Commission Earned', 'Total Sales', 'Total Orders',
        'Completed Orders', 'Pending Orders', 'Cancelled Orders',
        'Active Status', 'Joined Date'
      ];

      const csvRows = reportData.map(promotor => [
        promotor.name, promotor.email, promotor.phone, promotor.address,
        promotor.commissionRate, promotor.commissionType, promotor.totalSellers,
        promotor.totalProductsAdded, promotor.totalCommissionEarned,
        promotor.totalSales, promotor.totalOrders, promotor.completedOrders,
        promotor.pendingOrders, promotor.cancelledOrders,
        promotor.active ? 'Active' : 'Inactive', promotor.joinedAt
      ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','));

      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="promotor_report_${Date.now()}.csv"`);
      return res.send(csvContent);
    }

    res.json({
      success: true,
      summary,
      data: reportData,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalRecords: totalCount,
        recordsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Error in getPromotorReport:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { getPromotorReport };