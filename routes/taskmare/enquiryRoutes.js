const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { submitEnquiry } = require('../../controllers/taskmare/enquiryController');

const enquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many enquiries from this network. Please try again later or WhatsApp us.' }
});

router.post('/enquiry', enquiryLimiter, submitEnquiry);

module.exports = router;
