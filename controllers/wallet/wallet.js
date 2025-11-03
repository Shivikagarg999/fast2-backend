const User = require("../../models/user");

exports.getWalletBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("wallet name phone");

    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: "User not found" 
      });
    }

    const response = {
      success: true,
      balance: user.wallet || 0,
      currency: "INR",
      user: {
        name: user.name,
        phone: user.phone
      }
    };
    
    return res.json(response);
  } catch (err) {
    console.error("Error in getWalletBalance:", err);
    return res.status(500).json({ 
      success: false,
      error: "Internal server error" 
    });
  }
};