// controllers/admin/reports/sellerReport.js
const Seller = require("../../../models/seller");
const Order = require("../../../models/order");
const Product = require("../../../models/product");

const getSellerReport = async (req, res) => {
  try {
    const {
      sellerId,
      approvalStatus,
      format = "json",
      page = 1,
      limit = 20
    } = req.query;

    const filter = {};
    if (sellerId) filter._id = sellerId;
    if (approvalStatus) filter.approvalStatus = approvalStatus;

    // Get total count for pagination
    const totalCount = await Seller.countDocuments(filter);

    const sellers = await Seller.find(filter)
      .populate("promotor", "name email phone commissionRate commissionType")
      .populate("shop", "name address")
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    const reportData = await Promise.all(sellers.map(async (seller) => {
      // Get seller's orders
      const orders = await Order.find({ seller: seller._id }).lean();
      
      // Get seller's products
      const products = await Product.find({ seller: seller._id })
        .populate("category", "name")
        .lean();

      // Calculate statistics
      const totalSales = orders.reduce((sum, o) => sum + o.finalAmount, 0);
      const totalOrders = orders.length;
      const completedOrders = orders.filter(o => o.status === 'delivered').length;
      const cancelledOrders = orders.filter(o => o.status === 'cancelled').length;
      const pendingOrders = orders.filter(o => o.status === 'pending').length;
      
      const totalPayoutReceived = orders.reduce((sum, o) => sum + (o.payout?.seller?.netAmount || 0), 0);
      const pendingPayout = orders.reduce((sum, o) => 
        o.payout?.seller?.payoutStatus === 'pending' ? sum + (o.payout?.seller?.netAmount || 0) : sum, 0);
      
      const totalProducts = products.length;
      const activeProducts = products.filter(p => p.isActive).length;
      const outOfStockProducts = products.filter(p => p.stockStatus === 'out-of-stock').length;
      
      const totalGSTCollected = orders.reduce((sum, o) => sum + (o.payout?.seller?.gstDeduction || 0), 0);
      const totalTDSDeducted = orders.reduce((sum, o) => sum + (o.payout?.seller?.tdsDeduction || 0), 0);
      const totalPlatformFees = orders.reduce((sum, o) => sum + (o.payout?.platform?.serviceFee || 0), 0);

      return {
        sellerId: seller._id,
        name: seller.name,
        email: seller.email,
        phone: seller.phone,
        businessName: seller.businessName,
        gstNumber: seller.gstNumber || 'N/A',
        panNumber: seller.panNumber || 'N/A',
        fssaiNumber: seller.fssaiNumber || 'N/A',
        address: seller.address ? 
          `${seller.address.street}, ${seller.address.city}, ${seller.address.state} - ${seller.address.pincode}` : 'N/A',
        bankAccountHolder: seller.bankDetails?.accountHolder || 'N/A',
        bankAccountNumber: seller.bankDetails?.accountNumber ? `****${seller.bankDetails.accountNumber.slice(-4)}` : 'N/A',
        bankIFSC: seller.bankDetails?.ifscCode || 'N/A',
        bankName: seller.bankDetails?.bankName || 'N/A',
        promotorName: seller.promotor?.name || 'N/A',
        promotorEmail: seller.promotor?.email || 'N/A',
        promotorPhone: seller.promotor?.phone || 'N/A',
        promotorCommissionRate: seller.promotor?.commissionRate || 0,
        totalSales,
        totalOrders,
        completedOrders,
        cancelledOrders,
        pendingOrders,
        orderCompletionRate: totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(2) : 0,
        totalPayoutReceived,
        pendingPayout,
        totalGSTCollected,
        totalTDSDeducted,
        totalPlatformFees,
        totalProducts,
        activeProducts,
        outOfStockProducts,
        inStockProducts: activeProducts - outOfStockProducts,
        approvalStatus: seller.approvalStatus,
        isActive: seller.isActive,
        rating: seller.rating,
        joinedAt: new Date(seller.createdAt).toLocaleString(),
        approvedAt: seller.approvedAt ? new Date(seller.approvedAt).toLocaleString() : 'Not Approved'
      };
    }));

    // Calculate summary from all data without pagination limit
    const allSellersForSummary = await Seller.find(filter).lean();
    const allOrdersForSummary = await Order.find({ seller: { $in: allSellersForSummary.map(s => s._id) } }).lean();
    const allProductsForSummary = await Product.find({ seller: { $in: allSellersForSummary.map(s => s._id) } }).lean();
    
    const summary = {
      totalSellers: totalCount,
      totalSales: allOrdersForSummary.reduce((sum, o) => sum + (o.finalAmount || 0), 0),
      totalOrders: allOrdersForSummary.length,
      totalPayout: allOrdersForSummary.reduce((sum, o) => sum + (o.payout?.seller?.netAmount || 0), 0),
      totalProducts: allProductsForSummary.length,
      approvedSellers: allSellersForSummary.filter(s => s.approvalStatus === 'approved').length,
      pendingApproval: allSellersForSummary.filter(s => s.approvalStatus === 'pending').length
    };

    if (format === 'csv') {
      const csvHeaders = [
        'Seller Name', 'Business Name', 'Email', 'Phone', 'GST Number', 'PAN Number',
        'Promotor Name', 'Total Sales', 'Total Orders', 'Completed Orders',
        'Cancelled Orders', 'Order Completion Rate (%)', 'Total Payout Received',
        'Total Products', 'Active Products', 'Out of Stock Products', 'Approval Status', 'Rating'
      ];

      const csvRows = reportData.map(seller => [
        seller.name, seller.businessName, seller.email, seller.phone,
        seller.gstNumber, seller.panNumber, seller.promotorName,
        seller.totalSales, seller.totalOrders, seller.completedOrders,
        seller.cancelledOrders, seller.orderCompletionRate, seller.totalPayoutReceived,
        seller.totalProducts, seller.activeProducts, seller.outOfStockProducts,
        seller.approvalStatus, seller.rating
      ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','));

      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="seller_report_${Date.now()}.csv"`);
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
    console.error("Error in getSellerReport:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { getSellerReport };