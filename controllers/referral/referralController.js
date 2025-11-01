const User = require("../../models/user");
const mongoose= require("mongoose");

exports.applyReferral = async (req, res) => {
  try {
    const { referralCode } = req.body;
    const currentUserId = req.user.id; 

    const currentUser = await User.findById(currentUserId);
    if (!currentUser) {
      return res.status(404).json({ error: "User not found" });
    }

    if (currentUser.referredBy) {
      return res.status(400).json({ error: "Referral code already used" });
    }

    if (currentUser.referralCode === referralCode) {
      return res.status(400).json({ error: "Cannot use your own referral code" });
    }

    const referrerUser = await User.findOne({ referralCode });
    if (!referrerUser) {
      return res.status(404).json({ error: "Invalid referral code" });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const referralBonus = 50;

      currentUser.wallet += referralBonus;
      currentUser.referredBy = referrerUser._id;
      await currentUser.save({ session });

      referrerUser.wallet += referralBonus;
      referrerUser.referralCount += 1;
      await referrerUser.save({ session });

      await session.commitTransaction();
      session.endSession();

      return res.json({
        message: "Referral applied successfully",
        bonusReceived: referralBonus,
        referredBy: referrerUser.name || referrerUser.phone,
        yourWallet: currentUser.wallet
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.getReferralStats = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId)
      .populate('referredBy', 'name phone')
      .select('referralCode referralCount wallet referredBy');

    const referralStats = {
      yourReferralCode: user.referralCode,
      totalReferrals: user.referralCount,
      totalEarnings: user.referralCount * 50, 
      currentWallet: user.wallet,
      referredBy: user.referredBy ? {
        name: user.referredBy.name,
        phone: user.referredBy.phone
      } : null
    };

    return res.json(referralStats);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};