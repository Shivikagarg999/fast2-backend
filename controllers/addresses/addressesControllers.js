const SavedAddress = require("../../models/savedAddresses");

exports.createAddress = async (req, res) => {
  try {
    const userId = req.user._id; 
    const { label, fullName, phoneNumber, addressLine1, addressLine2, city, state, pincode, country, isDefault } = req.body;

    if (isDefault) {
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
      isDefault: isDefault || false
    });

    res.status(201).json({ success: true, address: newAddress });
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

    const deleted = await SavedAddress.findOneAndDelete({ _id: addressId, user: userId });
    if (!deleted) return res.status(404).json({ success: false, message: "Address not found" });

    res.json({ success: true, message: "Address deleted successfully" });
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
      return res.json({ success: true, address, message: "Default removed" });
    }
    await SavedAddress.updateMany(
      { user: userId, isDefault: true },
      { isDefault: false }
    );

    address.isDefault = true;
    await address.save();

    res.json({ success: true, address, message: "Default set" });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
