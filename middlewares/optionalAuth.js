/**
 * optionalAuth middleware
 * Attaches req.user if a valid Bearer token is present.
 * Does NOT block the request if no token is provided (unlike authMiddleware).
 * Use this for public routes that have optional user-specific behavior (e.g., follow status).
 */

const jwt = require('jsonwebtoken');
const User = require('../models/user');

const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id).select('-otp -otpExpires -password');
        }
    } catch {
        // Token invalid or expired — just proceed without user context
        req.user = null;
    }
    next();
};

module.exports = optionalAuth;
