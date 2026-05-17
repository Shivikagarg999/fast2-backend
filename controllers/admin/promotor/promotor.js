const Promotor = require('../../../models/promotor');
const bcrypt = require('bcrypt');

//Create Promotor
exports.createPromotor = async (req, res) => {
  try {
    const { name, email, phone, address, commissionRate, commissionType, password, aadharNumber, panNumber, bankDetails } = req.body;

    const existing = await Promotor.findOne({ email });
    if (existing) return res.status(400).json({ message: "Promotor already exists with this email" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const promotor = new Promotor({
      name,
      email,
      phone,
      address,
      commissionRate,
      commissionType,
      password: hashedPassword,
      aadharNumber,
      panNumber,
      bankDetails
    });

    await promotor.save();
    res.status(201).json({ message: "Promotor created successfully", promotor });
  } catch (err) {
    res.status(500).json({ message: "Error creating promotor", error: err.message });
  }
};

//Get All Promotors
exports.getPromotors = async (req, res) => {
  try {
    const promotors = await Promotor.find().select("-password");
    res.json(promotors);
  } catch (err) {
    res.status(500).json({ message: "Error fetching promotors", error: err.message });
  }
};

//Get Single Promotor
exports.getPromotorById = async (req, res) => {
  try {
    const promotor = await Promotor.findById(req.params.id).select("-password");
    if (!promotor) return res.status(404).json({ message: "Promotor not found" });
    res.json(promotor);
  } catch (err) {
    res.status(500).json({ message: "Error fetching promotor", error: err.message });
  }
};

//Update Promotor
exports.updatePromotor = async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }

    const promotor = await Promotor.findByIdAndUpdate(req.params.id, updates, { new: true }).select("-password");
    if (!promotor) return res.status(404).json({ message: "Promotor not found" });

    res.json({ message: "Promotor updated successfully", promotor });
  } catch (err) {
    res.status(500).json({ message: "Error updating promotor", error: err.message });
  }
};

//Delete Promotor
exports.deletePromotor = async (req, res) => {
  try {
    const promotor = await Promotor.findByIdAndDelete(req.params.id);
    if (!promotor) return res.status(404).json({ message: "Promotor not found" });

    res.json({ message: "Promotor deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting promotor", error: err.message });
  }
};

// GET /api/admin/promotor/:id/password
exports.getPromotorPassword = async (req, res) => {
  try {
    const promotor = await Promotor.findById(req.params.id).select('name email phone password');
    if (!promotor) return res.status(404).json({ success: false, message: "Promotor not found" });

    res.json({
      success: true,
      data: {
        _id: promotor._id,
        name: promotor.name,
        email: promotor.email,
        phone: promotor.phone,
        hasPassword: !!promotor.password,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error fetching promotor password info", error: err.message });
  }
};

// PATCH /api/admin/promotor/:id/password
exports.resetPromotorPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const promotor = await Promotor.findById(req.params.id);
    if (!promotor) return res.status(404).json({ success: false, message: "Promotor not found" });

    const hashed = await bcrypt.hash(newPassword, 10);
    promotor.password = hashed;
    await promotor.save();

    res.json({ success: true, message: "Promotor password updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error updating promotor password", error: err.message });
  }
};
