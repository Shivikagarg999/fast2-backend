const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../../middlewares/driverAuth");
const {
  requestWithdraw,
  getWithdrawHistory,
  updateWithdrawStatus,
} = require("../../controllers/withdraw/withdraw");

router.post("/request", authenticateToken, requestWithdraw);
router.get("/history", authenticateToken, getWithdrawHistory);

router.patch("/:id/status", updateWithdrawStatus);

module.exports = router;
