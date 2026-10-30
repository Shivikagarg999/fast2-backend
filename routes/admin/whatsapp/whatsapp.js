const express = require('express');
const router = express.Router();
const { adminAuth } = require('../../../middlewares/adminAuth');
const {
  getConversations,
  getMessages,
  sendMessage,
  setBotPaused
} = require('../../../controllers/admin/whatsapp/whatsappAdminController');

router.get('/conversations', adminAuth, getConversations);
router.get('/conversations/:phone/messages', adminAuth, getMessages);
router.post('/conversations/:phone/send', adminAuth, sendMessage);
router.put('/conversations/:phone/bot-pause', adminAuth, setBotPaused);

module.exports = router;
