const { Warehouse } = require('../../models/warehouse');

const getWarehouseForPincode = async (req, res) => {
  try {
    const { pincode } = req.query;
    
    if (!pincode) {
      return res.status(400).json({
        success: false,
        message: 'Pincode is required'
      });
    }

    let warehouse = await Warehouse.findOne({
      serviceablePincodes: pincode,
      isActive: true
    });

    if (warehouse) {
      return res.json({
        success: true,
        data: warehouse
      });
    }

    const areaCode = pincode.substring(0, 3);
    warehouse = await Warehouse.findOne({
      $or: [
        { 'location.pincode': new RegExp(`^${areaCode}`) },
        { serviceablePincodes: new RegExp(`^${areaCode}`) }
      ],
      isActive: true
    });

    if (warehouse) {
      return res.json({
        success: true,
        data: warehouse,
        note: 'Found warehouse serving your area'
      });
    }

    warehouse = await Warehouse.findOne({ isActive: true });
    
    if (warehouse) {
      return res.json({
        success: true,
        data: warehouse,
        note: 'Showing products from available warehouse'
      });
    }

    res.status(404).json({
      success: false,
      message: 'No warehouse found for this pincode'
    });

  } catch (error) {
    console.error('Error finding warehouse:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

const getWarehouses = async (req, res) => {
  try {
    const warehouses = await Warehouse.find({ isActive: true });
    res.json({
      success: true,
      data: warehouses
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching warehouses',
      error: error.message
    });
  }
};

module.exports = {
  getWarehouseForPincode,
  getWarehouses
};