const express = require('express');
const router = express.Router();
const { sendMessage } = require('../../controllers/chatbot/chatbotController');

router.post('/message', sendMessage);

module.exports = router;
