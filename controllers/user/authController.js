const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const emailService = require("../../services/emailServices");
const User = require("../../models/user");
const firebaseAdmin = require("../../config/firebase");

const signUserToken = (userId) => jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d"
});

function generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

const buildAuthResponse = (message, token, user) => ({
    message,
    token,
    wallet: user.wallet,
    referralCode: user.referralCode,
    user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        avatar: user.avatar
    }
});

const normalizeFirebasePhone = (phoneNumber) => {
    if (!phoneNumber) return null;

    const digits = String(phoneNumber).replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) {
        return digits.slice(2);
    }
    if (digits.length === 10) {
        return digits;
    }
    return digits || null;
};

exports.register = async (req, res) => {
    try {
        const { email, password, referralCode } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password required" });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: "Invalid email format" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: "User already exists" });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: "Password must be at least 6 characters" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newReferralCode = generateReferralCode();

        let referrer = null;
        if (referralCode) {
            referrer = await User.findOne({ referralCode });
        }

        const user = await User.create({
            email,
            password: hashedPassword,
            wallet: 20,
            referralCode: newReferralCode,
            referredBy: referralCode || null,
            isVerified: true
        });

        if (referrer) {
            referrer.wallet += 200;
            referrer.referralCount += 1;
            await referrer.save();
        }

        const token = signUserToken(user._id);

        try {
            await emailService.sendWelcomeEmail(email);
        } catch (emailError) {
            console.error("Welcome email failed:", emailError.message);
        }

        // Send Welcome Notification
        let debugError = null;
        try {
            const notificationService = require("../../services/notificationService");
            await notificationService.sendNotification(
                user._id,
                'Welcome to GMKart!',
                'Thanks for joining us. Check out our latest products!',
                'promo',
                null
            );
        } catch (notifError) {
            console.error('Notification error:', notifError);
            debugError = notifError.message + " | Stack: " + notifError.stack;
        }

        return res.status(201).json({
            message: "Registration successful",
            token,
            wallet: user.wallet,
            referralCode: user.referralCode,
            notification_debug_error: debugError, // <--- EXPOSING ERROR HERE
            user: {
                id: user._id,
                email: user.email
            }
        });
    } catch (err) {
        console.error("Register error:", err);
        return res.status(500).json({ error: err.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password required" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const token = signUserToken(user._id);

        return res.json({
            message: "Login successful",
            token,
            wallet: user.wallet,
            referralCode: user.referralCode,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                avatar: user.avatar
            }
        });
    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).json({ error: err.message });
    }
};

exports.firebaseOtpLogin = async (req, res) => {
    try {
        const { idToken, name, referralCode, fcmToken } = req.body;

        if (!idToken) {
            return res.status(400).json({ error: "Firebase idToken is required" });
        }

        if (!firebaseAdmin.apps || firebaseAdmin.apps.length === 0) {
            return res.status(500).json({ error: "Firebase Admin is not configured on the server" });
        }

        const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);
        const firebaseUid = decodedToken.uid;
        const phone = normalizeFirebasePhone(decodedToken.phone_number);
        const email = decodedToken.email;

        if (!phone && !email) {
            return res.status(400).json({ error: "Firebase token must contain a verified phone number or email" });
        }

        let user = await User.findOne({
            $or: [
                { firebaseUid },
                ...(phone ? [{ phone }] : []),
                ...(email ? [{ email: email.toLowerCase() }] : [])
            ]
        });

        let isNewUser = false;

        if (!user) {
            const newReferralCode = generateReferralCode();
            let referrer = null;

            if (referralCode) {
                referrer = await User.findOne({ referralCode });
            }

            user = await User.create({
                name: name || decodedToken.name || "User",
                email: email ? email.toLowerCase() : undefined,
                phone,
                firebaseUid,
                fcmToken,
                wallet: 20,
                referralCode: newReferralCode,
                referredBy: referrer ? referrer._id : null,
                isVerified: true
            });

            if (referrer) {
                referrer.wallet += 200;
                referrer.referralCount += 1;
                await referrer.save();
            }

            isNewUser = true;
        } else {
            if (!user.firebaseUid) user.firebaseUid = firebaseUid;
            if (phone && !user.phone) user.phone = phone;
            if (email && !user.email) user.email = email.toLowerCase();
            if (name && !user.name) user.name = name;
            if (fcmToken) user.fcmToken = fcmToken;
            user.isVerified = true;
            await user.save();
        }

        const token = signUserToken(user._id);
        return res.status(isNewUser ? 201 : 200).json(
            buildAuthResponse(isNewUser ? "Signup successful" : "Login successful", token, user)
        );
    } catch (err) {
        console.error("Firebase OTP login error:", err);
        return res.status(401).json({ error: err.message || "Invalid Firebase token" });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        const user = await User.findOne({ email });

        // Always return success message for security
        if (!user) {
            return res.status(200).json({
                message: "If an account exists with this email, reset instructions have been sent"
            });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

        // Save token to user
        user.resetPasswordToken = hashedToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        // Send reset email
        try {
            await emailService.sendPasswordResetEmail(email, resetToken);
        } catch (emailError) {
            console.error("Reset email failed:", emailError.message);
            return res.status(500).json({ error: "Failed to send reset email" });
        }

        return res.status(200).json({
            message: "Password reset email sent"
        });
    } catch (err) {
        console.error("Forgot password error:", err);
        return res.status(500).json({ error: err.message });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;

        console.log("Reset password request received");

        if (!token || !password) {
            return res.status(400).json({ error: "Token and password required" });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: "Password must be at least 6 characters" });
        }

        // Hash the token to compare with stored token
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        console.log("Looking for user with token:", hashedToken);
        console.log("Current time:", new Date(Date.now()));

        // Find user with valid token
        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            console.log("No valid user found or token expired");
            return res.status(400).json({ error: "Invalid or expired reset token" });
        }

        console.log("User found:", user.email);

        // Update password
        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        console.log("Password reset successful for:", user.email);

        return res.status(200).json({
            message: "Password reset successful. You can now login with your new password."
        });
    } catch (err) {
        console.error("Reset password error:", err);
        console.error("Error stack:", err.stack);
        return res.status(500).json({ error: err.message });
    }
};

