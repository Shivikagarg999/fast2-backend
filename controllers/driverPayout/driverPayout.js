const DriverPayout = require('../../models/driverPayout');
const DriverEarning = require('../../models/driverEarnings');
const Driver = require('../../models/driver');

exports.getDriverPayouts = async (req, res) => {
  try {
    const { driverId, status, startDate, endDate, page = 1, limit = 10 } = req.query;
    const filter = {};

    if (driverId) filter.driver = driverId;
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const payouts = await DriverPayout.find(filter)
      .populate('driver', 'name phone email profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await DriverPayout.countDocuments(filter);

    res.json({
      success: true,
      data: {
        payouts,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
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



exports.getDriverPayoutDetails = async (req, res) => {
  try {
    const { payoutId } = req.params;

    const payout = await DriverPayout.findById(payoutId)
      .populate('driver', 'name phone email profilePicture')
      .populate('earnings', 'orderId amount type description transactionDate');

    if (!payout) {
      return res.status(404).json({
        success: false,
        error: "Payout not found"
      });
    }

    res.json({
      success: true,
      data: payout
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};



exports.getDriverEarnings = async (req, res) => {
  try {
    const { driverId, status, type, startDate, endDate, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (driverId) filter.driver = driverId;
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (startDate || endDate) {
      filter.transactionDate = {};
      if (startDate) filter.transactionDate.$gte = new Date(startDate);
      if (endDate) filter.transactionDate.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const earnings = await DriverEarning.find(filter)
      .populate('order', 'orderId finalAmount status')
      .populate('driver', 'name phone')
      .sort({ transactionDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await DriverEarning.countDocuments(filter);

    const summary = await DriverEarning.aggregate([
      {
        $match: filter
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
          totalEarnings: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        earnings,
        summary: summary[0] || { totalAmount: 0, totalEarnings: 0 },
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
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

exports.getMyPayouts = async (req, res) => {
  try {
    const driverId = req.driver.driverId;
    const { page = 1, limit = 10, startDate, endDate, status } = req.query;

    const filter = { driver: driverId };

    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const payouts = await DriverPayout.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await DriverPayout.countDocuments(filter);

    res.json({
      success: true,
      data: {
        payouts,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
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

exports.updatePayoutStatus = async (req, res) => {
  try {
    const { payoutId } = req.params;
    const { status, payoutMethod, transactionId, notes } = req.body;

    const payout = await DriverPayout.findById(payoutId);
    if (!payout) {
      return res.status(404).json({
        success: false,
        error: "Payout not found"
      });
    }

    if (status === 'paid') {
      payout.paidAt = new Date();
      payout.payoutMethod = payoutMethod || payout.payoutMethod;
      payout.transactionId = transactionId;
      payout.processedBy = req.admin?.id;

      await DriverEarning.updateMany(
        { _id: { $in: payout.earnings } },
        {
          status: 'payout_paid',
          payoutDate: new Date(),
          payoutMethod: payout.payoutMethod,
          transactionId: payout.transactionId
        }
      );

      const driver = await Driver.findById(payout.driver);
      if (driver) {
        driver.earnings.pendingPayout -= payout.totalAmount;
        driver.earnings.totalPayouts += payout.totalAmount;
        driver.earnings.lastPayoutDate = new Date();
        await driver.save();
      }
    }

    payout.status = status;
    if (notes) payout.notes = notes;

    await payout.save();

    res.json({
      success: true,
      data: payout
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.getMyPayouts = async (req, res) => {
  try {
    const driverId = req.driver.driverId;
    const { page = 1, limit = 10, startDate, endDate, status } = req.query;

    const filter = { driver: driverId };

    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const payouts = await DriverPayout.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await DriverPayout.countDocuments(filter);

    res.json({
      success: true,
      data: {
        payouts,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
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

exports.createDriverPayout = async (req, res) => {
  try {
    const { driverId, payoutMethod, notes } = req.body;

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        error: "Driver not found"
      });
    }

    const pendingEarnings = await DriverEarning.find({
      driver: driverId,
      status: 'earned'
    });

    if (pendingEarnings.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No pending earnings to payout"
      });
    }

    const totalAmount = pendingEarnings.reduce((sum, earning) => sum + earning.amount, 0);

    const payout = new DriverPayout({
      driver: driverId,
      totalAmount,
      numberOfOrders: pendingEarnings.length,
      earnings: pendingEarnings.map(e => e._id),
      payoutMethod: payoutMethod || driver.payoutDetails?.preferredMethod || 'upi',
      status: 'pending',
      notes,
      bankDetails: driver.payoutDetails?.bankAccount,
      upiId: driver.payoutDetails?.upiId
    });

    await payout.save();

    await DriverEarning.updateMany(
      { _id: { $in: pendingEarnings.map(e => e._id) } },
      {
        status: 'payout_processing',
        payoutBatch: payout._id
      }
    );

    res.json({
      success: true,
      data: payout,
      message: `Payout created for ₹${totalAmount} from ${pendingEarnings.length} orders`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.getMyPayouts = async (req, res) => {
  try {
    const driverId = req.driver.driverId;
    const { page = 1, limit = 10, startDate, endDate, status } = req.query;

    const filter = { driver: driverId };

    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const payouts = await DriverPayout.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await DriverPayout.countDocuments(filter);

    res.json({
      success: true,
      data: {
        payouts,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
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

exports.getPayoutSummary = async (req, res) => {
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

    const payoutSummary = await DriverPayout.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $nin: ['cancelled', 'failed'] }
        }
      },
      {
        $group: {
          _id: null,
          totalPayouts: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
          totalOrders: { $sum: "$numberOfOrders" },
          pendingAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", "pending"] }, "$totalAmount", 0]
            }
          },
          paidAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", "paid"] }, "$totalAmount", 0]
            }
          }
        }
      }
    ]);

    const earningsSummary = await DriverEarning.aggregate([
      {
        $match: {
          transactionDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$status",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      }
    ]);

    const driversSummary = await Driver.aggregate([
      {
        $match: {
          'earnings.pendingPayout': { $gt: 0 }
        }
      },
      {
        $group: {
          _id: null,
          totalDrivers: { $sum: 1 },
          totalPending: { $sum: "$earnings.pendingPayout" }
        }
      }
    ]);

    const result = payoutSummary[0] || {
      totalPayouts: 0,
      totalAmount: 0,
      totalOrders: 0,
      pendingAmount: 0,
      paidAmount: 0
    };

    const driversResult = driversSummary[0] || {
      totalDrivers: 0,
      totalPending: 0
    };

    res.json({
      success: true,
      data: {
        payoutSummary: result,
        earningsSummary,
        drivers: driversResult,
        period: {
          startDate,
          endDate,
          filter: filter || 'today'
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



exports.getDriverById = async (req, res) => {
  try {
    const { driverId } = req.params;

    const driver = await Driver.findById(driverId)
      .select('name phone email profilePicture earnings payoutDetails');

    if (!driver) {
      return res.status(404).json({
        success: false,
        error: "Driver not found"
      });
    }

    const pendingEarnings = await DriverEarning.find({
      driver: driverId,
      status: 'earned'
    });

    const totalPending = pendingEarnings.reduce((sum, earning) => sum + earning.amount, 0);

    res.json({
      success: true,
      data: {
        driver,
        earnings: {
          pending: totalPending,
          pendingOrders: pendingEarnings.length,
          details: pendingEarnings
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

exports.getMyPayouts = async (req, res) => {
  try {
    const driverId = req.driver.driverId;
    const { page = 1, limit = 10, startDate, endDate, status } = req.query;

    const filter = { driver: driverId };

    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const payouts = await DriverPayout.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await DriverPayout.countDocuments(filter);

    res.json({
      success: true,
      data: {
        payouts,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
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