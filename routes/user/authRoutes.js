const express = require("express");
const { 
    register, 
    login, 
    forgotPassword, 
    resetPassword,
    serveResetPasswordPage
} = require("../../controllers/user/authController");
const authMiddleware = require("../../middlewares/userauth");
const { getMe } = require("../../controllers/auth/me");
const { getWalletBalance } = require("../../controllers/wallet/wallet");
const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/reset-password-page", serveResetPasswordPage);

router.get("/me", authMiddleware, getMe);
router.get("/wallet", authMiddleware, getWalletBalance);

module.exports = router;