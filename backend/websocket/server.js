const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const security = require('./security');
const messageHandler = require('./messageHandler');
const { 
    registerWebSocketConnection, 
    disconnectUserWebSocket,
    getConnectionCount 
} = require('../middleware/auth');

/**
 * WebSocket server for YM7 Hobby
 * Handles real-time communication for instant messaging and live updates
 */

class SecureWebSocketServer {
    constructor(server) {
        this.wss = new WebSocket.Server({
            server,
            maxPayload: 1024 * 10, // 10KB max message size
            verifyClient: this.verifyClient.bind(this)
        });

        this.connections = new Map();
        this.setupEvents();
        
        console.log('✅ WebSocket server initialized');
    }

    /**
     * Verify client connection (origin and protocol)
     */
    verifyClient(info, callback) {
        const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost'];
        const origin = info.origin || info.req.headers.origin;

        if (!allowedOrigins.includes(origin)) {
            console.warn(`WebSocket connection rejected from origin: ${origin}`);
            return callback(false, 403, 'Forbidden');
        }

        callback(true);
    }

    /**
     * Setup WebSocket event handlers
     */
    setupEvents() {
        this.wss.on('connection', (ws, req) => {
            const ip = req.socket.remoteAddress;
            
            console.log(`🔗 New WebSocket connection from ${ip}`);

            // Rate limit connections per IP
            if (!security.checkConnectionLimit(ip)) {
                ws.close(1008, 'Too many connections');
                return;
            }

            ws.ip = ip;
            ws.isAuthenticated = false;
            ws.userId = null;
            ws.isAlive = true;

            this.setupMessageHandler(ws);
            this.setupHeartbeat(ws);
            this.setupCloseHandler(ws);
        });

        // Broadcast server statistics periodically
        setInterval(() => {
            this.broadcastServerStats();
        }, 30000); // Every 30 seconds
    }

    /**
     * Setup message handler for WebSocket connection
     */
    setupMessageHandler(ws) {
        ws.on('message', async (data) => {
            try {
                // Validate message size
                if (!security.validateMessageSize(data)) {
                    ws.close(1009, 'Message too large');
                    return;
                }

                const message = JSON.parse(data.toString());

                // Validate message structure
                if (!security.validateMessageStructure(message)) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Invalid message format'
                    }));
                    return;
                }

