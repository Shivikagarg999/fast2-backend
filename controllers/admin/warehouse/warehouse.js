const { Warehouse } = require('../../../models/warehouse');
const Seller = require('../../../models/seller');

const createWarehouse = async (req, res) => {
  try {
    const warehouse = new Warehouse(req.body);
    await warehouse.save();
    res.status(201).json(warehouse);
  } catch (err) {``
    res.status(400).json({ error: err.message });
  }
};

const getWarehouses = async (req, res) => {
  try {
    const warehouses = await Warehouse.find()
      .populate('promotor')
      .populate('products');
    res.json(warehouses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getWarehouseById = async (req, res) => {
  try {
    const warehouse = await Warehouse.findById(req.params.id)
      .populate('promotor')
      .populate('products');
    if (!warehouse) return res.status(404).json({ error: 'Warehouse not found' });
    res.json(warehouse);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateWarehouse = async (req, res) => {
  try {
    const warehouse = await Warehouse.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!warehouse) return res.status(404).json({ error: 'Warehouse not found' });
    res.json(warehouse);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const deleteWarehouse = async (req, res) => {
  try {
    const warehouse = await Warehouse.findByIdAndDelete(req.params.id);
    if (!warehouse) return res.status(404).json({ error: 'Warehouse not found' });
    res.json({ message: 'Warehouse deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getWarehouseSellers = async (req, res) => {
  try {
    const sellerId = req.seller.id;

    const seller = await Seller.findById(sellerId).populate('warehouse');
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }

    const sellers = await Seller.find({ 
      warehouse: seller.warehouse._id,
      _id: { $ne: sellerId } 
    }).select('name email businessName products rating');

    res.status(200).json({
      success: true,
      data: sellers
    });

  } catch (error) {
    console.error('Get warehouse sellers error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching warehouse sellers',
      error: error.message
    });
  }
};

module.exports = {
  createWarehouse,
  getWarehouses,
  getWarehouseById,
  updateWarehouse,
  deleteWarehouse,
  getWarehouseSellers
};
