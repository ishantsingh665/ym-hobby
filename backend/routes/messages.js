const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { 
    messageValidation, 
    idValidation, 
    paginationValidation,
    handleValidationErrors,
    sanitizeInput 
} = require('../middleware/validation');
const { getWebSocketConnection } = require('../middleware/auth');

/**
 * Messaging routes for YM7 Hobby
 */

// Send private message
router.post('/private',
    authenticateToken,
    sanitizeInput,
    messageValidation,
    handleValidationErrors,
    async (req, res) => {
        try {
            const { toUserId, message } = req.body;
            const fromUserId = req.user.id;

            // Check if users are buddies
            const areBuddies = await db.query(
                `SELECT 1 FROM buddies 
                 WHERE (user_id = $1 AND buddy_user_id = $2)
                 OR (user_id = $2 AND buddy_user_id = $1)`,
                [fromUserId, toUserId]
            );

            if (areBuddies.rows.length === 0) {
                return res.status(403).json({
                    error: 'You can only message your buddies',
                    code: 'NOT_BUDDIES'
                });
            }

            // Check if blocked
            const isBlocked = await db.query(
                `SELECT 1 FROM blocks 
                 WHERE blocker_id = $1 AND blocked_id = $2`,
                [toUserId, fromUserId]
            );

            if (isBlocked.rows.length > 0) {
                return res.status(403).json({
                    error: 'Cannot send message to this user',
                    code: 'USER_BLOCKED'
                });
            }

            // Save message to database
            const savedMessage = await db.query(
                `INSERT INTO messages (from_user_id, to_user_id, message) 
                 VALUES ($1, $2, $3) 
                 RETURNING id, created_at`,
                [fromUserId, toUserId, message]
            );

            // Send to recipient via WebSocket if online
            const recipientWs = getWebSocketConnection(toUserId);
            if (recipientWs && recipientWs.readyState === 1) {
                recipientWs.send(JSON.stringify({
                    type: 'private_message',
                    fromUserId: fromUserId,
                    message: message,
                    messageId: savedMessage.rows[0].id,
                    timestamp: savedMessage.rows[0].created_at
                }));
            }

            res.json({
                success: true,
                message: 'Message sent successfully',
                messageId: savedMessage.rows[0].id,
                timestamp: savedMessage.rows[0].created_at
            });

        } catch (error) {
            console.error('Send message route error:', error);
            res.status(500).json({
                error: 'Failed to send message',
                code: 'MESSAGE_SEND_FAILED'
            });
        }
    }
);

// Get conversation history
router.get('/conversation/:userId',
    authenticateToken,
    paginationValidation,
    handleValidationErrors,
    async (req, res) => {
        try {
            const { userId } = req.params;
            const currentUserId = req.user.id;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const offset = (page - 1) * limit;

            // Verify users are buddies
            const areBuddies = await db.query(
                `SELECT 1 FROM buddies 
                 WHERE (user_id = $1 AND buddy_user_id = $2)
                 OR (user_id = $2 AND buddy_user_id = $1)`,
                [currentUserId, userId]
            );

            if (areBuddies.rows.length === 0) {
                return res.status(403).json({
                    error: 'You can only view conversations with your buddies',
                    code: 'NOT_BUDDIES'
                });
            }

            // Get messages between users
            const messages = await db.query(
                `SELECT m.id, m.from_user_id, m.to_user_id, m.message, m.created_at, m.read,
                        u1.display_name as from_display_name,
                        u2.display_name as to_display_name
                 FROM messages m
                 JOIN users u1 ON m.from_user_id = u1.id
                 JOIN users u2 ON m.to_user_id = u2.id
                 WHERE (m.from_user_id = $1 AND m.to_user_id = $2)
                    OR (m.from_user_id = $2 AND m.to_user_id = $1)
                 ORDER BY m.created_at DESC
                 LIMIT $3 OFFSET $4`,
                [currentUserId, userId, limit, offset]
            );

            // Get total count for pagination
            const totalResult = await db.query(
                `SELECT COUNT(*) as total
                 FROM messages
                 WHERE (from_user_id = $1 AND to_user_id = $2)
                    OR (from_user_id = $2 AND to_user_id = $1)`,
                [currentUserId, userId]
            );

            // Mark messages as read
            await db.query(
                `UPDATE messages 
                 SET read = TRUE 
                 WHERE to_user_id = $1 AND from_user_id = $2 AND read = FALSE`,
                [currentUserId, userId]
            );

            res.json({
                success: true,
                messages: messages.rows.reverse(), // Return in chronological order
                pagination: {
                    page,
                    limit,
                    total: parseInt(totalResult.rows[0].total),
                    pages: Math.ceil(totalResult.rows[0].total / limit)
                }
            });

        } catch (error) {
            console.error('Get conversation route error:', error);
            res.status(500).json({
                error: 'Failed to get conversation',
                code: 'CONVERSATION_FETCH_FAILED'
            });
        }
    }
);

// Mark messages as read
router.post('/conversation/:userId/read',
    authenticateToken,
    async (req, res) => {
        try {
            const { userId } = req.params;
            const currentUserId = req.user.id;

            await db.query(
                `UPDATE messages 
                 SET read = TRUE 
                 WHERE to_user_id = $1 AND from_user_id = $2 AND read = FALSE`,
                [currentUserId, userId]
            );

            res.json({
                success: true,
                message: 'Messages marked as read'
            });

        } catch (error) {
            console.error('Mark as read route error:', error);
            res.status(500).json({
                error: 'Failed to mark messages as read',
                code: 'MARK_READ_FAILED'
            });
        }
    }
);

// Get unread message count
router.get('/unread/count',
    authenticateToken,
    async (req, res) => {
        try {
            const result = await db.query(
                `SELECT from_user_id, COUNT(*) as count
                 FROM messages
                 WHERE to_user_id = $1 AND read = FALSE
                 GROUP BY from_user_id`,
                [req.user.id]
            );

            const unreadCounts = result.rows.reduce((acc, row) => {
                acc[row.from_user_id] = parseInt(row.count);
                return acc;
            }, {});

            const totalUnread = result.rows.reduce((sum, row) => sum + parseInt(row.count), 0);

            res.json({
                success: true,
                unreadCounts,
                totalUnread
            });

        } catch (error) {
            console.error('Get unread count route error:', error);
            res.status(500).json({
                error: 'Failed to get unread count',
                code: 'UNREAD_COUNT_FAILED'
            });
        }
    }
);

// Delete message (only for the sender)
router.delete('/:messageId',
    authenticateToken,
    async (req, res) => {
        try {
            const { messageId } = req.params;

            const result = await db.query(
                `DELETE FROM messages 
                 WHERE id = $1 AND from_user_id = $2`,
                [messageId, req.user.id]
            );

            if (result.rowCount === 0) {
                return res.status(404).json({
                    error: 'Message not found or you are not the sender',
                    code: 'MESSAGE_NOT_FOUND'
                });
            }

            res.json({
                success: true,
                message: 'Message deleted successfully'
            });

        } catch (error) {
            console.error('Delete message route error:', error);
            res.status(500).json({
                error: 'Failed to delete message',
                code: 'MESSAGE_DELETE_FAILED'
            });
        }
    }
);

module.exports = router;
