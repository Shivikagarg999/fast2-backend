const express = require('express');
const rateLimit = require('express-rate-limit');
const { adminAuth } = require('../../middlewares/adminAuth');
const { trackEvents, getSummary } = require('../../controllers/analytics/analyticsController');

const publicRouter = express.Router();
const adminRouter = express.Router();

// Public, unauthenticated tracking endpoint: rate limited per IP so it can't be used to flood the DB.
const trackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false }
});

publicRouter.post('/track', trackLimiter, trackEvents);
adminRouter.get('/summary', adminAuth, getSummary);

module.exports = { publicRouter, adminRouter };
