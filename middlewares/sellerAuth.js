const jwt = require("jsonwebtoken");
const { Seller } = require("../models/seller");
require("dotenv").config();

const sellerAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ 
        success: false, 
        message: "No token provided" 
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const seller = await Seller.findById(decoded.id);

    if (!seller) {
      return res.status(404).json({ 
        success: false, 
        message: "Seller not found" 
      });
    }

    if (seller.approvalStatus !== "approved") {
      return res.status(403).json({ 
        success: false, 
        message: "Your account is not approved yet" 
      });
    }

    if (!seller.isActive) {
      return res.status(403).json({ 
        success: false, 
        message: "Your account is inactive. Please contact support." 
      });
    }

    req.seller = seller;
    next();
  } catch (error) {
    console.error("Seller auth error:", error);
    res.status(401).json({ 
      success: false, 
      message: "Invalid or expired token", 
      error: error.message 
    });
  }
};

module.exports = sellerAuth;