exports.serveResetPasswordPage = (req, res) => {
    const token = req.query.token;

    if (!token) {
        return res.status(400).send("Invalid reset link");
    }

    const htmlPage = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Password</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 20px;
            }
            .container {
                background: white;
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                width: 100%;
                max-width: 400px;
                padding: 40px;
            }
            .logo {
                text-align: center;
                margin-bottom: 30px;
            }
            .logo h1 {
                color: #333;
                font-size: 28px;
                font-weight: 600;
            }
            .form-group {
                margin-bottom: 20px;
            }
            label {
                display: block;
                margin-bottom: 8px;
                color: #555;
                font-weight: 500;
            }
            input {
                width: 100%;
                padding: 12px 16px;
                border: 2px solid #e0e0e0;
                border-radius: 10px;
                font-size: 16px;
                transition: border-color 0.3s;
            }
            input:focus {
                outline: none;
                border-color: #667eea;
            }
            .submit-btn {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                padding: 14px 20px;
                border-radius: 10px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                width: 100%;
                transition: transform 0.2s, box-shadow 0.2s;
            }
            .submit-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
            }
            .submit-btn:active {
                transform: translateY(0);
            }
            .message {
                text-align: center;
                margin-top: 20px;
                padding: 10px;
                border-radius: 10px;
                display: none;
            }
            .success {
                background-color: #d4edda;
                color: #155724;
                border: 1px solid #c3e6cb;
            }
            .error {
                background-color: #f8d7da;
                color: #721c24;
                border: 1px solid #f5c6cb;
            }
            .password-info {
                font-size: 12px;
                color: #666;
                margin-top: 5px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">
                <h1>Reset Password</h1>
            </div>
            <form id="resetPasswordForm">
                <div class="form-group">
                    <label for="newPassword">New Password</label>
                    <input type="password" id="newPassword" required minlength="6">
                    <div class="password-info">Password must be at least 6 characters long</div>
                </div>
                <div class="form-group">
                    <label for="confirmPassword">Confirm Password</label>
                    <input type="password" id="confirmPassword" required minlength="6">
                </div>
                <input type="hidden" id="resetToken" value="${token}">
                <button type="submit" class="submit-btn">Reset Password</button>
            </form>
            <div id="message" class="message"></div>
        </div>
        
        <script>
            document.getElementById('resetPasswordForm').addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const newPassword = document.getElementById('newPassword').value;
                const confirmPassword = document.getElementById('confirmPassword').value;
                const token = document.getElementById('resetToken').value;
                const messageDiv = document.getElementById('message');
                
                if (newPassword.length < 6) {
                    showMessage('Password must be at least 6 characters long', 'error');
                    return;
                }
                
                if (newPassword !== confirmPassword) {
                    showMessage('Passwords do not match', 'error');
                    return;
                }
                
                try {
                    const response = await fetch('http://localhost:5000/api/user/reset-password', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            token: token,
                            password: newPassword
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok) {
                        showMessage(data.message, 'success');
                        document.getElementById('resetPasswordForm').reset();
                        setTimeout(() => {
                            window.location.href = 'https://GMKart.in/login';
                        }, 3000);
                    } else {
                        showMessage(data.error || 'Failed to reset password', 'error');
                    }
                } catch (error) {
                    console.error('Reset error:', error);
                    showMessage('Network error. Please try again.', 'error');
                }
            });
            
            function showMessage(text, type) {
                const messageDiv = document.getElementById('message');
                messageDiv.textContent = text;
                messageDiv.className = 'message ' + type;
                messageDiv.style.display = 'block';
                
                setTimeout(() => {
                    messageDiv.style.display = 'none';
                }, 5000);
            }
        </script>
    </body>
    </html>
    `;

    res.send(htmlPage);
};

exports.deleteAccount = async (req, res) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: "Password is required to delete your account" });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Incorrect password" });
        }

        await User.findByIdAndDelete(req.user._id);

        return res.status(200).json({ message: "Account deleted successfully" });
    } catch (err) {
        console.error("Delete account error:", err);
        return res.status(500).json({ error: err.message });
    }
};

