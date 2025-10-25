const express = require('express');
const router = express.Router();
const { createDiscount, getActiveDiscounts } = require('../../../controllers/discount/discountController');

router.post('/', createDiscount);

router.get('/active', getActiveDiscounts);

module.exports = router;
