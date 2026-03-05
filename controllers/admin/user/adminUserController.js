const User = require("../../../models/user");

exports.createUser = async (req, res) => {
  try {
    const { name, email, phone, password, avatar } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Email or phone already exists" });
    }

    const user = new User({ name, email, phone, password, avatar });
    await user.save();

    return res.status(201).json({ success: true, message: "User created successfully", user });
  } catch (err) {
    console.error('❌ Error creating user:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to create user',
      error: err.message 
    });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    console.log('📊 Fetching all users...');
    const users = await User.find().select("-password -otp -otpExpires");
    console.log(`✅ Found ${users.length} users`);
    return res.json({ success: true, users });
  } catch (err) {
    console.error('❌ Error fetching users:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch users',
      error: err.message 
    });
  }
};

// ✅ READ SINGLE USER BY ID
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password -otp -otpExpires");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    return res.json({ success: true, user });
  } catch (err) {
    console.error('❌ Error fetching user by ID:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch user',
      error: err.message 
    });
  }
};

// ✅ UPDATE USER
exports.updateUser = async (req, res) => {
  try {
    const { name, email, phone, avatar } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, phone, avatar },
      { new: true }
    ).select("-password -otp -otpExpires");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, message: "User updated successfully", user });
  } catch (err) {
    console.error('❌ Error updating user:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to update user',
      error: err.message 
    });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    return res.json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    console.error('❌ Error deleting user:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to delete user',
      error: err.message 
    });
  }
};

exports.addMoneyToWallet = async (req, res) => {
  try {
    const { amount, note } = req.body;
    const userId = req.params.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Please provide a valid amount greater than 0" 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Add money to wallet
    user.wallet = (user.wallet || 0) + parseFloat(amount);
    await user.save();

    return res.json({ 
      success: true, 
      message: `₹${amount} added to wallet successfully`,
      user: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        wallet: user.wallet
      },
      transaction: {
        amount: parseFloat(amount),
        note: note || "Admin credit",
        timestamp: new Date()
      }
    });
  } catch (err) {
    console.error('❌ Error adding money to wallet:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to add money to wallet',
      error: err.message 
    });
  }
};

exports.downloadUsersByStatusCSV = async (req, res) => {
  try {
    const { isVerified, role, hasWallet } = req.query;

    const filter = {};
    
    if (isVerified !== undefined) filter.isVerified = isVerified === 'true';
    if (role) filter.role = role;
    if (hasWallet !== undefined) {
      if (hasWallet === 'true') {
        filter.wallet = { $gt: 0 };
      } else {
        filter.wallet = { $lte: 0 };
      }
    }

    const users = await User.find(filter)
      .select("-password -otp -otpExpires -resetPasswordToken -resetPasswordExpires")
      .sort({ createdAt: -1 });

    if (users.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "No users found with the specified status" 
      });
    }

    const csvHeaders = [
      'User ID',
      'Name',
      'Email',
      'Phone',
      'Role',
      'Verified Status',
      'Wallet Balance',
      'Referral Code',
      'Referral Count',
      'Avatar',
      'Created Date',
      'Updated Date'
    ];

    const csvRows = users.map(user => [
      user._id || 'N/A',
      user.name || 'N/A',
      user.email || 'N/A',
      user.phone || 'N/A',
      user.role || 'user',
      user.isVerified ? 'Verified' : 'Not Verified',
      user.wallet || 0,
      user.referralCode || 'N/A',
      user.referralCount || 0,
      user.avatar || 'N/A',
      user.createdAt ? user.createdAt.toISOString().split('T')[0] : 'N/A',
      user.updatedAt ? user.updatedAt.toISOString().split('T')[0] : 'N/A'
    ].map(field => `"${field}"`).join(','));

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="users_${isVerified !== undefined ? (isVerified ? 'verified' : 'unverified') : (role || (hasWallet ? 'with-wallet' : 'without-wallet'))}_${Date.now()}.csv"`);
    
    res.send(csvContent);
  } catch (error) {
    console.error('Download users CSV error:', error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};
