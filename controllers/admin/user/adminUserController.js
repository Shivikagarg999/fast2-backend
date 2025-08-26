const User = require("../../../models/user");

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password -otp -otpExpires"); 
    return res.json({ success: true, users });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