                // Rate limit messages
                if (!security.checkMessageRateLimit(ws.ip, message.type)) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Rate limit exceeded'
                    }));
                    return;
                }

                // Handle different message types
                await this.handleMessage(ws, message);

            } catch (error) {
                console.error('WebSocket message handling error:', error);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Invalid message'
                }));
            }
        });
    }

    /**
     * Handle different WebSocket message types
     */
    async handleMessage(ws, message) {
        switch (message.type) {
            case 'authenticate':
                await this.handleAuthentication(ws, message.token);
                break;

            case 'private_message':
                if (ws.isAuthenticated) {
                    await messageHandler.handlePrivateMessage(ws, message);
                }
                break;

            case 'typing_start':
            case 'typing_stop':
                if (ws.isAuthenticated) {
                    await messageHandler.handleTypingIndicator(ws, message);
                }
                break;

            case 'ping':
                ws.send(JSON.stringify({ type: 'pong' }));
                break;

            default:
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Unknown message type'
                }));
        }
    }

    /**
     * Handle WebSocket authentication
     */
    async handleAuthentication(ws, token) {
        try {
            if (!token) {
                throw new Error('Authentication token required');
            }

            // Verify JWT token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            if (decoded.type !== 'access') {
                throw new Error('Invalid token type');
            }

            // Check connection limits per user
            if (!security.checkUserConnectionLimit(decoded.id)) {
                ws.close(1008, 'Too many connections for this user');
                return;
            }

            // Authenticate successfully
            ws.isAuthenticated = true;
            ws.userId = decoded.id;

            // Register connection
            registerWebSocketConnection(decoded.id, ws);
            this.connections.set(decoded.id, ws);

            // Update user status to online
            await db.query(
                'UPDATE users SET status = $1 WHERE id = $2',
                ['online', decoded.id]
            );

            // Send authentication success
            ws.send(JSON.stringify({
                type: 'auth_success',
                user: {
                    id: decoded.id,
                    email: decoded.email
                }
            }));

            console.log(`✅ WebSocket authenticated for user ${decoded.id}`);

            // Notify buddies about online status
            await this.notifyBuddiesStatusChange(decoded.id, 'online');

        } catch (error) {
            console.error('WebSocket authentication error:', error);
            ws.send(JSON.stringify({
                type: 'auth_error',
                message: 'Authentication failed'
            }));
            ws.close(1008, 'Authentication failed');
        }
    }

    /**
     * Setup heartbeat/ping-pong for connection health
     */
    setupHeartbeat(ws) {
        const heartbeatInterval = setInterval(() => {
            if (!ws.isAlive) {
                console.log(`💔 WebSocket heartbeat failed for user ${ws.userId}`);
                ws.terminate();
                clearInterval(heartbeatInterval);
                return;
            }

            ws.isAlive = false;
            ws.ping();
        }, 30000); // 30 seconds

        ws.on('pong', () => {
            ws.isAlive = true;
        });

        ws.on('close', () => {
            clearInterval(heartbeatInterval);
        });
    }

    /**
     * Setup connection close handler
     */
    setupCloseHandler(ws) {
        ws.on('close', async (code, reason) => {
            console.log(`🔌 WebSocket connection closed for user ${ws.userId}, code: ${code}, reason: ${reason}`);

            if (ws.userId) {
                // Remove from connections
                this.connections.delete(ws.userId);
                disconnectUserWebSocket(ws.userId);

                // Update user status to offline
                try {
                    await db.query(
                        'UPDATE users SET status = $1 WHERE id = $2',
                        ['offline', ws.userId]
                    );

                    // Notify buddies about offline status
                    await this.notifyBuddiesStatusChange(ws.userId, 'offline');

                } catch (error) {
                    console.error('Error updating user status on disconnect:', error);
                }
            }
        });
    }

    /**
     * Notify buddies about user status change
     */
    async notifyBuddiesStatusChange(userId, status) {
        try {
            const buddies = await db.query(
                `SELECT buddy_user_id FROM buddies WHERE user_id = $1`,
                [userId]
            );

            for (const buddy of buddies.rows) {
                const buddyWs = this.connections.get(buddy.buddy_user_id);
                if (buddyWs && buddyWs.readyState === 1) {
                    buddyWs.send(JSON.stringify({
                        type: 'buddy_status_change',
                        userId: userId,
                        status: status,
                        timestamp: new Date().toISOString()
                    }));
                }
            }
        } catch (error) {
            console.error('Error notifying buddies about status change:', error);
        }
    }

    /**
     * Broadcast server statistics to authenticated clients
     */
    broadcastServerStats() {
        const stats = {
            type: 'server_stats',
            connections: getConnectionCount(),
            timestamp: new Date().toISOString()
        };

        this.connections.forEach((ws, userId) => {
            if (ws.readyState === 1 && ws.isAuthenticated) {
                ws.send(JSON.stringify(stats));
            }
        });
    }

    /**
     * Send message to specific user
     */
    sendToUser(userId, message) {
        const ws = this.connections.get(userId);
        if (ws && ws.readyState === 1 && ws.isAuthenticated) {
            ws.send(JSON.stringify(message));
            return true;
        }
        return false;
    }

    /**
     * Broadcast message to all connected users
     */
    broadcast(message) {
        this.connections.forEach((ws, userId) => {
            if (ws.readyState === 1 && ws.isAuthenticated) {
                ws.send(JSON.stringify(message));
            }
        });
    }

    /**
     * Get connection count
     */
    getConnectionCount() {
        return this.connections.size;
    }

    /**
     * Get all connected user IDs
     */
    getConnectedUsers() {
        return Array.from(this.connections.keys());
    }

    /**
     * Close all connections gracefully
     */
    async close() {
        console.log('🔄 Closing WebSocket server...');
        
        // Notify all clients
        this.broadcast({
            type: 'server_shutdown',
            message: 'Server is shutting down',
            timestamp: new Date().toISOString()
        });

        // Close all connections
        this.connections.forEach((ws, userId) => {
            ws.close(1000, 'Server shutdown');
        });

        this.connections.clear();
    }
}

module.exports = SecureWebSocketServer;
