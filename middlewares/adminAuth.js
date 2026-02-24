const jwt = require("jsonwebtoken");
const Admin = require("../models/admin");

const adminAuth = async (req, res, next) => {
    try {
        const token = req.header("Authorization")?.replace("Bearer ", "");
        if (!token) {
            return res.status(401).json({ success: false, message: "No token, access denied" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const admin = await Admin.findById(decoded.id).populate('role');

        if (!admin) {
            return res.status(401).json({ success: false, message: "Admin not found" });
        }

        if (!admin.isActive) {
            return res.status(403).json({ success: false, message: "Admin account is deactivated" });
        }

        req.admin = admin;
        next();
    } catch (err) {
        console.error('Admin Auth Error:', err);
        return res.status(401).json({ success: false, message: "Invalid token" });
    }
};

module.exports = { adminAuth };
