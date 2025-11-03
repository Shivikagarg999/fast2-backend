const express = require("express");
const { sendOtp, verifyOtp } = require("../../controllers/user/authController");
const authMiddleware= require("../../middlewares/userauth");
const {getMe}= require("../../controllers/auth/me");
const {getWalletBalance}= require("../../controllers/wallet/wallet");
const router = express.Router();

router.post("/send-otp", sendOtp);
router.post("/verify-otp" , verifyOtp);

router.get("/me", authMiddleware, getMe);
router.get("/wallet", authMiddleware, getWalletBalance);

module.exports = router;