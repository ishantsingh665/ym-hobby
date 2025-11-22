/**
 * Verification Controller
 * Handles email verification and account activation
 */

const db = require('../config/database');
const TokenManager = require('./tokenManager');
const EmailService = require('./emailService');

class VerificationController {

    /**
     * Verify email address with token
     */
    static async verifyEmail(req, res) {
        try {
            const { token } = req.query;
            
            console.log('🔐 Email verification attempt with token:', token ? 'provided' : 'missing');

            if (!token) {
                return res.status(400).json({
                    error: 'Verification token is required',
                    code: 'MISSING_TOKEN'
                });
            }

            const tokenManager = new TokenManager();
            let decoded;

            try {
                decoded = await tokenManager.verifyVerificationToken(token);
                console.log('✅ Token decoded for user:', decoded.userId);
            } catch (err) {
                console.log('❌ Token verification failed:', err.message);
                return res.status(400).json({
                    error: 'Invalid or expired verification token',
                    code: 'INVALID_TOKEN'
                });
            }

            if (!decoded || !decoded.userId) {
                return res.status(400).json({
                    error: 'Malformed verification token',
                    code: 'INVALID_TOKEN_FORMAT'
                });
            }

            const result = await db.query(
                `UPDATE users 
                 SET email_verified = true, verified_at = NOW() 
                 WHERE id = $1 AND email_verified = false 
                 RETURNING id, email, display_name`,
                [decoded.userId]
            );

            if (result.rows.length === 0) {
                const userCheck = await db.query(
                    'SELECT id, email, email_verified FROM users WHERE id = $1',
                    [decoded.userId]
                );

                if (userCheck.rows.length === 0) {
                    return res.status(404).json({
                        error: 'User not found',
                        code: 'USER_NOT_FOUND'
                    });
                }

                console.log('ℹ️ User already verified:', userCheck.rows[0].email);
                return res.status(200).json({
                    message: 'Email already verified',
                    code: 'ALREADY_VERIFIED'
                });
            }

            const user = result.rows[0];
            console.log('✅ Email verified successfully for:', user.email);

            return res.status(200).json({
                message: 'Email verified successfully',
                code: 'VERIFICATION_SUCCESS',
                user
            });

        } catch (error) {
            console.error('❌ Verification failed:', error);
            return res.status(500).json({
                error: 'Verification failed',
                code: 'VERIFICATION_FAILED'
            });
        }
    }

    /**
     * Resend verification email
     */
    static async resendVerification(req, res) {
        try {
            const { email } = req.body;
            
            console.log('🔄 Resend verification request for:', email);

            if (!email) {
                return res.status(400).json({
                    error: 'Email is required',
                    code: 'MISSING_EMAIL'
                });
            }

            const result = await db.query(
                `SELECT id, email, display_name, email_verified 
                 FROM users WHERE email = $1`,
                [email]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }

            const user = result.rows[0];

            if (user.email_verified) {
                return res.status(400).json({
                    error: 'Email already verified',
                    code: 'ALREADY_VERIFIED'
                });
            }

            const tokenManager = new TokenManager();
            const token = await tokenManager.generateVerificationToken(user.id);

            const verificationUrl =
                `${process.env.VERIFICATION_BASE_URL || 'https://ym.betahobby.dpdns.org/ym7'}/api/verification/verify?token=${token}`;

            const emailService = new EmailService();

            try {
                await emailService.sendVerificationEmail(
                    user.email,
                    user.display_name,
                    verificationUrl
                );

                console.log('✅ Verification email sent to:', user.email);
                return res.status(200).json({
                    message: 'Verification email sent',
                    code: 'EMAIL_SENT'
                });

            } catch (err) {
                console.error('❌ Email sending failed:', err);
                
                if (process.env.NODE_ENV === 'development') {
                    return res.status(200).json({
                        message: 'Email service unavailable - use URL below',
                        code: 'EMAIL_FAILED_DEV',
                        verification_url: verificationUrl
                    });
                }
                
                return res.status(500).json({
                    error: 'Failed to send verification email',
                    code: 'EMAIL_SEND_FAILED'
                });
            }

        } catch (error) {
            console.error('❌ Resend verification failed:', error);
            return res.status(500).json({
                error: 'Resend verification failed',
                code: 'RESEND_FAILED'
            });
        }
    }

    /**
     * Check verification status
     */
    static async checkVerificationStatus(req, res) {
        try {
            const { userId } = req.params;

            if (!userId) {
                return res.status(400).json({
                    error: 'User ID is required',
                    code: 'MISSING_USER_ID'
                });
            }

            const result = await db.query(
                `SELECT id, email, display_name, email_verified, verified_at 
                 FROM users WHERE id = $1`,
                [userId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }

            return res.status(200).json(result.rows[0]);

        } catch (error) {
            console.error('❌ Status check failed:', error);
            return res.status(500).json({
                error: 'Status check failed',
                code: 'CHECK_FAILED'
            });
        }
    }

    /**
     * Health Check
     */
    static async healthCheck(req, res) {
        try {
            await db.query('SELECT 1');
            console.log('✅ Database connection healthy');

            const tokenManager = new TokenManager();
            const t = await tokenManager.generateVerificationToken(1);
            await tokenManager.verifyVerificationToken(t);
            console.log('✅ Token manager healthy');

            return res.status(200).json({
                status: 'healthy',
                timestamp: new Date().toISOString()
            });

        } catch (err) {
            console.error('❌ Health check failed:', err);
            return res.status(500).json({
                status: 'unhealthy',
                error: err.message,
                timestamp: new Date().toISOString()
            });
        }
    }
}

module.exports = VerificationController;
