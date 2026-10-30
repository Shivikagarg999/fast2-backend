const express = require('express');
const router = express.Router();
const { adminAuth } = require('../../../middlewares/adminAuth');
const {
  getConversations,
  getMessages,
  sendMessage,
  setBotPaused,
  getTemplates,
  createTemplate,
  sendTemplateMessage
} = require('../../../controllers/admin/whatsapp/whatsappAdminController');

router.get('/templates', adminAuth, getTemplates);
router.post('/templates', adminAuth, createTemplate);
router.get('/conversations', adminAuth, getConversations);
router.get('/conversations/:phone/messages', adminAuth, getMessages);
router.post('/conversations/:phone/send', adminAuth, sendMessage);
router.post('/conversations/:phone/send-template', adminAuth, sendTemplateMessage);
router.put('/conversations/:phone/bot-pause', adminAuth, setBotPaused);

module.exports = router;
