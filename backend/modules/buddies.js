const db = require('../config/database');
const { getWebSocketConnection } = require('../middleware/auth');
const { logUserAction } = require('../utils/security');

/**
 * Buddy system module for YM7 Hobby
 * Handles buddy requests, management, and relationships
 */

const buddySystem = {
    /**
     * Get user's display name
     */
    async getDisplayName(userId) {
        try {
            const result = await db.query(
                'SELECT display_name FROM users WHERE id = $1',
                [userId]
            );
            return result.rows[0]?.display_name || 'Unknown User';
        } catch (error) {
            console.error('Get display name error:', error);
            return 'Unknown User';
        }
    },

    /**
     * Get user's online status
     */
    async getUserStatus(userId) {
        try {
            const result = await db.query(
                'SELECT status FROM users WHERE id = $1',
                [userId]
            );
            return result.rows[0]?.status || 'offline';
        } catch (error) {
            console.error('Get user status error:', error);
            return 'offline';
        }
    },

    /**
     * Notify user about new buddy
     */
    async notifyBuddyAdded(userId, buddyId) {
        try {
            const ws = getWebSocketConnection(userId);
            if (ws && ws.readyState === 1) {
                const buddyName = await this.getDisplayName(buddyId);
                const buddyStatus = await this.getUserStatus(buddyId);
                
                ws.send(JSON.stringify({
                    type: 'buddy_added',
                    buddyId: buddyId,
                    displayName: buddyName,
                    status: buddyStatus,
                    timestamp: new Date().toISOString()
                }));
            }
        } catch (error) {
            console.error('Buddy notification error:', error);
        }
    },

    /**
     * Send buddy request
     */
    async sendRequest(fromUserId, toUserEmail, ipAddress = null) {
        try {
            // Input validation
            if (!toUserEmail || !toUserEmail.includes('@')) {
                return { 
                    error: 'Invalid email address',
                    code: 'INVALID_EMAIL'
                };
            }

            // Find target user
            const targetUser = await db.query(
                `SELECT id, display_name FROM users 
                 WHERE email = $1 AND email_verified = TRUE`,
                [toUserEmail]
            );

            if (targetUser.rows.length === 0) {
                return { 
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                };
            }

            const toUserId = targetUser.rows[0].id;

            // Cannot add yourself
            if (fromUserId === toUserId) {
                return { 
                    error: 'Cannot add yourself as a buddy',
                    code: 'SELF_ADD_NOT_ALLOWED'
                };
            }

            // Check if already buddies
            const existing = await db.query(
                `SELECT 1 FROM buddies 
                 WHERE user_id = $1 AND buddy_user_id = $2`,
                [fromUserId, toUserId]
            );

            if (existing.rows.length > 0) {
                return { 
                    error: 'Already buddies',
                    code: 'ALREADY_BUDDIES'
                };
            }

            // Check if request already exists
            const existingRequest = await db.query(
                `SELECT id, status FROM buddy_requests 
                 WHERE from_user_id = $1 AND to_user_id = $2 
                 AND status = 'pending'`,
                [fromUserId, toUserId]
            );

            if (existingRequest.rows.length > 0) {
                return { 
                    error: 'Request already pending',
                    code: 'REQUEST_PENDING'
                };
            }

            // Check if blocked
            const isBlocked = await db.query(
                `SELECT 1 FROM blocks 
                 WHERE blocker_id = $1 AND blocked_id = $2`,
                [toUserId, fromUserId]
            );

            if (isBlocked.rows.length > 0) {
                return { 
                    error: 'Cannot send request to this user',
                    code: 'USER_BLOCKED'
                };
            }

            // Create request
            const request = await db.query(
                `INSERT INTO buddy_requests (from_user_id, to_user_id) 
                 VALUES ($1, $2) RETURNING id`,
                [fromUserId, toUserId]
            );

            // Log the action
            await logUserAction(fromUserId, 'buddy_request_sent', ipAddress, null, {
                to_user_id: toUserId,
                to_email: toUserEmail
            });

            // Notify target user via WebSocket
            const targetWs = getWebSocketConnection(toUserId);
            if (targetWs) {
                const fromDisplayName = await this.getDisplayName(fromUserId);
                targetWs.send(JSON.stringify({
                    type: 'buddy_request',
                    requestId: request.rows[0].id,
                    fromUserId: fromUserId,
                    fromDisplayName: fromDisplayName,
                    timestamp: new Date().toISOString()
                }));
            }

            return { 
                success: true, 
                message: 'Buddy request sent',
                requestId: request.rows[0].id
            };

        } catch (error) {
            console.error('Send buddy request error:', error);
            return { 
                error: 'Failed to send buddy request',
                code: 'REQUEST_SEND_FAILED'
            };
        }
    },

    /**
     * Accept buddy request
     */
    async acceptRequest(requestId, userId, ipAddress = null) {
        try {
            const request = await db.query(
                `SELECT * FROM buddy_requests 
                 WHERE id = $1 AND to_user_id = $2 AND status = 'pending'`,
                [requestId, userId]
            );

            if (request.rows.length === 0) {
                return { 
                    error: 'Request not found or already processed',
                    code: 'REQUEST_NOT_FOUND'
                };
            }

            const fromUserId = request.rows[0].from_user_id;

            // Create buddy relationship (both ways)
            await db.query(
                `INSERT INTO buddies (user_id, buddy_user_id) 
                 VALUES ($1, $2), ($2, $1)`,
                [fromUserId, userId]
            );

            // Update request status
            await db.query(
                `UPDATE buddy_requests 
                 SET status = 'accepted', updated_at = NOW() 
                 WHERE id = $1`,
                [requestId]
            );

            // Log the action
            await logUserAction(userId, 'buddy_request_accepted', ipAddress, null, {
                from_user_id: fromUserId,
                request_id: requestId
            });

            // Notify both users
            await this.notifyBuddyAdded(fromUserId, userId);
            await this.notifyBuddyAdded(userId, fromUserId);

            return { 
                success: true, 
                message: 'Buddy added successfully' 
            };

        } catch (error) {
            console.error('Accept buddy request error:', error);
            return { 
                error: 'Failed to accept buddy request',
                code: 'REQUEST_ACCEPT_FAILED'
            };
        }
    },

    /**
     * Reject buddy request
     */
    async rejectRequest(requestId, userId, ipAddress = null) {
        try {
            const result = await db.query(
                `UPDATE buddy_requests 
                 SET status = 'rejected', updated_at = NOW() 
                 WHERE id = $1 AND to_user_id = $2`,
                [requestId, userId]
            );

            if (result.rowCount === 0) {
                return { 
                    error: 'Request not found',
                    code: 'REQUEST_NOT_FOUND'
                };
            }

            await logUserAction(userId, 'buddy_request_rejected', ipAddress, null, {
                request_id: requestId
            });

            return { 
                success: true, 
                message: 'Request rejected' 
            };

        } catch (error) {
            console.error('Reject buddy request error:', error);
            return { 
                error: 'Failed to reject buddy request',
                code: 'REQUEST_REJECT_FAILED'
            };
        }
    },

    /**
     * Get pending buddy requests
     */
    async getPendingRequests(userId) {
        try {
            const requests = await db.query(
                `SELECT br.id, br.from_user_id, u.display_name, u.email, br.created_at
                 FROM buddy_requests br
                 JOIN users u ON br.from_user_id = u.id
                 WHERE br.to_user_id = $1 AND br.status = 'pending'
                 ORDER BY br.created_at DESC`,
                [userId]
            );

            return { 
                success: true, 
                requests: requests.rows 
            };

        } catch (error) {
            console.error('Get pending requests error:', error);
            return { 
                error: 'Failed to get pending requests',
                code: 'REQUESTS_FETCH_FAILED'
            };
        }
    },

    /**
     * Get user's buddies
     */
    async getBuddies(userId) {
        try {
            const buddies = await db.query(
                `SELECT u.id, u.email, u.display_name, u.status, u.avatar_url, b.nickname, b.group_name
                 FROM buddies b
                 JOIN users u ON b.buddy_user_id = u.id
                 WHERE b.user_id = $1
                 ORDER BY u.status DESC, u.display_name ASC`,
                [userId]
            );

            return { 
                success: true, 
                buddies: buddies.rows 
            };

        } catch (error) {
            console.error('Get buddies error:', error);
            return { 
                error: 'Failed to get buddies',
                code: 'BUDDIES_FETCH_FAILED'
            };
        }
    },

    /**
     * Remove buddy
     */
    async removeBuddy(userId, buddyId, ipAddress = null) {
        try {
            // Remove both directions of buddy relationship
            await db.query(
                `DELETE FROM buddies 
                 WHERE (user_id = $1 AND buddy_user_id = $2)
                 OR (user_id = $2 AND buddy_user_id = $1)`,
                [userId, buddyId]
            );

            await logUserAction(userId, 'buddy_removed', ipAddress, null, {
                buddy_id: buddyId
            });

            // Notify the other user if online
            const buddyWs = getWebSocketConnection(buddyId);
            if (buddyWs) {
                buddyWs.send(JSON.stringify({
                    type: 'buddy_removed',
                    buddyId: userId
                }));
            }

            return { 
                success: true, 
                message: 'Buddy removed' 
            };

        } catch (error) {
            console.error('Remove buddy error:', error);
            return { 
                error: 'Failed to remove buddy',
                code: 'BUDDY_REMOVE_FAILED'
            };
        }
    },

    /**
     * Update buddy nickname or group
     */
    async updateBuddy(userId, buddyId, updates) {
        try {
            const allowedFields = ['nickname', 'group_name'];
            const updateFields = [];
            const updateValues = [];
            let paramCount = 1;

            Object.keys(updates).forEach(field => {
                if (allowedFields.includes(field)) {
                    updateFields.push(`${field} = $${paramCount}`);
                    updateValues.push(updates[field]);
                    paramCount++;
                }
            });

            if (updateFields.length === 0) {
                return { 
                    error: 'No valid fields to update',
                    code: 'NO_VALID_FIELDS'
                };
            }

            updateValues.push(userId, buddyId);

            const result = await db.query(
                `UPDATE buddies 
                 SET ${updateFields.join(', ')} 
                 WHERE user_id = $${paramCount} AND buddy_user_id = $${paramCount + 1}`,
                updateValues
            );

            if (result.rowCount === 0) {
                return { 
                    error: 'Buddy relationship not found',
                    code: 'BUDDY_NOT_FOUND'
                };
            }

            await logUserAction(userId, 'buddy_updated', null, null, {
                buddy_id: buddyId,
                updates: updates
            });

            return { 
                success: true, 
                message: 'Buddy updated successfully' 
            };

        } catch (error) {
            console.error('Update buddy error:', error);
            return { 
                error: 'Failed to update buddy',
                code: 'BUDDY_UPDATE_FAILED'
            };
        }
    }
};

module.exports = buddySystem;
