const jwt = require("jsonwebtoken");
const Promotor = require("../models/promotor");
require("dotenv").config();

const promotorAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const promotor = await Promotor.findById(decoded.id).select("-password");

    if (!promotor) {
      return res.status(404).json({
        success: false,
        message: "Promotor not found",
      });
    }

    if (!promotor.active) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Please contact support.",
      });
    }

    req.promotor = promotor;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
      error: error.message,
    });
  }
};

module.exports = promotorAuth;
