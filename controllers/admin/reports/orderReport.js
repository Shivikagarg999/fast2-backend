// controllers/admin/reports/orderReport.js
const Order = require("../../../models/order");
const { roundMoney } = require("../../../utils/orderAmounts");

const getOrderReport = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      status,
      paymentStatus,
      sellerId,
      format = "json",
      page = 1,
      limit = 20
    } = req.query;

    const filter = {};

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (sellerId) filter.seller = sellerId;

    // Get total count for pagination
    const totalCount = await Order.countDocuments(filter);

    const orders = await Order.find(filter)
      .populate("user", "name email phone")
      .populate({
        path: "driver",
        model: "Driver",
        select: "personalInfo.name personalInfo.email personalInfo.phone workInfo.driverId workInfo.availability"
      })
      .populate({
        path: "seller",
        model: "Seller",
        select: "name email phone businessName gstNumber panNumber"
      })
      .populate("items.product", "name price gstPercent hsnCode")
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    // Transform orders to human-readable format
    const reportData = orders.map(order => ({
      orderId: order.orderId,
      orderDate: order.createdAt ? new Date(order.createdAt).toLocaleString() : 'N/A',
      status: order.status,
      customerName: order.user?.name || 'N/A',
      customerEmail: order.user?.email || 'N/A',
      customerPhone: order.user?.phone || 'N/A',
      customerAddress: order.shippingAddress ? 
        `${order.shippingAddress.addressLine}, ${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pinCode}` : 'N/A',
      sellerName: order.seller?.businessName || order.seller?.name || 'N/A',
      sellerEmail: order.seller?.email || 'N/A',
      sellerPhone: order.seller?.phone || 'N/A',
      driverName: order.driver?.personalInfo?.name || 'Not Assigned',
      driverPhone: order.driver?.personalInfo?.phone || 'N/A',
      itemsCount: order.items.length,
      itemsList: order.items.map(item => ({
        productName: item.product?.name || 'N/A',
        quantity: item.quantity,
        pricePerUnit: item.price,
        totalPrice: item.price * item.quantity,
        gstPercent: item.gstPercent
      })),
      subtotal: roundMoney(
        order.subtotal || order.items.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0)
      ),
      totalOrderValue: roundMoney(order.finalAmount || order.total),
      handlingCharge: order.handlingCharge,
      totalGST: order.totalGst,
      couponCode: order.coupon?.code || 'None',
      couponDiscount: order.coupon?.discount || 0,
      finalAmount: order.finalAmount,
      walletDeduction: order.walletDeduction,
      cashOnDelivery: order.cashOnDelivery,
      paymentMethod: order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online Payment',
      paymentStatus: order.paymentStatus,
      sellerPayableAmount: order.payout?.seller?.payableAmount || 0,
      sellerGSTDeduction: order.payout?.seller?.gstDeduction || 0,
      sellerTDSDeduction: order.payout?.seller?.tdsDeduction || 0,
      sellerNetAmount: order.payout?.seller?.netAmount || 0,
      sellerPayoutStatus: order.payout?.seller?.payoutStatus || 'N/A',
      promotorCommissionAmount: order.payout?.promotor?.commissionAmount || 0,
      promotorCommissionType: order.payout?.promotor?.commissionType || 'N/A',
      promotorCommissionRate: order.payout?.promotor?.commissionRate || 0,
      promotorPayoutStatus: order.payout?.promotor?.payoutStatus || 'N/A',
      platformServiceFee: order.payout?.platform?.serviceFee || 0,
      platformGSTCollection: order.payout?.platform?.gstCollection || 0,
      refundAmount: order.refundAmount || 0,
      refundStatus: order.refundStatus || 'None',
      createdAt: new Date(order.createdAt).toLocaleString()
    }));

    // Calculate summary from all data without pagination limit
    const allOrdersForSummary = await Order.find(filter).lean();
    const summary = {
      totalOrders: totalCount,
      totalRevenue: allOrdersForSummary.reduce((sum, o) => sum + (o.finalAmount || 0), 0),
      totalPlatformFees: allOrdersForSummary.reduce((sum, o) => sum + (o.payout?.platform?.serviceFee || 0), 0),
      totalPromotorCommission: allOrdersForSummary.reduce((sum, o) => sum + (o.payout?.promotor?.commissionAmount || 0), 0),
      totalSellerPayout: allOrdersForSummary.reduce((sum, o) => sum + (o.payout?.seller?.netAmount || 0), 0),
      ordersByStatus: allOrdersForSummary.reduce((acc, o) => {
        acc[o.status] = (acc[o.status] || 0) + 1;
        return acc;
      }, {})
    };

    if (format === 'csv') {
      const csvHeaders = [
        'Order ID', 'Order Date', 'Status', 'Customer Name', 'Customer Email', 'Customer Phone',
        'Seller Name', 'Seller Email', 'Driver Name', 'Driver Phone', 'Items Count',
        'Items Subtotal', 'Handling Charge', 'Total GST', 'Total Order Value', 'Payment Method', 'Payment Status',
        'Seller Net Amount', 'Promotor Commission', 'Platform Fee', 'Refund Amount', 'Refund Status'
      ];

      const csvRows = reportData.map(order => [
        order.orderId, order.orderDate, order.status, order.customerName, order.customerEmail, order.customerPhone,
        order.sellerName, order.sellerEmail, order.driverName, order.driverPhone, order.itemsCount,
        order.subtotal, order.handlingCharge, order.totalGST, order.totalOrderValue, order.paymentMethod, order.paymentStatus,
        order.sellerNetAmount, order.promotorCommissionAmount, order.platformServiceFee, order.refundAmount, order.refundStatus
      ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','));

      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="order_report_${Date.now()}.csv"`);
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
    console.error("Error in getOrderReport:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { getOrderReport };
