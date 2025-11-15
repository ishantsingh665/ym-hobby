const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { logUserAction } = require('../utils/security');
const tokenManager = require('./tokenManager');

/**
 * Password reset module for YM7 Hobby
 * Handles password reset requests and token validation
 */

const passwordReset = {
    /**
     * Request password reset
     */
    async requestReset(email) {
        try {
            // Validate email exists and is verified
            const user = await db.query(
                `SELECT id, email FROM users 
                 WHERE email = $1 AND email_verified = TRUE`,
                [email]
            );

            if (user.rows.length === 0) {
                // Don't reveal if email exists for security
                return { 
                    success: true,
                    message: 'If the email exists, a reset link has been sent'
                };
            }

            const userId = user.rows[0].id;

            // Generate reset token
            const resetToken = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

            // Store reset token
            await db.query(
                `UPDATE users 
                 SET reset_token = $1, reset_token_expires = $2 
                 WHERE id = $3`,
                [resetToken, expiresAt, userId]
            );

            // Log the action
            await logUserAction(userId, 'password_reset_requested');

            // In production, you would send an email here
            // For now, we'll return the token for testing
            if (process.env.NODE_ENV === 'development') {
                console.log(`Password reset token for ${email}: ${resetToken}`);
            }

            return { 
                success: true,
                message: 'If the email exists, a reset link has been sent',
                resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined
            };

        } catch (error) {
            console.error('Password reset request error:', error);
            return { 
                error: 'Password reset request failed',
                code: 'RESET_REQUEST_FAILED'
            };
        }
    },

    /**
     * Reset password using token
     */
    async resetPassword(token, newPassword) {
        try {
            // Validate token
            const user = await db.query(
                `SELECT id FROM users 
                 WHERE reset_token = $1 
                 AND reset_token_expires > NOW()`,
                [token]
            );

            if (user.rows.length === 0) {
                return { 
                    error: 'Invalid or expired reset token',
                    code: 'INVALID_RESET_TOKEN'
                };
            }

            const userId = user.rows[0].id;

            // Validate password strength
            if (newPassword.length < 8) {
                return { 
                    error: 'Password must be at least 8 characters long',
                    code: 'PASSWORD_TOO_SHORT'
                };
            }

            if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
                return { 
                    error: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
                    code: 'PASSWORD_WEAK'
                };
            }

            // Hash new password
            const hashedPassword = await bcrypt.hash(newPassword, 12);

            // Update password and clear reset token
            await db.query(
                `UPDATE users 
                 SET password_hash = $1, 
                     reset_token = NULL, 
                     reset_token_expires = NULL,
                     login_attempts = 0, 
                     locked_until = NULL 
                 WHERE id = $2`,
                [hashedPassword, userId]
            );

            // Revoke all existing tokens for security
            await tokenManager.revokeAllUserTokens(userId);

            // Log the action
            await logUserAction(userId, 'password_reset_completed');

            return { 
                success: true,
                message: 'Password reset successfully'
            };

        } catch (error) {
            console.error('Password reset error:', error);
            return { 
                error: 'Password reset failed',
                code: 'RESET_FAILED'
            };
        }
    },

    /**
     * Validate reset token
     */
    async validateResetToken(token) {
        try {
            const result = await db.query(
                `SELECT id, email FROM users 
                 WHERE reset_token = $1 
                 AND reset_token_expires > NOW()`,
                [token]
            );

            if (result.rows.length === 0) {
                return { 
                    valid: false,
                    error: 'Invalid or expired token'
                };
            }

            return { 
                valid: true,
                user: {
                    id: result.rows[0].id,
                    email: result.rows[0].email
                }
            };

        } catch (error) {
            console.error('Token validation error:', error);
            return { 
                valid: false,
                error: 'Token validation failed'
            };
        }
    },

    /**
     * Clean up expired reset tokens
     */
    async cleanupExpiredTokens() {
        try {
            const result = await db.query(
                `UPDATE users 
                 SET reset_token = NULL, reset_token_expires = NULL 
                 WHERE reset_token_expires < NOW()`
            );

            return result.rowCount;

        } catch (error) {
            console.error('Reset token cleanup error:', error);
            return 0;
        }
    }
};

// Initialize cleanup interval
setInterval(() => {
    passwordReset.cleanupExpiredTokens();
}, 24 * 60 * 60 * 1000); // Clean daily

module.exports = passwordReset;
