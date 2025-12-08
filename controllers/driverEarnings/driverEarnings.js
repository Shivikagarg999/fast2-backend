const DriverEarning = require('../../models/driverEarnings');
const Driver = require('../../models/driver');

exports.getEarningsBreakdown = async (req, res) => {
  try {
    const driverId = req.driver.driverId;
    const { 
      page = 1, 
      limit = 20,
      startDate,
      endDate,
      type 
    } = req.query;

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ 
        success: false, 
        message: "Driver not found" 
      });
    }

    const filter = { driver: driverId };
    
    if (startDate || endDate) {
      filter.transactionDate = {};
      if (startDate) filter.transactionDate.$gte = new Date(startDate);
      if (endDate) filter.transactionDate.$lte = new Date(endDate);
    }
    
    if (type) filter.type = type;

    const earnings = await DriverEarning.find(filter)
      .populate('order', 'orderId finalAmount createdAt')
      .sort({ transactionDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const formattedEarnings = earnings.map(earning => ({
      id: earning._id,
      orderId: earning.orderId,
      amount: earning.amount,
      type: earning.type,
      description: earning.description,
      date: earning.transactionDate,
      status: earning.status,
      deliveryAddress: earning.customerAddress ? {
        addressLine: earning.customerAddress.addressLine,
        city: earning.customerAddress.city,
        state: earning.customerAddress.state,
        pinCode: earning.customerAddress.pincode || earning.customerAddress.pinCode
      } : null,
      orderAmount: earning.order?.finalAmount || 0
    }));

    const total = await DriverEarning.countDocuments(filter);

    const summary = await DriverEarning.aggregate([
      { $match: { driver: driverId } },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: '$amount' },
          totalDeliveries: { $sum: 1 },
          todayEarnings: {
            $sum: {
              $cond: [
                { 
                  $gte: [
                    '$transactionDate', 
                    new Date(new Date().setHours(0, 0, 0, 0))
                  ]
                },
                '$amount',
                0
              ]
            }
          },
          pendingPayout: {
            $sum: {
              $cond: [{ $eq: ['$status', 'earned'] }, '$amount', 0]
            }
          }
        }
      }
    ]);

    const stats = summary[0] || {
      totalEarnings: 0,
      totalDeliveries: 0,
      todayEarnings: 0,
      pendingPayout: 0
    };

    res.status(200).json({
      success: true,
      data: {
        earnings: formattedEarnings,
        summary: {
          totalEarnings: driver.earnings.totalEarnings,
          currentBalance: driver.earnings.currentBalance,
          pendingPayout: stats.pendingPayout,
          todayEarnings: driver.earnings.todayEarnings,
          totalDeliveries: stats.totalDeliveries
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalEarnings: total,
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error("Error fetching earnings breakdown:", error);
    res.status(500).json({ 
      success: false, 
      message: "Internal Server Error" 
    });
  }
};

exports.getEarningsSummary = async (req, res) => {
  try {
    const driverId = req.driver.driverId;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const dailyEarnings = await DriverEarning.aggregate([
      {
        $match: {
          driver: driverId,
          transactionDate: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$transactionDate" } },
          total: { $sum: '$amount' },
          deliveries: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const weeklyEarnings = await DriverEarning.aggregate([
      {
        $match: {
          driver: driverId,
          transactionDate: { $gte: fourWeeksAgo }
        }
      },
      {
        $group: {
          _id: { week: { $week: "$transactionDate" }, year: { $year: "$transactionDate" } },
          total: { $sum: '$amount' },
          deliveries: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.week': 1 } }
    ]);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyEarnings = await DriverEarning.aggregate([
      {
        $match: {
          driver: driverId,
          transactionDate: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: { month: { $month: "$transactionDate" }, year: { $year: "$transactionDate" } },
          total: { $sum: '$amount' },
          deliveries: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        dailyEarnings,
        weeklyEarnings,
        monthlyEarnings
      }
    });

  } catch (error) {
    console.error("Error fetching earnings summary:", error);
    res.status(500).json({ 
      success: false, 
      message: "Internal Server Error" 
    });
  }
};