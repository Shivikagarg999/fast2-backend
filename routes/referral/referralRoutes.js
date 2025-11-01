const express = require('express');
const router = express.Router();
const { applyReferral, getReferralStats } = require('../../controllers/referral/referralController');
const auth = require('../../middlewares/userauth');

router.post('/apply-referral', auth, applyReferral);

router.get('/referral-stats', auth, getReferralStats);

module.exports = router;