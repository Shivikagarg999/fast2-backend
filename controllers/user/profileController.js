const User = require("../../models/user");
const bcrypt = require("bcrypt");
const imagekit = require("../../utils/imagekit");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() }).single("avatar");

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -otp -otpExpires");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, email, phone, avatar, address } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (avatar) user.avatar = avatar;
    if (address) user.address = address;
    if (req.body.fcmToken) user.fcmToken = req.body.fcmToken;
    await user.save();
    res.json({ success: true, message: "Profile updated successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ message: "Both passwords required" });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: "Old password incorrect" });
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user.id);
    res.json({ success: true, message: "Account deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

exports.uploadAvatar = (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ message: "Upload error", error: err });
    if (!req.file) return res.status(400).json({ message: "No image file uploaded" });
    try {
      const uploadResponse = await imagekit.upload({
        file: req.file.buffer,
        fileName: `avatar_${Date.now()}.jpg`,
        folder: "avatars",
      });
      const user = await User.findById(req.user.id);
      user.avatar = uploadResponse.url;
      await user.save();
      res.json({ success: true, message: "Avatar uploaded successfully", avatar: uploadResponse.url });
    } catch (error) {
      res.status(500).json({ message: "Image upload failed", error });
    }
  });
};
