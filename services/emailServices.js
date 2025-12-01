const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        this.emailUser = process.env.EMAIL_USER;
        this.emailPass = process.env.EMAIL_PASS;

        if (!this.emailUser || !this.emailPass) {
            throw new Error('Email credentials required');
        }

        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: this.emailUser,
                pass: this.emailPass
            }
        });
    }

    async sendWelcomeEmail(email) {
        const mailOptions = {
            from: this.emailUser,
            to: email,
            subject: "Welcome to Fast 2",
            html: `
                <div>
                    <h2>Welcome</h2>
                    <p>Your account has been created.</p>
                </div>
            `
        };

        return this.sendEmail(mailOptions);
    }

    async sendPasswordResetEmail(email, resetToken) {
        const resetUrl = `https://api.fast2.in/api/auth/reset-password-page?token=${resetToken}`;
        
        const mailOptions = {
            from: this.emailUser,
            to: email,
            subject: "Password Reset",
            html: `
                <div>
                    <h2>Password Reset</h2>
                    <p>Click to reset:</p>
                    <p><a href="${resetUrl}">Reset Password</a></p>
                </div>
            `
        };

        return this.sendEmail(mailOptions);
    }

    async sendEmail(mailOptions) {
        try {
            await this.transporter.sendMail(mailOptions);
            return { success: true };
        } catch (error) {
            console.error("Email send error:", error.message);
            throw new Error('Email failed');
        }
    }
}

module.exports = new EmailService();