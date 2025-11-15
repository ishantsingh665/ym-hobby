const jwt = require('jsonwebtoken');
const db = require('../config/database');
const tokenBlacklist = require('../modules/tokenBlacklist');

/**
 * Authentication middleware for YM7 Hobby
 * Handles JWT verification and user context setup
 */

// WebSocket connection tracking
const wsConnections = new Map();

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ 
            error: 'Access token required',
            code: 'MISSING_TOKEN'
        });
    }

    try {
        // Check if token is blacklisted (logout)
        if (await tokenBlacklist.isTokenBlacklisted(token)) {
            return res.status(401).json({ 
                error: 'Token has been revoked',
                code: 'TOKEN_REVOKED'
            });
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Verify token type
        if (decoded.type !== 'access') {
            return res.status(403).json({ 
                error: 'Invalid token type',
                code: 'INVALID_TOKEN_TYPE'
            });
        }

        // Set user context for Row Level Security
        await db.setUserContext(decoded.id);
        req.user = decoded;
        next();

    } catch (error) {
        // Don't leak error details in production
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                error: 'Token has expired',
                code: 'TOKEN_EXPIRED'
            });
        }
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(403).json({ 
                error: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }

        console.error('Authentication error:', error);
        return res.status(500).json({ 
            error: 'Authentication failed',
            code: 'AUTH_FAILED'
        });
    }
};

const optionalAuth = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return next(); // Continue without authentication
    }

    try {
        if (!(await tokenBlacklist.isTokenBlacklisted(token))) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded.type === 'access') {
                await db.setUserContext(decoded.id);
                req.user = decoded;
            }
        }
    } catch (error) {
        // Silently fail for optional auth
        console.warn('Optional auth failed:', error.message);
    }
    
    next();
};

// Safe error handler middleware
const safeErrorHandler = (err, req, res, next) => {
    console.error('Error:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        user: req.user?.id || 'anonymous'
    });

    // Don't expose error details in production
    if (process.env.NODE_ENV === 'production') {
        return res.status(500).json({ 
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }

    // Development mode - more details
    res.status(500).json({ 
        error: 'Internal server error',
        details: err.message,
        code: 'INTERNAL_ERROR',
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
};

// WebSocket connection management
const disconnectUserWebSocket = (userId) => {
    const connection = wsConnections.get(userId);
    if (connection) {
        try {
            connection.close(1000, 'Logged out');
            console.log(`Disconnected WebSocket for user ${userId}`);
        } catch (error) {
            console.error('Error disconnecting WebSocket:', error);
        }
        wsConnections.delete(userId);
    }
};

const registerWebSocketConnection = (userId, ws) => {
    // Disconnect existing connection if any
    const existing = wsConnections.get(userId);
    if (existing) {
        try {
            existing.close(1000, 'New connection established');
        } catch (error) {
            console.error('Error closing existing WebSocket:', error);
        }
    }
    
    wsConnections.set(userId, ws);
    console.log(`Registered WebSocket for user ${userId}`);
};

const getWebSocketConnection = (userId) => {
    return wsConnections.get(userId);
};

const getConnectionCount = () => {
    return wsConnections.size;
};

const getAllConnections = () => {
    return Array.from(wsConnections.entries());
};

module.exports = {
    authenticateToken,
    optionalAuth,
    safeErrorHandler,
    disconnectUserWebSocket,
    registerWebSocketConnection,
    getWebSocketConnection,
    getConnectionCount,
    getAllConnections,
    wsConnections
};
