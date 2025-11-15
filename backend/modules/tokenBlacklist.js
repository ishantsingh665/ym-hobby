const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

/**
 * Token blacklist module for YM7 Hobby
 * Handles token revocation and blacklisting for logout functionality
 */

class TokenBlacklist {
    /**
     * Add token to blacklist
     */
    async addToken(token) {
        try {
            const decoded = jwt.decode(token);
            
            if (!decoded || !decoded.exp) {
                console.warn('Invalid token format for blacklisting');
                return false;
            }

            const tokenHash = await bcrypt.hash(token, 10);
            const expiresAt = new Date(decoded.exp * 1000); // Convert to milliseconds

            await db.query(
                `INSERT INTO token_blacklist (token_hash, expires_at) 
                 VALUES ($1, $2) 
                 ON CONFLICT (token_hash) DO NOTHING`,
                [tokenHash, expiresAt]
            );

            console.log(`Token blacklisted for user ${decoded.id}`);
            return true;

        } catch (error) {
            console.error('Token blacklist error:', error);
            return false;
        }
    }

    /**
     * Check if token is blacklisted
     */
    async isTokenBlacklisted(token) {
        try {
            const tokenHash = await bcrypt.hash(token, 10);

            const result = await db.query(
                `SELECT 1 FROM token_blacklist 
                 WHERE token_hash = $1 AND expires_at > NOW()`,
                [tokenHash]
            );

            return result.rows.length > 0;

        } catch (error) {
            console.error('Token blacklist check error:', error);
            return true; // Fail secure - treat as blacklisted on error
        }
    }

    /**
     * Remove expired tokens from blacklist
     */
    async cleanupExpiredTokens() {
        try {
            const result = await db.query(
                'DELETE FROM token_blacklist WHERE expires_at <= NOW()'
            );
            
            console.log(`Cleaned up ${result.rowCount} expired blacklisted tokens`);
            return result.rowCount;

        } catch (error) {
            console.error('Token blacklist cleanup error:', error);
            return 0;
        }
    }

    /**
     * Get blacklist statistics
     */
    async getStats() {
        try {
            const totalResult = await db.query(
                'SELECT COUNT(*) as total FROM token_blacklist'
            );
            
            const activeResult = await db.query(
                'SELECT COUNT(*) as active FROM token_blacklist WHERE expires_at > NOW()'
            );

            return {
                total: parseInt(totalResult.rows[0].total),
                active: parseInt(activeResult.rows[0].active)
            };

        } catch (error) {
            console.error('Blacklist stats error:', error);
            return { total: 0, active: 0 };
        }
    }

    /**
     * Bulk add tokens to blacklist (for mass logout)
     */
    async bulkAddTokens(tokens) {
        try {
            let successCount = 0;
            
            for (const token of tokens) {
                if (await this.addToken(token)) {
                    successCount++;
                }
            }

            return { successCount, totalCount: tokens.length };

        } catch (error) {
            console.error('Bulk token blacklist error:', error);
            return { successCount: 0, totalCount: tokens.length };
        }
    }
}

// Initialize cleanup interval
setInterval(() => {
    const blacklist = new TokenBlacklist();
    blacklist.cleanupExpiredTokens();
}, 60 * 60 * 1000); // Clean every hour

module.exports = new TokenBlacklist();
