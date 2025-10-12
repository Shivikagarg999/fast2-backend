const express = require('express');
const router = express.Router();
const { 
  getReferralStats, 
  getReferralHistory, 
  getReferralDetails,
  redeemReferralCode
} = require('../../controllers/referral/referralController');
const auth = require('../../middlewares/userauth');

router.use(auth);

router.get('/stats', getReferralStats);

router.get('/history', getReferralHistory);

router.get('/details', getReferralDetails);

router.post('/redeem', redeemReferralCode);

module.exports = router;