const express = require('express');
const router = express.Router();
const { adminAuth } = require('../../middlewares/adminAuth');
const {
    sendNotificationCampaign,
    getNotificationCampaigns
} = require('../../controllers/admin/notification/adminNotificationController');

router.post('/send', adminAuth, sendNotificationCampaign);
router.get('/campaigns', adminAuth, getNotificationCampaigns);

module.exports = router;
