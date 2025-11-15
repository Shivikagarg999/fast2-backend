const express = require('express');
const router = express.Router();
const { 
  createDiscount, 
  getActiveDiscounts, 
  getAllDiscounts,
  getDiscountById,
  updateDiscount,
  deleteDiscount,
  toggleDiscountStatus
} = require('../../../controllers/discount/discountController');

// Create discount
router.post('/', createDiscount);

// Get active discounts
router.get('/active', getActiveDiscounts);

// Get all discounts (with filters)
router.get('/', getAllDiscounts);

// Get discount by ID
router.get('/:id', getDiscountById);

// Update discount
router.put('/:id', updateDiscount);

// Delete discount
router.delete('/:id', deleteDiscount);

// Toggle discount status
router.patch('/:id/toggle', toggleDiscountStatus);

module.exports = router;