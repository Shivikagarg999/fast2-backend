const Driver = require('../../../models/driver');
const Order = require('../../../models/order');
const mongoose = require('mongoose');

exports.getAllDrivers = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      availability,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};
    
    if (status) {
      filter['workInfo.status'] = status;
    }
    if (availability) {
      filter['workInfo.availability'] = availability;
    }
    
    if (search) {
      filter.$or = [
        { 'personalInfo.name': { $regex: search, $options: 'i' } },
        { 'personalInfo.phone': { $regex: search, $options: 'i' } },
        { 'personalInfo.email': { $regex: search, $options: 'i' } },
        { 'vehicle.registrationNumber': { $regex: search, $options: 'i' } },
        { 'workInfo.driverId': { $regex: search, $options: 'i' } }
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const drivers = await Driver.find(filter)
      .select('-auth.password')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Driver.countDocuments(filter);

    res.json({
      success: true,
      data: {
        drivers,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching drivers',
      error: error.message
    });
  }
};

exports.getDriverById = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id)
      .select('-auth.password');

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    res.json({
      success: true,
      data: driver
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching driver',
      error: error.message
    });
  }
};

exports.createDriver = async (req, res) => {
  try {
    const {
      personalInfo,
      address,
      vehicle,
      documents,
      bankDetails
    } = req.body;

    const existingDriver = await Driver.findOne({
      $or: [
        { 'personalInfo.email': personalInfo.email },
        { 'personalInfo.phone': personalInfo.phone }
      ]
    });

    if (existingDriver) {
      return res.status(400).json({
        success: false,
        message: 'Driver with this email or phone already exists'
      });
    }

    if (vehicle && vehicle.registrationNumber) {
      const existingVehicle = await Driver.findOne({
        'vehicle.registrationNumber': vehicle.registrationNumber
      });
      
      if (existingVehicle) {
        return res.status(400).json({
          success: false,
          message: 'Vehicle with this registration number already exists'
        });
      }
    }

    const driverData = {
      personalInfo,
      auth: {
        password: 'default123', 
        isVerified: true
      },
      workInfo: {
        status: 'approved',
        availability: 'offline'
      }
    };

    if (address) driverData.address = address;
    if (vehicle) driverData.vehicle = vehicle;
    if (documents) driverData.documents = documents;
    if (bankDetails) driverData.bankDetails = bankDetails;

    const driver = new Driver(driverData);
    await driver.save();

    const driverResponse = driver.toObject();
    delete driverResponse.auth.password;

    res.status(201).json({
      success: true,
      message: 'Driver created successfully',
      data: driverResponse
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating driver',
      error: error.message
    });
  }
};

exports.updateDriver = async (req, res) => {
  try {
    const {
      personalInfo,
      address,
      vehicle,
      documents,
      bankDetails,
      deliveryPreferences
    } = req.body;

    const driver = await Driver.findById(req.params.id);
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    if (personalInfo) {
      driver.personalInfo = { ...driver.personalInfo, ...personalInfo };
    }
    if (address) {
      driver.address = { ...driver.address, ...address };
    }
    if (vehicle) {
      driver.vehicle = { ...driver.vehicle, ...vehicle };
    }
    if (documents) {
      driver.documents = { ...driver.documents, ...documents };
    }
    if (bankDetails) {
      driver.bankDetails = { ...driver.bankDetails, ...bankDetails };
    }
    if (deliveryPreferences) {
      driver.deliveryPreferences = { ...driver.deliveryPreferences, ...deliveryPreferences };
    }

    await driver.save();

    const updatedDriver = await Driver.findById(req.params.id).select('-auth.password');

    res.json({
      success: true,
      message: 'Driver updated successfully',
      data: updatedDriver
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating driver',
      error: error.message
    });
  }
};

exports.updateDriverStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    const allowedStatuses = ['pending', 'approved', 'rejected', 'suspended', 'inactive'];
    
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      { 
        'workInfo.status': status,
        'workInfo.availability': 'offline'
      },
      { new: true }
    ).select('-auth.password');

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    res.json({
      success: true,
      message: `Driver status updated to ${status}`,
      data: driver
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating driver status',
      error: error.message
    });
  }
};

exports.verifyDriver = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    driver.auth.isVerified = true;
    driver.workInfo.status = 'approved';
    await driver.save();

    res.json({
      success: true,
      message: 'Driver verified and approved successfully',
      data: driver
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error verifying driver',
      error: error.message
    });
  }
};

exports.deleteDriver = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    const activeOrder = await Order.findOne({
      driver: req.params.id,
      status: { $in: ['confirmed', 'shipped', 'out_for_delivery'] }
    });

    if (activeOrder) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete driver with active orders'
      });
    }

    await Driver.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Driver deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting driver',
      error: error.message
    });
  }
};

exports.getDriverOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    
    const filter = { driver: req.params.id };
    
    if (status) {
      filter.status = status;
    }

    const orders = await Order.find(filter)
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(filter);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching driver orders',
      error: error.message
    });
  }
};

exports.getDriverEarnings = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id).select('earnings');
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    const todayEarnings = await getDriverEarningsForPeriod(req.params.id, 'today');
    const weeklyEarnings = await getDriverEarningsForPeriod(req.params.id, 'week');
    const monthlyEarnings = await getDriverEarningsForPeriod(req.params.id, 'month');

    res.json({
      success: true,
      data: {
        summary: driver.earnings,
        detailedEarnings: {
          today: todayEarnings,
          week: weeklyEarnings,
          month: monthlyEarnings
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching driver earnings',
      error: error.message
    });
  }
};

