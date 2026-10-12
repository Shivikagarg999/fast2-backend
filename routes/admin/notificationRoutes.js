const express = require('express');
const router = express.Router();
const { adminAuth } = require('../../middlewares/adminAuth');
const {
    sendNotificationCampaign,
    getNotificationCampaigns
} = require('../../controllers/admin/notification/adminNotificationController');
const {
    createScheduledNotification,
    getScheduledNotifications,
    setScheduledNotificationStatus,
    deleteScheduledNotification
} = require('../../controllers/admin/notification/scheduledNotificationController');

router.post('/send', adminAuth, sendNotificationCampaign);
router.get('/campaigns', adminAuth, getNotificationCampaigns);

router.post('/schedule', adminAuth, createScheduledNotification);
router.get('/scheduled', adminAuth, getScheduledNotifications);
router.patch('/scheduled/:id/status', adminAuth, setScheduledNotificationStatus);
router.delete('/scheduled/:id', adminAuth, deleteScheduledNotification);

module.exports = router;
