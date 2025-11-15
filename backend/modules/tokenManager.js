const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/database');

/**
 * Token management module for YM7 Hobby
 * Handles JWT token generation, verification, and refresh tokens
 */

class TokenManager {
    /**
     * Generate access and refresh tokens
     */
    async generateTokens(user) {
        try {
            // Generate access token (short-lived)
            const accessToken = jwt.sign(
                {
                    id: user.id,
                    email: user.email,
                    type: 'access'
                },
                process.env.JWT_SECRET,
                { 
                    expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
                    issuer: 'ym7-hobby',
                    audience: 'ym7-web-client'
                }
            );

            // Generate refresh token (long-lived)
            const refreshToken = crypto.randomBytes(64).toString('hex');
            const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

            // Store refresh token in database
            await db.query(
                `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) 
                 VALUES ($1, $2, $3)`,
                [user.id, refreshTokenHash, expiresAt]
            );

            return { 
                accessToken, 
                refreshToken,
                expiresIn: 15 * 60 // 15 minutes in seconds
            };

        } catch (error) {
            console.error('Token generation error:', error);
            throw new Error('Failed to generate tokens');
        }
    }

    /**
     * Verify refresh token and return user data
     */
    async verifyRefreshToken(token) {
        try {
            const tokenHash = await bcrypt.hash(token, 10);

            const result = await db.query(
                `SELECT rt.user_id, u.email, u.display_name
                 FROM refresh_tokens rt
                 JOIN users u ON rt.user_id = u.id
                 WHERE rt.token_hash = $1 
                 AND rt.expires_at > NOW() 
                 AND rt.revoked = FALSE`,
                [tokenHash]
            );

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0];

        } catch (error) {
            console.error('Refresh token verification error:', error);
            return null;
        }
    }

    /**
     * Refresh access token using refresh token
     */
    async refreshAccessToken(refreshToken) {
        try {
            const user = await this.verifyRefreshToken(refreshToken);
            
            if (!user) {
                return { 
                    error: 'Invalid or expired refresh token',
                    code: 'INVALID_REFRESH_TOKEN'
                };
            }

            // Generate new access token
            const accessToken = jwt.sign(
                {
                    id: user.user_id,
                    email: user.email,
                    type: 'access'
                },
                process.env.JWT_SECRET,
                { 
                    expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
                    issuer: 'ym7-hobby',
                    audience: 'ym7-web-client'
                }
            );

            return { 
                accessToken,
                expiresIn: 15 * 60 // 15 minutes in seconds
            };

        } catch (error) {
            console.error('Token refresh error:', error);
            return { 
                error: 'Token refresh failed',
                code: 'TOKEN_REFRESH_FAILED'
            };
        }
    }

    /**
     * Revoke a specific refresh token
     */
    async revokeToken(token) {
        try {
            const tokenHash = await bcrypt.hash(token, 10);
            
            const result = await db.query(
                'UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1',
                [tokenHash]
            );

            return result.rowCount > 0;

        } catch (error) {
            console.error('Token revocation error:', error);
            return false;
        }
    }

    /**
     * Revoke all refresh tokens for a user
     */
    async revokeAllUserTokens(userId) {
        try {
            await db.query(
                'UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1',
                [userId]
            );
            return true;
        } catch (error) {
            console.error('Revoke all tokens error:', error);
            return false;
        }
    }

    /**
     * Clean up expired tokens
     */
    async cleanupExpiredTokens() {
        try {
            const result = await db.query(
                'DELETE FROM refresh_tokens WHERE expires_at < NOW()'
            );
            return result.rowCount;
        } catch (error) {
            console.error('Token cleanup error:', error);
            return 0;
        }
    }

    /**
     * Verify access token
     */
    verifyAccessToken(token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            if (decoded.type !== 'access') {
                throw new Error('Invalid token type');
            }

            return decoded;
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new Error('Token expired');
            }
            if (error.name === 'JsonWebTokenError') {
                throw new Error('Invalid token');
            }
            throw error;
        }
    }

    /**
     * Decode token without verification (for logout)
     */
    decodeToken(token) {
        try {
            return jwt.decode(token);
        } catch (error) {
            console.error('Token decode error:', error);
            return null;
        }
    }
}

module.exports = new TokenManager();
