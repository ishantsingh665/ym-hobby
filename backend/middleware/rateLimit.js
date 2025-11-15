const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

/**
 * Rate limiting middleware for YM7 Hobby
 * Protects against brute force and DDoS attacks
 */

// Authentication rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: {
        error: 'Too many authentication attempts',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful logins
});

// General API rate limiting
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // Limit each IP to 100 requests per minute
    message: {
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Please slow down your requests'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Strict rate limiting for sensitive operations
const strictLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // Limit each IP to 10 requests per minute
    message: {
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Please wait before trying again'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Password reset rate limiting
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Limit each IP to 3 password reset requests per hour
    message: {
        error: 'Too many password reset attempts',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Please try again after 1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Speed limiting (gradual slowing down)
const speedLimiter = slowDown({
    windowMs: 1 * 60 * 1000, // 1 minute
    delayAfter: 50, // Allow 50 requests at full speed
    delayMs: 100, // Add 100ms delay per request after 50
    maxDelayMs: 2000, // Maximum 2 second delay
});

// WebSocket message rate limiting storage
const wsRateLimits = new Map();

const checkWebSocketRateLimit = (ip, type, max, windowMs) => {
    const key = `${ip}:${type}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    let requests = wsRateLimits.get(key) || [];

    // Remove old requests outside the window
    requests = requests.filter(time => time > windowStart);

    // Check if under limit
    if (requests.length >= max) {
        return false;
    }

    // Add current request
    requests.push(now);
    wsRateLimits.set(key, requests);

    return true;
};

// Clean up old rate limit data
setInterval(() => {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    for (const [key, requests] of wsRateLimits.entries()) {
        const recentRequests = requests.filter(time => time > oneHourAgo);
        if (recentRequests.length === 0) {
            wsRateLimits.delete(key);
        } else {
            wsRateLimits.set(key, recentRequests);
        }
    }
}, 30 * 60 * 1000); // Clean every 30 minutes

module.exports = {
    authLimiter,
    apiLimiter,
    strictLimiter,
    passwordResetLimiter,
    speedLimiter,
    checkWebSocketRateLimit,
    wsRateLimits
};
