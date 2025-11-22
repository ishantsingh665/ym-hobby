/**
 * Email Service
 * Handles sending verification emails
 */

const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: process.env.SMTP_PORT || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            },
            tls: {
                rejectUnauthorized: false
            }
        });
    }

    /**
     * Send verification email
     */
    async sendVerificationEmail(toEmail, displayName, verificationUrl) {
        try {
            const mailOptions = {
                from: `"${process.env.FROM_NAME || 'YM7 Hobby'}" <${process.env.FROM_EMAIL}>`,
                to: toEmail,
                subject: process.env.VERIFICATION_EMAIL_SUBJECT || 'Verify Your YM7 Hobby Account',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
                            .content { padding: 20px; background: #f9f9f9; }
                            .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 5px; }
                            .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>Verify Your Email</h1>
                            </div>
                            <div class="content">
                                <p>Hello <strong>${displayName}</strong>,</p>
                                <p>Thank you for registering with YM7 Hobby! Please verify your email address by clicking the button below:</p>
                                <p style="text-align: center;">
                                    <a href="${verificationUrl}" class="button">Verify Email Address</a>
                                </p>
                                <p>Or copy and paste this link in your browser:</p>
                                <p><code>${verificationUrl}</code></p>
                                <p>If you didn't create an account, you can safely ignore this email.</p>
                            </div>
                            <div class="footer">
                                <p>&copy; ${new Date().getFullYear()} YM7 Hobby. All rights reserved.</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `,
                text: `
                    Verify Your YM7 Hobby Account

                    Hello ${displayName},

                    Thank you for registering with YM7 Hobby! Please verify your email address by visiting the following link:

                    ${verificationUrl}

                    If you didn't create an account, you can safely ignore this email.

                    Best regards,
                    The YM7 Hobby Team
                `
            };

            const info = await this.transporter.sendMail(mailOptions);
            console.log('✅ Verification email sent:', info.messageId);
            return info;

        } catch (error) {
            console.error('❌ Error sending verification email:', error);
            throw error;
        }
    }

    /**
     * Test email connection
     */
    async testConnection() {
        try {
            await this.transporter.verify();
            console.log('✅ Email service connected successfully');
            return true;
        } catch (error) {
            console.error('❌ Email service connection failed:', error);
            return false;
        }
    }
}

module.exports = EmailService;
