const { Warehouse } = require('../../../models/warehouse');

// CREATE warehouse
const createWarehouse = async (req, res) => {
  try {
    const warehouse = new Warehouse(req.body);
    await warehouse.save();
    res.status(201).json(warehouse);
  } catch (err) {``
    res.status(400).json({ error: err.message });
  }
};

// GET all warehouses
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

// GET single warehouse by ID
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

// UPDATE warehouse
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

// DELETE warehouse
const deleteWarehouse = async (req, res) => {
  try {
    const warehouse = await Warehouse.findByIdAndDelete(req.params.id);
    if (!warehouse) return res.status(404).json({ error: 'Warehouse not found' });
    res.json({ message: 'Warehouse deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createWarehouse,
  getWarehouses,
  getWarehouseById,
  updateWarehouse,
  deleteWarehouse
};
