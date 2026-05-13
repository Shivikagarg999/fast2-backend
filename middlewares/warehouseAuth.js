const jwt = require("jsonwebtoken");
const Warehouse = require("../models/warehouse");

const warehouseAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const warehouse = await Warehouse.findById(decoded.id);

    if (!warehouse) {
      return res.status(404).json({ success: false, message: "Warehouse not found" });
    }
    if (!warehouse.isActive) {
      return res.status(403).json({ success: false, message: "Warehouse is inactive" });
    }

    req.warehouse = warehouse;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: "Invalid or expired token", error: error.message });
  }
};

module.exports = warehouseAuth;
