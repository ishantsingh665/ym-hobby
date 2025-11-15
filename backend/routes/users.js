const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { 
    searchValidation, 
    paginationValidation,
    handleValidationErrors,
    sanitizeInput 
} = require('../middleware/validation');

/**
 * User management routes for YM7 Hobby
 */

// Search users
router.get('/search',
    optionalAuth,
    sanitizeInput,
    searchValidation,
    handleValidationErrors,
    async (req, res) => {
        try {
            const { query } = req.query;
            const currentUserId = req.user?.id || null;

            let sql = `
                SELECT id, email, display_name, status, avatar_url, created_at
                FROM users
                WHERE (email ILIKE $1 OR display_name ILIKE $1)
                AND email_verified = TRUE
            `;
            let params = [`%${query}%`];
            let paramCount = 2;

            // Exclude current user if authenticated
            if (currentUserId) {
                sql += ` AND id != $${paramCount}`;
                params.push(currentUserId);
                paramCount++;
            }

            // Exclude blocked users if authenticated
            if (currentUserId) {
                sql += ` AND id NOT IN (
                    SELECT blocked_id FROM blocks WHERE blocker_id = $${paramCount}
                )`;
                params.push(currentUserId);
                paramCount++;
            }

            sql += ` LIMIT 20`;

            const searchResult = await db.query(sql, params);

            res.json({
                success: true,
                users: searchResult.rows,
                count: searchResult.rows.length
            });

        } catch (error) {
            console.error('User search route error:', error);
            res.status(500).json({
                error: 'Search failed',
                code: 'SEARCH_FAILED'
            });
        }
    }
);

// Get user public profile
router.get('/:userId/profile',
    optionalAuth,
    async (req, res) => {
        try {
            const { userId } = req.params;
            const currentUserId = req.user?.id || null;

            const userResult = await db.query(
                `SELECT id, display_name, status, avatar_url, created_at
                 FROM users 
                 WHERE id = $1 AND email_verified = TRUE`,
                [userId]
            );

            if (userResult.rows.length === 0) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }

            const user = userResult.rows[0];
            let relationship = 'none';

            // Check relationship if authenticated
            if (currentUserId) {
                // Check if buddies
                const buddyResult = await db.query(
                    `SELECT 1 FROM buddies 
                     WHERE (user_id = $1 AND buddy_user_id = $2)
                     OR (user_id = $2 AND buddy_user_id = $1)`,
                    [currentUserId, userId]
                );

                if (buddyResult.rows.length > 0) {
                    relationship = 'buddies';
                } else {
                    // Check if pending request
                    const requestResult = await db.query(
                        `SELECT 1 FROM buddy_requests 
                         WHERE ((from_user_id = $1 AND to_user_id = $2)
                         OR (from_user_id = $2 AND to_user_id = $1))
                         AND status = 'pending'`,
                        [currentUserId, userId]
                    );

                    if (requestResult.rows.length > 0) {
                        relationship = 'pending';
                    }

                    // Check if blocked
                    const blockResult = await db.query(
                        `SELECT 1 FROM blocks 
                         WHERE blocker_id = $1 AND blocked_id = $2`,
                        [currentUserId, userId]
                    );

                    if (blockResult.rows.length > 0) {
                        relationship = 'blocked';
                    }
                }
            }

            res.json({
                success: true,
                user: {
                    id: user.id,
                    displayName: user.display_name,
                    status: user.status,
                    avatarUrl: user.avatar_url,
                    memberSince: user.created_at
                },
                relationship
            });

        } catch (error) {
            console.error('Get user profile route error:', error);
            res.status(500).json({
                error: 'Failed to get user profile',
                code: 'PROFILE_FETCH_FAILED'
            });
        }
    }
);

// Block user
router.post('/:userId/block',
    authenticateToken,
    async (req, res) => {
        try {
            const { userId } = req.params;
            const currentUserId = req.user.id;

            if (currentUserId === parseInt(userId)) {
                return res.status(400).json({
                    error: 'Cannot block yourself',
                    code: 'SELF_BLOCK_NOT_ALLOWED'
                });
            }

            // Check if already blocked
            const existingBlock = await db.query(
                `SELECT 1 FROM blocks 
                 WHERE blocker_id = $1 AND blocked_id = $2`,
                [currentUserId, userId]
            );

            if (existingBlock.rows.length > 0) {
                return res.status(400).json({
                    error: 'User already blocked',
                    code: 'ALREADY_BLOCKED'
                });
            }

            // Create block
            await db.query(
                `INSERT INTO blocks (blocker_id, blocked_id) 
                 VALUES ($1, $2)`,
                [currentUserId, userId]
            );

            // Remove buddy relationship if exists
            await db.query(
                `DELETE FROM buddies 
                 WHERE (user_id = $1 AND buddy_user_id = $2)
                 OR (user_id = $2 AND buddy_user_id = $1)`,
                [currentUserId, userId]
            );

            // Cancel any pending buddy requests
            await db.query(
                `UPDATE buddy_requests 
                 SET status = 'rejected' 
                 WHERE ((from_user_id = $1 AND to_user_id = $2)
                 OR (from_user_id = $2 AND to_user_id = $1))
                 AND status = 'pending'`,
                [currentUserId, userId]
            );

            res.json({
                success: true,
                message: 'User blocked successfully'
            });

        } catch (error) {
            console.error('Block user route error:', error);
            res.status(500).json({
                error: 'Failed to block user',
                code: 'BLOCK_FAILED'
            });
        }
    }
);

// Unblock user
router.post('/:userId/unblock',
    authenticateToken,
    async (req, res) => {
        try {
            const { userId } = req.params;
            const currentUserId = req.user.id;

            const result = await db.query(
                `DELETE FROM blocks 
                 WHERE blocker_id = $1 AND blocked_id = $2`,
                [currentUserId, userId]
            );

            if (result.rowCount === 0) {
                return res.status(404).json({
                    error: 'User not blocked',
                    code: 'USER_NOT_BLOCKED'
                });
            }

            res.json({
                success: true,
                message: 'User unblocked successfully'
            });

        } catch (error) {
            console.error('Unblock user route error:', error);
            res.status(500).json({
                error: 'Failed to unblock user',
                code: 'UNBLOCK_FAILED'
            });
        }
    }
);

// Get blocked users
router.get('/blocks',
    authenticateToken,
    async (req, res) => {
        try {
            const blockedUsers = await db.query(
                `SELECT u.id, u.display_name, u.email, b.created_at
                 FROM blocks b
                 JOIN users u ON b.blocked_id = u.id
                 WHERE b.blocker_id = $1
                 ORDER BY b.created_at DESC`,
                [req.user.id]
            );

            res.json({
                success: true,
                blockedUsers: blockedUsers.rows
            });

        } catch (error) {
            console.error('Get blocked users route error:', error);
            res.status(500).json({
                error: 'Failed to get blocked users',
                code: 'BLOCKED_USERS_FETCH_FAILED'
            });
        }
    }
);

module.exports = router;
