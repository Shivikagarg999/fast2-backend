const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { sendMessage } = require('../../controllers/chatbot/chatbotController');
const optionalAuth = require('../../middlewares/optionalAuth');

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many messages. Please try again later.' }
});

// optionalAuth attaches req.user when a token is sent, so the assistant can add to
// the logged-in user's cart, but guests can still chat/search without logging in.
router.post('/message', chatLimiter, optionalAuth, sendMessage);

module.exports = router;
