const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { sendMessage } = require('../../controllers/chatbot/chatbotController');

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many messages. Please try again later.' }
});

router.post('/message', chatLimiter, sendMessage);

module.exports = router;
