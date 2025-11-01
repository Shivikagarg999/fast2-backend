const User = require("../../models/user");

exports.getMe = async (req, res) => {
  try {
    // console.log("\n=== GET ME ENDPOINT CALLED ===");
    // console.log("1. Request user from middleware:", req.user ? "EXISTS" : "MISSING");
    
    if (!req.user) {
      console.log("ERROR: No user found in request");
      return res.status(404).json({ error: "User not found" });
    }

    const userId = req.user._id;
    // console.log("2. User ID from middleware:", userId);
    // console.log("3. User wallet from middleware:", req.user.wallet);
    // console.log("4. User name from middleware:", req.user.name);
    
    const user = await User.findById(userId).select("-password -otp -otpExpires");
    
    if (!user) {
      console.log("ERROR: User not found in database");
      return res.status(404).json({ error: "User not found in database" });
    }

    // console.log("5. Fresh user data from DB:");
    // console.log("   - ID:", user._id);
    // console.log("   - Name:", user.name);
    // console.log("   - Phone:", user.phone);
    // console.log("   - Wallet:", user.wallet);
    // console.log("   - Wallet Type:", typeof user.wallet);
    // console.log("   - Full wallet field:", JSON.stringify(user.wallet));

    const responseData = {
      _id: user._id,
      name: user.name || "User",
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      address: user.address,
      isVerified: user.isVerified,
      role: user.role,
      wallet: user.wallet || 0,
      referralCode: user.referralCode,
      referredBy: user.referredBy,
      referralCount: user.referralCount,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    // console.log("6. Response data prepared:");
    // console.log("   - Name in response:", responseData.name);
    // console.log("   - Wallet in response:", responseData.wallet);
    // console.log("7. Sending response now...\n");
    
    return res.json(responseData);
  } catch (err) {
    console.log("ERROR in getMe:", err.message);
    console.log("Error stack:", err.stack);
    return res.status(500).json({ error: err.message });
  }
};