const Order = require("../../models/order");
const Product = require("../../models/product");
const Seller = require("../../models/seller");
const Promotor = require("../../models/promotor");

const getDashboardOverview = async (req, res) => {
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

    const orders = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $nin: ['cancelled'] }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$finalAmount" },
          totalOrders: { $sum: 1 },
          totalWalletDeduction: { $sum: "$walletDeduction" },
          totalCashOnDelivery: { $sum: "$cashOnDelivery" },
          platformServiceFee: { $sum: "$payout.platform.serviceFee" },
          platformGstCollection: { $sum: "$payout.platform.gstCollection" },
          promotorCommission: { $sum: "$payout.promotor.commissionAmount" },
          sellerPayable: { $sum: "$payout.seller.payableAmount" },
          sellerGstDeduction: { $sum: "$payout.seller.gstDeduction" },
          sellerTdsDeduction: { $sum: "$payout.seller.tdsDeduction" },
          sellerNetAmount: { $sum: "$payout.seller.netAmount" }
        }
      }
    ]);

    const ordersToday = await Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(now.setHours(0, 0, 0, 0)),
            $lte: new Date(now.setHours(23, 59, 59, 999))
          },
          status: { $nin: ['cancelled'] }
        }
      },
      { $count: "count" }
    ]);

    const totalProducts = await Product.countDocuments();
    const totalSellers = await Seller.countDocuments({ approvalStatus: 'approved' });
    const totalPromotors = await Promotor.countDocuments({ active: true });

    const result = orders[0] || {
      totalRevenue: 0,
      totalOrders: 0,
      totalWalletDeduction: 0,
      totalCashOnDelivery: 0,
      platformServiceFee: 0,
      platformGstCollection: 0,
      promotorCommission: 0,
      sellerPayable: 0,
      sellerGstDeduction: 0,
      sellerTdsDeduction: 0,
      sellerNetAmount: 0
    };

    const averageOrderValue = result.totalOrders > 0
      ? result.totalRevenue / result.totalOrders
      : 0;

    const totalOnlinePayment = result.totalRevenue - result.totalWalletDeduction - result.totalCashOnDelivery;

    res.json({
      totalRevenue: {
        amount: result.totalRevenue,
        percentageChange: 100.0
      },
      totalOrders: {
        count: result.totalOrders,
        percentageChange: 88.9
      },
      averageOrderValue: {
        amount: averageOrderValue,
        percentageChange: 0
      },
      ordersToday: ordersToday[0]?.count || 0,
      breakdown: {
        paymentMethods: {
          wallet: result.totalWalletDeduction,
          cod: result.totalCashOnDelivery,
          online: totalOnlinePayment
        },
        platformEarnings: {
          serviceFee: result.platformServiceFee,
          gstCollection: result.platformGstCollection,
          total: result.platformServiceFee + result.platformGstCollection
        },
        sellerPayout: {
          payableAmount: result.sellerPayable,
          gstDeduction: result.sellerGstDeduction,
          tdsDeduction: result.sellerTdsDeduction,
          netAmount: result.sellerNetAmount
        },
        promotorCommission: result.promotorCommission
      },
      totals: {
        products: totalProducts,
        sellers: totalSellers,
        promotors: totalPromotors
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getDailySales = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const salesData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $nin: ['cancelled'] }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" }
          },
          revenue: { $sum: "$finalAmount" },
          orders: { $sum: 1 },
          averageOrderValue: { $avg: "$finalAmount" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
    ]);

    const formattedData = salesData.map(item => ({
      date: `${item._id.day}/${item._id.month}/${item._id.year}`,
      revenue: item.revenue,
      orders: item.orders,
      averageOrderValue: item.averageOrderValue
    }));

    res.json({ salesData: formattedData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTopSellers = async (req, res) => {
  try {
    const { filter } = req.query;
    let startDate, endDate;

    const now = new Date();
    switch (filter) {
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case 'year':
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      default:
        startDate = new Date(now.setDate(now.getDate() - 30));
    }

    const topSellers = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: new Date() },
          status: { $nin: ['cancelled'] }
        }
      },
      {
        $group: {
          _id: "$seller",
          totalRevenue: { $sum: "$finalAmount" },
          totalOrders: { $sum: 1 },
          averageOrderValue: { $avg: "$finalAmount" },
          commissionPaid: { $sum: "$payout.seller.netAmount" }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "sellers",
          localField: "_id",
          foreignField: "_id",
          as: "sellerInfo"
        }
      },
      { $unwind: "$sellerInfo" },
      {
        $project: {
          sellerId: "$_id",
          sellerName: "$sellerInfo.name",
          businessName: "$sellerInfo.businessName",
          totalRevenue: 1,
          totalOrders: 1,
          averageOrderValue: 1,
          commissionPaid: 1
        }
      }
    ]);

    res.json({ topSellers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTopPromotors = async (req, res) => {
  try {
    const { filter } = req.query;
    let startDate, endDate;

    const now = new Date();
    switch (filter) {
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case 'year':
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      default:
        startDate = new Date(now.setDate(now.getDate() - 30));
    }

    const topPromotors = await Seller.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: new Date() },
          approvalStatus: 'approved'
        }
      },
      {
        $group: {
          _id: "$promotor",
          sellersAdded: { $sum: 1 },
          totalProducts: { $sum: { $size: "$products" } }
        }
      },
      { $sort: { sellersAdded: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "promotors",
          localField: "_id",
          foreignField: "_id",
          as: "promotorInfo"
        }
      },
      { $unwind: "$promotorInfo" },
      {
        $lookup: {
          from: "orders",
          let: { promotorId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $gte: ["$createdAt", startDate] },
                    { $lte: ["$createdAt", new Date()] }
                  ]
                }
              }
            },
            {
              $lookup: {
                from: "sellers",
                localField: "seller",
                foreignField: "_id",
                as: "sellerInfo"
              }
            },
            { $unwind: "$sellerInfo" },
            {
              $match: {
                $expr: { $eq: ["$sellerInfo.promotor", "$$promotorId"] }
              }
            },
            {
              $group: {
                _id: null,
                totalCommission: { $sum: "$payout.promotor.commissionAmount" }
              }
            }
          ],
          as: "commissionData"
        }
      },
      {
        $project: {
          promotorId: "$_id",
          promotorName: "$promotorInfo.name",
          email: "$promotorInfo.email",
          phone: "$promotorInfo.phone",
          city: "$promotorInfo.address.city",
          sellersAdded: 1,
          totalProducts: 1,
          totalCommission: { $arrayElemAt: ["$commissionData.totalCommission", 0] } || 0
        }
      }
    ]);

    res.json({ topPromotors });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getDashboardOverview,
  getDailySales,
  getTopSellers,
  getTopPromotors
};