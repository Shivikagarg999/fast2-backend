const DriverEarning = require('../../models/driverEarnings');
const Driver = require('../../models/driver');


exports.getAllEarnings = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      startDate,
      endDate,
      type,
      status,
      driverId,
      sortBy = 'transactionDate',
      sortOrder = 'desc',
      search
    } = req.query;

    const filter = {};

    if (startDate || endDate) {
      filter.transactionDate = {};
      if (startDate) filter.transactionDate.$gte = new Date(startDate);
      if (endDate) filter.transactionDate.$lte = new Date(endDate);
    }

    if (type) filter.type = type;
    if (status) filter.status = status;
    if (driverId) filter.driver = driverId;

    if (search) {
      const drivers = await Driver.find({
        $or: [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phoneNumber: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');

      const driverIds = drivers.map(d => d._id);
      
      filter.$or = [
        { driver: { $in: driverIds } },
        { orderId: { $regex: search, $options: 'i' } }
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const earnings = await DriverEarning.find(filter)
      .populate('driver', 'fullName email phoneNumber vehicleNumber')
      .populate('order', 'orderId finalAmount createdAt deliveryAddress')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await DriverEarning.countDocuments(filter);

    const formattedEarnings = earnings.map(earning => ({
      id: earning._id,
      driver: earning.driver ? {
        id: earning.driver._id,
        name: earning.driver.fullName,
        email: earning.driver.email,
        phone: earning.driver.phoneNumber,
        vehicleNumber: earning.driver.vehicleNumber
      } : null,
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
      } : (earning.order?.deliveryAddress ? {
        addressLine: earning.order.deliveryAddress.addressLine,
        city: earning.order.deliveryAddress.city,
        state: earning.order.deliveryAddress.state,
        pinCode: earning.order.deliveryAddress.pincode || earning.order.deliveryAddress.pinCode
      } : null),
      orderAmount: earning.order?.finalAmount || 0,
      orderDate: earning.order?.createdAt || null
    }));

    const summary = await DriverEarning.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: '$amount' },
          totalTransactions: { $sum: 1 },
          totalDrivers: { $addToSet: '$driver' },
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
          },
          completedPayout: {
            $sum: {
              $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0]
            }
          },
          byType: {
            $push: {
              type: '$type',
              amount: '$amount'
            }
          }
        }
      }
    ]);

    const typeBreakdown = {};
    if (summary[0] && summary[0].byType) {
      summary[0].byType.forEach(item => {
        typeBreakdown[item.type] = (typeBreakdown[item.type] || 0) + item.amount;
      });
    }

    const stats = summary[0] || {
      totalEarnings: 0,
      totalTransactions: 0,
      totalDrivers: [],
      todayEarnings: 0,
      pendingPayout: 0,
      completedPayout: 0
    };

    res.status(200).json({
      success: true,
      data: {
        earnings: formattedEarnings,
        summary: {
          totalEarnings: stats.totalEarnings,
          totalTransactions: stats.totalTransactions,
          totalDrivers: stats.totalDrivers?.length || 0,
          todayEarnings: stats.todayEarnings,
          pendingPayout: stats.pendingPayout,
          completedPayout: stats.completedPayout,
          typeBreakdown: typeBreakdown
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          hasNext: page * limit < total,
          hasPrev: page > 1,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error("Error fetching all earnings:", error);
    res.status(500).json({ 
      success: false, 
      message: "Internal Server Error" 
    });
  }
};

exports.getEarningsAnalytics = async (req, res) => {
  try {
    const { period = 'week', startDate, endDate } = req.query;

    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.transactionDate = {};
      if (startDate) dateFilter.transactionDate.$gte = new Date(startDate);
      if (endDate) dateFilter.transactionDate.$lte = new Date(endDate);
    } else {
      const now = new Date();
      let startPeriod = new Date();
      
      switch(period) {
        case 'day':
          startPeriod.setDate(now.getDate() - 1);
          break;
        case 'week':
          startPeriod.setDate(now.getDate() - 7);
          break;
        case 'month':
          startPeriod.setMonth(now.getMonth() - 1);
          break;
        case 'year':
          startPeriod.setFullYear(now.getFullYear() - 1);
          break;
        default:
          startPeriod.setDate(now.getDate() - 7);
      }
      dateFilter.transactionDate = { $gte: startPeriod };
    }

    const driverStats = await DriverEarning.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$driver',
          totalEarnings: { $sum: '$amount' },
          totalDeliveries: { $sum: 1 },
          avgEarningPerDelivery: { $avg: '$amount' }
        }
      },
      { $sort: { totalEarnings: -1 } },
      {
        $lookup: {
          from: 'drivers',
          localField: '_id',
          foreignField: '_id',
          as: 'driverInfo'
        }
      },
      { $unwind: { path: '$driverInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          driverId: '$_id',
          driverName: '$driverInfo.fullName',
          driverEmail: '$driverInfo.email',
          driverPhone: '$driverInfo.phoneNumber',
          totalEarnings: 1,
          totalDeliveries: 1,
          avgEarningPerDelivery: 1
        }
      }
    ]);

    const earningsByDate = await DriverEarning.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$transactionDate" } },
          totalEarnings: { $sum: '$amount' },
          totalTransactions: { $sum: 1 },
          averageEarning: { $avg: '$amount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const earningsByType = await DriverEarning.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$type',
          totalEarnings: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { totalEarnings: -1 } }
    ]);

    const earningsByStatus = await DriverEarning.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$status',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const topOrders = await DriverEarning.aggregate([
      { $match: dateFilter },
      { $sort: { amount: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'drivers',
          localField: 'driver',
          foreignField: '_id',
          as: 'driverInfo'
        }
      },
      { $unwind: { path: '$driverInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          orderId: '$orderId',
          amount: '$amount',
          type: '$type',
          date: '$transactionDate',
          driverName: '$driverInfo.fullName',
          driverId: '$driverInfo._id'
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        period: period,
        dateRange: {
          start: dateFilter.transactionDate?.$gte || null,
          end: dateFilter.transactionDate?.$lte || new Date()
        },
        driverStats,
        earningsByDate,
        earningsByType,
        earningsByStatus,
        topOrders
      }
    });

  } catch (error) {
    console.error("Error fetching earnings analytics:", error);
    res.status(500).json({ 
      success: false, 
      message: "Internal Server Error" 
    });
  }
};

