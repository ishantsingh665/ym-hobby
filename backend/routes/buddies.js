const express = require('express');
const router = express.Router();
const buddies = require('../modules/buddies');
const { authenticateToken } = require('../middleware/auth');
const { 
    buddyValidation, 
    idValidation, 
    searchValidation,
    handleValidationErrors,
    sanitizeInput 
} = require('../middleware/validation');

/**
 * Buddy system routes for YM7 Hobby
 */

// Send buddy request
router.post('/request',
    authenticateToken,
    sanitizeInput,
    buddyValidation,
    handleValidationErrors,
    async (req, res) => {
        try {
            const { email } = req.body;
            const ipAddress = req.ip;

            const result = await buddies.sendRequest(req.user.id, email, ipAddress);

            if (result.error) {
                return res.status(400).json(result);
            }

            res.json(result);

        } catch (error) {
            console.error('Send buddy request route error:', error);
            res.status(500).json({
                error: 'Failed to send buddy request',
                code: 'REQUEST_SEND_FAILED'
            });
        }
    }
);

// Accept buddy request
router.post('/request/:requestId/accept',
    authenticateToken,
    async (req, res) => {
        try {
            const { requestId } = req.params;
            const ipAddress = req.ip;

            const result = await buddies.acceptRequest(requestId, req.user.id, ipAddress);

            if (result.error) {
                return res.status(400).json(result);
            }

            res.json(result);

        } catch (error) {
            console.error('Accept buddy request route error:', error);
            res.status(500).json({
                error: 'Failed to accept buddy request',
                code: 'REQUEST_ACCEPT_FAILED'
            });
        }
    }
);

// Reject buddy request
router.post('/request/:requestId/reject',
    authenticateToken,
    async (req, res) => {
        try {
            const { requestId } = req.params;
            const ipAddress = req.ip;

            const result = await buddies.rejectRequest(requestId, req.user.id, ipAddress);

            if (result.error) {
                return res.status(400).json(result);
            }

            res.json(result);

        } catch (error) {
            console.error('Reject buddy request route error:', error);
            res.status(500).json({
                error: 'Failed to reject buddy request',
                code: 'REQUEST_REJECT_FAILED'
            });
        }
    }
);

// Get pending buddy requests
router.get('/requests/pending',
    authenticateToken,
    async (req, res) => {
        try {
            const result = await buddies.getPendingRequests(req.user.id);

            if (result.error) {
                return res.status(400).json(result);
            }

            res.json(result);

        } catch (error) {
            console.error('Get pending requests route error:', error);
            res.status(500).json({
                error: 'Failed to get pending requests',
                code: 'REQUESTS_FETCH_FAILED'
            });
        }
    }
);

// Get user's buddies
router.get('/',
    authenticateToken,
    async (req, res) => {
        try {
            const result = await buddies.getBuddies(req.user.id);

            if (result.error) {
                return res.status(400).json(result);
            }

            res.json(result);

        } catch (error) {
            console.error('Get buddies route error:', error);
            res.status(500).json({
                error: 'Failed to get buddies',
                code: 'BUDDIES_FETCH_FAILED'
            });
        }
    }
);

// Remove buddy
router.delete('/:buddyId',
    authenticateToken,
    async (req, res) => {
        try {
            const { buddyId } = req.params;
            const ipAddress = req.ip;

            const result = await buddies.removeBuddy(req.user.id, buddyId, ipAddress);

            if (result.error) {
                return res.status(400).json(result);
            }

            res.json(result);

        } catch (error) {
            console.error('Remove buddy route error:', error);
            res.status(500).json({
                error: 'Failed to remove buddy',
                code: 'BUDDY_REMOVE_FAILED'
            });
        }
    }
);

// Update buddy (nickname or group)
router.put('/:buddyId',
    authenticateToken,
    sanitizeInput,
    async (req, res) => {
        try {
            const { buddyId } = req.params;
            const updates = req.body;

            const result = await buddies.updateBuddy(req.user.id, buddyId, updates);

            if (result.error) {
                return res.status(400).json(result);
            }

            res.json(result);

        } catch (error) {
            console.error('Update buddy route error:', error);
            res.status(500).json({
                error: 'Failed to update buddy',
                code: 'BUDDY_UPDATE_FAILED'
            });
        }
    }
);

// Search users for adding as buddies
router.get('/search',
    authenticateToken,
    searchValidation,
    handleValidationErrors,
    async (req, res) => {
        try {
            const { query } = req.query;

            // Search users by email or display name (excluding current user and existing buddies)
            const searchResult = await db.query(
                `SELECT id, email, display_name, status, avatar_url
                 FROM users
                 WHERE (email ILIKE $1 OR display_name ILIKE $1)
                 AND id != $2
                 AND email_verified = TRUE
                 AND id NOT IN (
                     SELECT buddy_user_id FROM buddies WHERE user_id = $2
                 )
                 AND id NOT IN (
                     SELECT blocked_id FROM blocks WHERE blocker_id = $2
                 )
                 LIMIT 20`,
                [`%${query}%`, req.user.id]
            );

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

module.exports = router;
