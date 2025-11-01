const jwt = require("jsonwebtoken");
const User = require("../../models/user");
const mongoose= require("mongoose");

exports.sendOtp = async (req, res) => {
  try {
    const { phone, referralCode } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone number required" });

    let user = await User.findOne({ phone });
    let isNewUser = false;
    let walletCredited = 0;

    if (!user) {
      const newReferralCode = generateReferralCode(phone);
      user = await User.create({
        phone,
        wallet: 20,
        referralCode: newReferralCode,
        referredBy: referralCode || null,
      });
      isNewUser = true;
      walletCredited = 50;

      if (referralCode) {
        const referrer = await User.findOne({ referralCode });
        if (referrer) {
          referrer.wallet += 200;
          await referrer.save();
        }
      }
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    user.otp = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000;
    await user.save();

    return res.json({
      message: "OTP sent",
      otp,
      walletCredited,
      isNewUser,
      referralCode: user.referralCode,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const user = await User.findOne({ phone });

    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.otp !== otp || Date.now() > user.otpExpires) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    const isFirstTimeVerification = !user.isVerified;
    
    user.otp = null;
    user.otpExpires = null;
    user.isVerified = true;

    if (isFirstTimeVerification && !user.referralCode) {
      user.referralCode = generateReferralCode();
    }

    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    return res.json({ 
      message: "Login successful", 
      token, 
      wallet: user.wallet, 
      referralCode: user.referralCode,
      isFirstTime: isFirstTimeVerification 
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}