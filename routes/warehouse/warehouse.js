const express = require('express');
const { 
  getWarehouseForPincode,
  getWarehouses,
  createWarehouse
} = require('../../controllers/warehouse/warehouse');

const router = express.Router();

router.get('/for-pincode', getWarehouseForPincode);
router.post('/create', createWarehouse);

module.exports = router;