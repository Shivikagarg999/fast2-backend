const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const emailService = require("../../services/emailServices");
const User = require("../../models/user");

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

        const user = await User.create({
            email,
            password: hashedPassword,
            wallet: 20,
            referralCode: newReferralCode,
            referredBy: referralCode || null,
            isVerified: true
        });

        if (referralCode) {
            const referrer = await User.findOne({ referralCode });
            if (referrer) {
                referrer.wallet += 200;
                await referrer.save();
            }
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
            expiresIn: "7d"
        });

        await emailService.sendWelcomeEmail(email);

        return res.status(201).json({
            message: "Registration successful",
            token,
            wallet: user.wallet,
            referralCode: user.referralCode,
            user: {
                id: user._id,
                email: user.email
            }
        });
    } catch (err) {
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
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
            expiresIn: "7d"
        });

        return res.json({
            message: "Login successful",
            token,
            wallet: user.wallet,
            referralCode: user.referralCode,
            user: {
                id: user._id,
                email: user.email
            }
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(200).json({ 
                message: "If email exists, reset instructions sent" 
            });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

        user.resetPasswordToken = hashedToken;
        user.resetPasswordExpires = Date.now() + 3600000;
        await user.save();

        await emailService.sendPasswordResetEmail(email, resetToken);

        return res.status(200).json({ 
            message: "Password reset email sent" 
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({ error: "Token and password required" });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: "Password must be at least 6 characters" });
        }

        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ error: "Invalid or expired token" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        return res.status(200).json({ 
            message: "Password reset successful" 
        });
    } catch (err) {
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
                    const response = await fetch('${process.env.BACKEND_URL}/api/user/reset-password', {
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
                        showMessage(data.message + '. You can now login with your new password.', 'success');
                        document.getElementById('resetPasswordForm').reset();
                        setTimeout(() => {
                            window.location.href = '${process.env.FRONTEND_URL}/login';
                        }, 3000);
                    } else {
                        showMessage(data.error || 'Failed to reset password', 'error');
                    }
                } catch (error) {
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

function generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}