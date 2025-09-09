const express = require('express');
const router = express.Router();
const {
  createWarehouse,
  getWarehouses,
  getWarehouseById,
  updateWarehouse,
  deleteWarehouse
} = require('../../../controllers/admin/warehouse/warehouse');

// Routes
router.post('/', createWarehouse);       
router.get('/', getWarehouses);  
router.get('/:id', getWarehouseById);
router.put('/:id', updateWarehouse); 
router.delete('/:id', deleteWarehouse);

module.exports = router;
