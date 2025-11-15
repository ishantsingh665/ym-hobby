/**
 * WebSocket security module for YM7 Hobby
 * Handles rate limiting, message validation, and connection security
 */

class WebSocketSecurity {
    constructor() {
        this.MAX_MESSAGE_SIZE = 1024 * 10; // 10KB
        this.MAX_CONNECTIONS_PER_IP = 10;
        this.MAX_CONNECTIONS_PER_USER = 3;
        
        // Rate limiting storage
        this.connectionAttempts = new Map();
        this.messageRates = new Map();
        this.userConnections = new Map();

        // Clean up old rate limit data periodically
        setInterval(() => {
            this.cleanupRateLimits();
        }, 60 * 60 * 1000); // Clean every hour
    }

    /**
     * Validate message size
     */
    validateMessageSize(data) {
        return Buffer.byteLength(data) <= this.MAX_MESSAGE_SIZE;
    }

    /**
     * Validate message structure
     */
    validateMessageStructure(message) {
        if (typeof message !== 'object' || message === null) {
            return false;
        }

        if (!message.type || typeof message.type !== 'string') {
            return false;
        }

        // Validate based on message type
        switch (message.type) {
            case 'authenticate':
                return typeof message.token === 'string';
            
            case 'private_message':
                return typeof message.toUserId === 'number' && 
                       typeof message.message === 'string' &&
                       message.message.length <= 1000;
            
            case 'typing_start':
            case 'typing_stop':
                return typeof message.toUserId === 'number';
            
            case 'ping':
                return true;
            
            default:
                return false;
        }
    }

    /**
     * Check connection rate limit per IP
     */
    checkConnectionLimit(ip) {
        const now = Date.now();
        const windowStart = now - (60 * 1000); // 1 minute window
        
        let attempts = this.connectionAttempts.get(ip) || [];
        
        // Remove old attempts
        attempts = attempts.filter(time => time > windowStart);
        
        // Check if under limit
        if (attempts.length >= this.MAX_CONNECTIONS_PER_IP) {
            return false;
        }
        
        // Add current attempt
        attempts.push(now);
        this.connectionAttempts.set(ip, attempts);
        
        return true;
    }

    /**
     * Check connection limit per user
     */
    checkUserConnectionLimit(userId) {
        const currentConnections = this.userConnections.get(userId) || 0;
        
        if (currentConnections >= this.MAX_CONNECTIONS_PER_USER) {
            return false;
        }
        
        this.userConnections.set(userId, currentConnections + 1);
        return true;
    }

    /**
     * Remove user connection count
     */
    removeUserConnection(userId) {
        const currentConnections = this.userConnections.get(userId) || 1;
        this.userConnections.set(userId, Math.max(0, currentConnections - 1));
    }

    /**
     * Check message rate limit
     */
    checkMessageRateLimit(ip, messageType) {
        const now = Date.now();
        const key = `${ip}:${messageType}`;
        const windowMs = this.getMessageRateWindow(messageType);
        const maxMessages = this.getMessageRateLimit(messageType);
        
        let messages = this.messageRates.get(key) || [];
        
        // Remove old messages
        messages = messages.filter(time => time > now - windowMs);
        
        // Check if under limit
        if (messages.length >= maxMessages) {
            return false;
        }
        
        // Add current message
        messages.push(now);
        this.messageRates.set(key, messages);
        
        return true;
    }

    /**
     * Get rate limit window for message type
     */
    getMessageRateWindow(messageType) {
        const windows = {
            'private_message': 60000, // 1 minute
            'typing_start': 10000,    // 10 seconds
            'typing_stop': 10000,     // 10 seconds
            'authenticate': 30000     // 30 seconds
        };
        
        return windows[messageType] || 60000; // Default 1 minute
    }

    /**
     * Get rate limit for message type
     */
    getMessageRateLimit(messageType) {
        const limits = {
            'private_message': 60,    // 60 messages per minute
            'typing_start': 10,       // 10 typing indicators per 10 seconds
            'typing_stop': 10,        // 10 typing indicators per 10 seconds
            'authenticate': 5         // 5 authentication attempts per 30 seconds
        };
        
        return limits[messageType] || 60; // Default 60 per minute
    }

    /**
     * Validate message content for XSS and injection
     */
    validateMessageContent(content) {
        if (typeof content !== 'string') {
            return false;
        }

        // Check for dangerous patterns
        const dangerousPatterns = [
            /<script/i,
            /javascript:/i,
            /on\w+=/i,
            /data:text\/html/i,
            /vbscript:/i,
            /expression\(/i,
            /url\(javascript:/i
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(content)) {
                return false;
            }
        }

        // Check for excessive special characters (potential injection)
        const specialCharRatio = (content.match(/[<>'"`{}[\]();]/g) || []).length / content.length;
        if (specialCharRatio > 0.3) { // More than 30% special characters
            return false;
        }

        return true;
    }

    /**
     * Sanitize message content
     */
    sanitizeMessageContent(content) {
        if (typeof content !== 'string') {
            return '';
        }

        // Basic HTML escaping
        return content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;')
            .trim();
    }

    /**
     * Clean up old rate limit data
     */
    cleanupRateLimits() {
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);

        // Clean connection attempts
        for (const [ip, attempts] of this.connectionAttempts.entries()) {
            const recentAttempts = attempts.filter(time => time > oneHourAgo);
            if (recentAttempts.length === 0) {
                this.connectionAttempts.delete(ip);
            } else {
                this.connectionAttempts.set(ip, recentAttempts);
            }
        }

        // Clean message rates
        for (const [key, messages] of this.messageRates.entries()) {
            const recentMessages = messages.filter(time => time > oneHourAgo);
            if (recentMessages.length === 0) {
                this.messageRates.delete(key);
            } else {
                this.messageRates.set(key, recentMessages);
            }
        }

        // Clean user connections (remove zero counts)
        for (const [userId, count] of this.userConnections.entries()) {
            if (count === 0) {
                this.userConnections.delete(userId);
            }
        }
    }

    /**
     * Get security statistics
     */
    getStats() {
        return {
            connectionAttempts: this.connectionAttempts.size,
            messageRates: this.messageRates.size,
            userConnections: this.userConnections.size,
            maxMessageSize: this.MAX_MESSAGE_SIZE,
            maxConnectionsPerIp: this.MAX_CONNECTIONS_PER_IP,
            maxConnectionsPerUser: this.MAX_CONNECTIONS_PER_USER
        };
    }
}

module.exports = new WebSocketSecurity();
