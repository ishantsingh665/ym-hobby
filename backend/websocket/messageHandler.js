const db = require('../config/database');
const security = require('./security');
const { getWebSocketConnection } = require('../middleware/auth');

/**
 * WebSocket message handler for YM7 Hobby
 * Processes and routes different types of WebSocket messages
 */

class MessageHandler {
    /**
     * Handle private messages
     */
    async handlePrivateMessage(ws, message) {
        try {
            const { toUserId, message: content } = message;

            // Validate message content
            if (!security.validateMessageContent(content)) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Message contains invalid content'
                }));
                return;
            }

            // Sanitize message content
            const sanitizedContent = security.sanitizeMessageContent(content);

            // Check if users are buddies
            const areBuddies = await db.query(
                `SELECT 1 FROM buddies 
                 WHERE (user_id = $1 AND buddy_user_id = $2)
                 OR (user_id = $2 AND buddy_user_id = $1)`,
                [ws.userId, toUserId]
            );

            if (areBuddies.rows.length === 0) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'You can only message your buddies'
                }));
                return;
            }

            // Check if blocked
            const isBlocked = await db.query(
                `SELECT 1 FROM blocks 
                 WHERE blocker_id = $1 AND blocked_id = $2`,
                [toUserId, ws.userId]
            );

            if (isBlocked.rows.length > 0) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Cannot send message to this user'
                }));
                return;
            }

            // Save message to database
            const savedMessage = await db.query(
                `INSERT INTO messages (from_user_id, to_user_id, message) 
                 VALUES ($1, $2, $3) 
                 RETURNING id, created_at`,
                [ws.userId, toUserId, sanitizedContent]
            );

            // Prepare message for delivery
            const deliveryMessage = {
                type: 'private_message',
                fromUserId: ws.userId,
                message: sanitizedContent,
                messageId: savedMessage.rows[0].id,
                timestamp: savedMessage.rows[0].created_at
            };

            // Send to sender (confirmation)
            ws.send(JSON.stringify({
                ...deliveryMessage,
                direction: 'outgoing'
            }));

            // Send to recipient if online
            const recipientWs = getWebSocketConnection(toUserId);
            if (recipientWs && recipientWs.readyState === 1) {
                recipientWs.send(JSON.stringify({
                    ...deliveryMessage,
                    direction: 'incoming'
                }));
            }

            console.log(`💬 Message sent from ${ws.userId} to ${toUserId}`);

        } catch (error) {
            console.error('Private message handling error:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to send message'
            }));
        }
    }

    /**
     * Handle typing indicators
     */
    async handleTypingIndicator(ws, message) {
        try {
            const { toUserId } = message;

            // Check if users are buddies
            const areBuddies = await db.query(
                `SELECT 1 FROM buddies 
                 WHERE (user_id = $1 AND buddy_user_id = $2)
                 OR (user_id = $2 AND buddy_user_id = $1)`,
                [ws.userId, toUserId]
            );

            if (areBuddies.rows.length === 0) {
                return; // Silently fail for non-buddies
            }

            // Send typing indicator to recipient
            const recipientWs = getWebSocketConnection(toUserId);
            if (recipientWs && recipientWs.readyState === 1) {
                recipientWs.send(JSON.stringify({
                    type: message.type, // 'typing_start' or 'typing_stop'
                    fromUserId: ws.userId,
                    timestamp: new Date().toISOString()
                }));
            }

        } catch (error) {
            console.error('Typing indicator handling error:', error);
        }
    }

    /**
     * Handle message read receipts
     */
    async handleReadReceipt(ws, message) {
        try {
            const { messageId } = message;

            // Verify the message exists and is sent to this user
            const messageResult = await db.query(
                `SELECT from_user_id FROM messages 
                 WHERE id = $1 AND to_user_id = $2`,
                [messageId, ws.userId]
            );

            if (messageResult.rows.length === 0) {
                return; // Silently fail
            }

            // Mark message as read
            await db.query(
                `UPDATE messages SET read = TRUE 
                 WHERE id = $1`,
                [messageId]
            );

            // Notify sender that message was read
            const senderWs = getWebSocketConnection(messageResult.rows[0].from_user_id);
            if (senderWs && senderWs.readyState === 1) {
                senderWs.send(JSON.stringify({
                    type: 'message_read',
                    messageId: messageId,
                    readerId: ws.userId,
                    timestamp: new Date().toISOString()
                }));
            }

        } catch (error) {
            console.error('Read receipt handling error:', error);
        }
    }

    /**
     * Handle user status updates
     */
    async handleStatusUpdate(ws, message) {
        try {
            const { status } = message;

            // Validate status
            const validStatuses = ['online', 'away', 'busy', 'offline'];
            if (!validStatuses.includes(status)) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Invalid status'
                }));
                return;
            }

            // Update user status in database
            await db.query(
                'UPDATE users SET status = $1 WHERE id = $2',
                [status, ws.userId]
            );

            // Notify buddies about status change
            const buddies = await db.query(
                `SELECT buddy_user_id FROM buddies WHERE user_id = $1`,
                [ws.userId]
            );

            for (const buddy of buddies.rows) {
                const buddyWs = getWebSocketConnection(buddy.buddy_user_id);
                if (buddyWs && buddyWs.readyState === 1) {
                    buddyWs.send(JSON.stringify({
                        type: 'buddy_status_change',
                        userId: ws.userId,
                        status: status,
                        timestamp: new Date().toISOString()
                    }));
                }
            }

            ws.send(JSON.stringify({
                type: 'status_updated',
                status: status
            }));

        } catch (error) {
            console.error('Status update handling error:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to update status'
            }));
        }
    }

    /**
     * Handle presence notifications
     */
    async handlePresenceNotification(ws, message) {
        try {
            const { userIds } = message;

            // Get online status for requested users
            const statusResult = await db.query(
                `SELECT id, status FROM users 
                 WHERE id = ANY($1) AND id != $2`,
                [userIds, ws.userId]
            );

            const statuses = statusResult.rows.reduce((acc, user) => {
                acc[user.id] = user.status;
                return acc;
            }, {});

            ws.send(JSON.stringify({
                type: 'presence_update',
                statuses: statuses,
                timestamp: new Date().toISOString()
            }));

        } catch (error) {
            console.error('Presence notification handling error:', error);
        }
    }
}

module.exports = new MessageHandler();
