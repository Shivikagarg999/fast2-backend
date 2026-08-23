const express = require("express");
const router = express.Router();
const {
  verifyWebhook,
  receiveWebhook,
  catalogFeed
} = require("../../controllers/whatsapp/whatsappController");

// Both public — Meta calls these directly, no user auth involved.
router.get("/webhook", verifyWebhook);
router.post("/webhook", receiveWebhook);
router.get("/catalog-feed", catalogFeed);

module.exports = router;