exports.getDriverEarningsDetail = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { page = 1, limit = 20, startDate, endDate, type } = req.query;

    const filter = { driver: driverId };

    if (startDate || endDate) {
      filter.transactionDate = {};
      if (startDate) filter.transactionDate.$gte = new Date(startDate);
      if (endDate) filter.transactionDate.$lte = new Date(endDate);
    }

    if (type) filter.type = type;

    const [earnings, driver, summary] = await Promise.all([
      DriverEarning.find(filter)
        .populate('order', 'orderId finalAmount createdAt deliveryAddress')
        .sort({ transactionDate: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean(),
      Driver.findById(driverId).select('fullName email phoneNumber vehicleNumber earnings'),
      DriverEarning.aggregate([
        { $match: filter },
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
            },
            byType: {
              $push: {
                type: '$type',
                amount: '$amount'
              }
            }
          }
        }
      ])
    ]);

    if (!driver) {
      return res.status(404).json({ 
        success: false, 
        message: "Driver not found" 
      });
    }

    const typeBreakdown = {};
    if (summary[0] && summary[0].byType) {
      summary[0].byType.forEach(item => {
        typeBreakdown[item.type] = (typeBreakdown[item.type] || 0) + item.amount;
      });
    }

    const stats = summary[0] || {
      totalEarnings: 0,
      totalDeliveries: 0,
      todayEarnings: 0,
      pendingPayout: 0
    };

    const total = await DriverEarning.countDocuments(filter);

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
      } : (earning.order?.deliveryAddress ? {
        addressLine: earning.order.deliveryAddress.addressLine,
        city: earning.order.deliveryAddress.city,
        state: earning.order.deliveryAddress.state,
        pinCode: earning.order.deliveryAddress.pincode || earning.order.deliveryAddress.pinCode
      } : null),
      orderAmount: earning.order?.finalAmount || 0,
      orderDate: earning.order?.createdAt || null
    }));

    res.status(200).json({
      success: true,
      data: {
        driver: {
          id: driver._id,
          name: driver.fullName,
          email: driver.email,
          phone: driver.phoneNumber,
          vehicleNumber: driver.vehicleNumber,
          earnings: driver.earnings
        },
        earnings: formattedEarnings,
        summary: {
          totalEarnings: stats.totalEarnings,
          totalDeliveries: stats.totalDeliveries,
          todayEarnings: stats.todayEarnings,
          pendingPayout: stats.pendingPayout,
          typeBreakdown: typeBreakdown
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error("Error fetching driver earnings detail:", error);
    res.status(500).json({ 
      success: false, 
      message: "Internal Server Error" 
    });
  }
};

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

exports.markAsPaid = async (req, res) => {
  try {
    const { earningId } = req.params;
    const { payoutMethod, transactionId, paymentProof, notes } = req.body;
    const adminId = req.admin?.id || req.admin?._id;

    if (!earningId) {
      return res.status(400).json({
        success: false,
        message: "Earning ID is required"
      });
    }

    const earning = await DriverEarning.findById(earningId)
      .populate('driver', 'fullName email phoneNumber earnings');

    if (!earning) {
      return res.status(404).json({
        success: false,
        message: "Earning record not found"
      });
    }

    if (earning.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: "Earning is already marked as paid"
      });
    }

    if (earning.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: "Cannot pay a cancelled earning"
      });
    }

    const updateData = {
      status: 'paid',
      payoutDate: new Date(),
      paidBy: adminId
    };

    if (payoutMethod) updateData.payoutMethod = payoutMethod;
    if (transactionId) updateData.transactionId = transactionId;
    if (paymentProof) updateData.paymentProof = paymentProof;
    if (notes) updateData.notes = notes;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const updatedEarning = await DriverEarning.findByIdAndUpdate(
        earningId,
        updateData,
        { new: true, session }
      );

      if (earning.driver && earning.driver.earnings) {
        await Driver.findByIdAndUpdate(
          earning.driver._id,
          {
            $inc: {
              'earnings.paidEarnings': earning.amount,
              'earnings.currentBalance': -earning.amount
            }
          },
          { session }
        );
      }

      await session.commitTransaction();
      session.endSession();

      res.status(200).json({
        success: true,
        message: "Earning marked as paid successfully",
        data: {
          earning: updatedEarning,
          driver: {
            id: earning.driver?._id,
            name: earning.driver?.fullName,
            amountPaid: earning.amount
          }
        }
      });

    } catch (transactionError) {
      await session.abortTransaction();
      session.endSession();
      throw transactionError;
    }

  } catch (error) {
    console.error("Error marking earning as paid:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

exports.getPendingPayouts = async (req, res) => {
  try {
    const { page = 1, limit = 50, driverId } = req.query;

    const filter = { status: 'earned' };
    if (driverId) filter.driver = driverId;

    const pendingEarnings = await DriverEarning.find(filter)
      .populate('driver', 'fullName email phoneNumber vehicleNumber earnings')
      .populate('order', 'orderId finalAmount createdAt')
      .sort({ transactionDate: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await DriverEarning.countDocuments(filter);

    const summary = await DriverEarning.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
          drivers: { $addToSet: '$driver' }
        }
      }
    ]);

    const driverSummary = await DriverEarning.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$driver',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'drivers',
          localField: '_id',
          foreignField: '_id',
          as: 'driverInfo'
        }
      },
      { $unwind: '$driverInfo' },
      {
        $project: {
          driverId: '$_id',
          driverName: '$driverInfo.fullName',
          driverEmail: '$driverInfo.email',
          driverPhone: '$driverInfo.phoneNumber',
          totalAmount: 1,
          count: 1
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    const stats = summary[0] || {
      totalAmount: 0,
      count: 0,
      drivers: []
    };

    res.status(200).json({
      success: true,
      data: {
        pendingEarnings,
        summary: {
          totalAmount: stats.totalAmount,
          totalEarnings: stats.count,
          totalDrivers: stats.drivers?.length || 0,
          driverSummary
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error("Error fetching pending payouts:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};