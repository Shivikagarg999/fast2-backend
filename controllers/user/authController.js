const jwt = require("jsonwebtoken");
const User = require("../../models/user");

// Helper function to generate unique referral code
const generateReferralCode = (name = "USR") => {
  return name.slice(0, 3).toUpperCase() + Math.floor(1000 + Math.random() * 9000);
};

exports.sendOtp = async (req, res) => {
  try {
    const { phone, referralCode } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone number required" });

    let user = await User.findOne({ phone });
    let isNewUser = false;
    let walletCredited = 0;

    if (!user) {
      // Create new user with signup wallet credit
      const newReferralCode = generateReferralCode(phone); // you can customize using name
      user = await User.create({
        phone,
        wallet: 50,
        referralCode: newReferralCode,
        referredBy: referralCode || null,
      });
      isNewUser = true;
      walletCredited = 50;

      // Credit referral reward to the referrer if referralCode exists
      if (referralCode) {
        const referrer = await User.findOne({ referralCode });
        if (referrer) {
          referrer.wallet += 200; // referral reward
          await referrer.save();
        }
      }
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000);
    user.otp = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000;
    await user.save();

    return res.json({
      message: "OTP sent",
      otp,
      walletCredited,
      isNewUser,
      referralCode: user.referralCode, // return user's own referral code
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

    user.otp = null;
    user.otpExpires = null;
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    return res.json({ message: "Login successful", token, wallet: user.wallet, referralCode: user.referralCode });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
