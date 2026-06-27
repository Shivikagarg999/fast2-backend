const express = require('express');
const router = express.Router();
const { adminAuth } = require('../../middlewares/adminAuth');
const {
  getPaymentSettings,
  updatePaymentSettings
} = require('../../controllers/admin/paymentSettingsController');

router.get('/', adminAuth, getPaymentSettings);
router.put('/', adminAuth, updatePaymentSettings);

module.exports = router;
