const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middlewares/userauth');

// Fetch Notifications
router.get('/', authMiddleware, notificationController.getNotifications);

// Get Unread Count
router.get('/unread-count', authMiddleware, notificationController.getUnreadCount);

// Mark All as Read
router.put('/mark-all-read', authMiddleware, notificationController.markAllRead);

module.exports = router;