exports.getDriverPerformance = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id)
      .select('workInfo earnings activity');

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    // Calculate performance metrics from orders
    const performance = await calculateDriverPerformance(req.params.id);

    res.json({
      success: true,
      data: {
        workInfo: driver.workInfo,
        earnings: driver.earnings,
        activity: driver.activity,
        performance
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching driver performance',
      error: error.message
    });
  }
};

exports.updateDriverLocation = async (req, res) => {
  try {
    const { lat, lng, address } = req.body;
    
    const driver = await Driver.findById(req.params.id);
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    await driver.updateLocation(lat, lng, address);

    res.json({
      success: true,
      message: 'Driver location updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating driver location',
      error: error.message
    });
  }
};

exports.getNearbyAvailableDrivers = async (req, res) => {
  try {
    const { lat, lng, maxDistance = 5000 } = req.query; // maxDistance in meters
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const drivers = await Driver.findAvailableDrivers(
      parseFloat(lat),
      parseFloat(lng),
      parseInt(maxDistance)
    ).select('personalInfo.name personalInfo.phone vehicle workInfo.driverId workInfo.currentLocation earnings.todayEarnings activity.totalOnlineHours');

    res.json({
      success: true,
      data: drivers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching nearby drivers',
      error: error.message
    });
  }
};

exports.assignOrderToDriver = async (req, res) => {
  try {
    const { orderId } = req.body;
    const { driverId } = req.params;

    // Check if driver exists and is approved
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    if (driver.workInfo.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Driver is not approved for deliveries'
      });
    }

    // Check if order exists
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order is already assigned
    if (order.driver) {
      return res.status(400).json({
        success: false,
        message: 'Order is already assigned to a driver'
      });
    }

    // Assign order to driver
    await driver.assignOrder(orderId);
    
    // Update order with driver assignment
    order.driver = driverId;
    order.status = 'confirmed';
    await order.save();

    const updatedOrder = await Order.findById(orderId)
      .populate('user', 'name email phone')
      .populate('driver', 'personalInfo.name personalInfo.phone vehicle');

    res.json({
      success: true,
      message: 'Order assigned to driver successfully',
      data: updatedOrder
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error assigning order to driver',
      error: error.message
    });
  }
};

exports.getAvailableDriversForOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Get order to check details
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get available drivers
    const availableDrivers = await Driver.find({
      'workInfo.status': 'approved',
      'workInfo.availability': { $in: ['online', 'offline'] }
    })
    .select('personalInfo.name personalInfo.phone personalInfo.email vehicle workInfo.driverId workInfo.availability workInfo.currentLocation earnings.todayEarnings activity.totalOnlineHours')
    .sort({ 'earnings.todayEarnings': -1, 'activity.totalOnlineHours': -1 })
    .limit(50);

    res.json({
      success: true,
      data: {
        order: {
          id: order._id,
          status: order.status
        },
        availableDrivers,
        totalAvailable: availableDrivers.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching available drivers',
      error: error.message
    });
  }
};

// Helper functions
const getDriverEarningsForPeriod = async (driverId, period) => {
  const dateFilter = getDateFilter(period);
  
  const earnings = await Order.aggregate([
    {
      $match: {
        driver: new mongoose.Types.ObjectId(driverId),
        status: 'delivered',
        deliveredAt: dateFilter
      }
    },
    {
      $group: {
        _id: null,
        totalEarnings: { $sum: '$deliveryFee' },
        totalOrders: { $sum: 1 },
        averageEarningPerOrder: { $avg: '$deliveryFee' }
      }
    }
  ]);

  return earnings[0] || { totalEarnings: 0, totalOrders: 0, averageEarningPerOrder: 0 };
};

const calculateDriverPerformance = async (driverId) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentOrders = await Order.find({
    driver: driverId,
    createdAt: { $gte: thirtyDaysAgo }
  });

  const completedOrders = recentOrders.filter(order => order.status === 'delivered');
  const cancelledOrders = recentOrders.filter(order => order.status === 'cancelled');
  
  const completionRate = recentOrders.length > 0 ? 
    (completedOrders.length / recentOrders.length) * 100 : 0;

  const totalDeliveryTime = completedOrders.reduce((total, order) => {
    if (order.deliveredAt && order.confirmedAt) {
      return total + (order.deliveredAt - order.confirmedAt);
    }
    return total;
  }, 0);

  const averageDeliveryTime = completedOrders.length > 0 ? 
    totalDeliveryTime / completedOrders.length : 0;

  return {
    completionRate: Math.round(completionRate * 100) / 100,
    cancellationRate: recentOrders.length > 0 ? 
      (cancelledOrders.length / recentOrders.length) * 100 : 0,
    averageDeliveryTime: Math.round(averageDeliveryTime / (1000 * 60)), // Convert to minutes
    recentActivity: recentOrders.length,
    completedOrders: completedOrders.length
  };
};

const getDateFilter = (period) => {
  const now = new Date();
  const filter = {};

  switch (period) {
    case 'today':
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      filter.$gte = today;
      break;
    case 'week':
      filter.$gte = new Date(now.setDate(now.getDate() - 7));
      break;
    case 'month':
      filter.$gte = new Date(now.setMonth(now.getMonth() - 1));
      break;
    default:
      filter.$gte = new Date(now.setMonth(now.getMonth() - 1));
  }

  return filter;
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};