const User = require("../../models/user");

exports.getReferralStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: "User not found" 
      });
    }

    const totalReferrals = await User.countDocuments({
      referredBy: user.referralCode
    });

    const successfulReferrals = await User.countDocuments({
      referredBy: user.referralCode,
      wallet: { $gt: 50 }
    });

    const pendingReferrals = await User.countDocuments({
      referredBy: user.referralCode,
      wallet: { $lte: 50 }
    });

    const earnedAmount = successfulReferrals * 200;

    res.json({
      success: true,
      data: {
        referralCode: user.referralCode,
        totalReferrals,
        successfulReferrals,
        pendingReferrals,
        earnedAmount,
        referralLink: `https://www.fast2.in/signup?ref=${user.referralCode}`
      }
    });

  } catch (err) {
    console.error('Error fetching referral stats:', err);
    res.status(500).json({ 
      success: false,
      error: "Internal server error" 
    });
  }
};

exports.getReferralHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: "User not found" 
      });
    }

    const referrals = await User.find({ referredBy: user.referralCode })
      .select('name phone wallet createdAt')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean(); 

    const referralsWithStatus = referrals.map(ref => ({
      ...ref,
      status: ref.wallet > 50 ? 'completed' : 'pending',
      rewardAmount: ref.wallet > 50 ? 200 : 0
    }));

    const total = await User.countDocuments({ referredBy: user.referralCode });

    res.json({
      success: true,
      data: {
        referrals: referralsWithStatus,
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        total
      }
    });

  } catch (err) {
    console.error('Error fetching referral history:', err);
    res.status(500).json({ 
      success: false,
      error: "Internal server error" 
    });
  }
};

exports.getReferralDetails = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: "User not found" 
      });
    }

    const allReferrals = await User.find({ referredBy: user.referralCode })
      .select('name phone wallet createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const referralsWithStatus = allReferrals.map(ref => ({
      name: ref.name || 'User',
      phone: ref.phone,
      joinedDate: ref.createdAt,
      status: ref.wallet > 50 ? 'Active' : 'Pending',
      rewardStatus: ref.wallet > 50 ? 'Credited' : 'Pending'
    }));

    const totalReferrals = allReferrals.length;
    const successfulReferrals = allReferrals.filter(ref => ref.wallet > 50).length;
    const earnedAmount = successfulReferrals * 200;

    res.json({
      success: true,
      data: {
        referralCode: user.referralCode,
        stats: {
          totalReferrals,
          successfulReferrals,
          pendingReferrals: totalReferrals - successfulReferrals,
          earnedAmount
        },
        referrals: referralsWithStatus,
        referralLink: `https://wwww.fast2.in/signup?ref=${user.referralCode}`
      }
    });

  } catch (err) {
    console.error('Error fetching referral details:', err);
    res.status(500).json({ 
      success: false,
      error: "Internal server error" 
    });
  }
};

exports.redeemReferralCode = async (req, res) => {
  try {
    const userId = req.user.id;
    const { referralCode } = req.body;

    if (!referralCode) {
      return res.status(400).json({
        success: false,
        error: "Referral code is required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    if (user.referredBy) {
      return res.status(400).json({
        success: false,
        error: "You have already used a referral code"
      });
    }

    if (user.referralCode === referralCode) {
      return res.status(400).json({
        success: false,
        error: "You cannot use your own referral code"
      });
    }

    const referrer = await User.findOne({ referralCode });
    if (!referrer) {
      return res.status(404).json({
        success: false,
        error: "Invalid referral code"
      });
    }

    user.referredBy = referralCode;
    user.wallet += 50; 
    await user.save();

    referrer.wallet += 200;
    await referrer.save();

    res.json({
      success: true,
      message: "Referral code applied successfully! ₹50 has been added to your wallet.",
      data: {
        bonusReceived: 50,
        newWalletBalance: user.wallet,
        referredBy: referralCode
      }
    });

  } catch (err) {
    console.error('Error redeeming referral code:', err);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};