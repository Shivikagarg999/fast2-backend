const SavedAddress = require("../../models/savedAddresses");

exports.createAddress = async (req, res) => {
  try {
    const userId = req.user._id; 
    const { label, fullName, phoneNumber, addressLine1, addressLine2, city, state, pincode, country, isDefault } = req.body;

    // Check if this is the first address - automatically set as default
    const addressCount = await SavedAddress.countDocuments({ user: userId });
    const shouldBeDefault = addressCount === 0 || isDefault;

    if (shouldBeDefault) {
      await SavedAddress.updateMany({ user: userId, isDefault: true }, { isDefault: false });
    }

    const newAddress = await SavedAddress.create({
      user: userId,
      label,
      fullName,
      phoneNumber,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      country,
      isDefault: shouldBeDefault
    });

    res.status(201).json({ 
      success: true, 
      address: newAddress,
      message: addressCount === 0 ? "First address set as default automatically" : "Address created successfully"
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAddresses = async (req, res) => {
  try {
    const userId = req.user._id;
    const addresses = await SavedAddress.find({ user: userId }).sort({ isDefault: -1, createdAt: -1 });
    res.json({ success: true, addresses });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateAddress = async (req, res) => {
  try {
    const userId = req.user._id;
    const addressId = req.params.id;
    const { label, fullName, phoneNumber, addressLine1, addressLine2, city, state, pincode, country, isDefault } = req.body;

    // If setting as default, remove default from all other addresses
    if (isDefault) {
      await SavedAddress.updateMany({ user: userId, isDefault: true }, { isDefault: false });
    }

    const updatedAddress = await SavedAddress.findOneAndUpdate(
      { _id: addressId, user: userId },
      { label, fullName, phoneNumber, addressLine1, addressLine2, city, state, pincode, country, isDefault },
      { new: true }
    );

    if (!updatedAddress) return res.status(404).json({ success: false, message: "Address not found" });

    res.json({ success: true, address: updatedAddress });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteAddress = async (req, res) => {
  try {
    const userId = req.user._id;
    const addressId = req.params.id;

    const addressToDelete = await SavedAddress.findOne({ _id: addressId, user: userId });
    if (!addressToDelete) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

    const isDeletingDefault = addressToDelete.isDefault;

    await SavedAddress.findOneAndDelete({ _id: addressId, user: userId });

    if (isDeletingDefault) {
      const anyAddress = await SavedAddress.findOne({ user: userId }).sort({ createdAt: -1 });
      if (anyAddress) {
        anyAddress.isDefault = true;
        await anyAddress.save();
      }
    }

    res.json({ 
      success: true, 
      message: "Address deleted successfully" 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.setDefaultAddress = async (req, res) => {
  try {
    const userId = req.user._id;
    const addressId = req.params.id;

    const address = await SavedAddress.findOne({ _id: addressId, user: userId });
    if (!address) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

    if (address.isDefault === true) {
      address.isDefault = false;
      await address.save();
      
      const anyOtherAddress = await SavedAddress.findOne({ 
        user: userId, 
        _id: { $ne: addressId } 
      }).sort({ createdAt: -1 });
      
      if (anyOtherAddress) {
        anyOtherAddress.isDefault = true;
        await anyOtherAddress.save();
      }
      
      return res.json({ 
        success: true, 
        address, 
        message: "Address removed from default" 
      });
    }

    await SavedAddress.updateMany(
      { user: userId, isDefault: true },
      { isDefault: false }
    );

    address.isDefault = true;
    await address.save();

    res.json({ 
      success: true, 
      address, 
      message: "Address set as default successfully" 
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};