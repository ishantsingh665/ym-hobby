const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

/**
 * YM7 Hobby – Global Rate Limiting Middleware
 * Protects authentication, API, verification, password resets and WebSocket events
 */

/* ----------------------------------------------------
   AUTHENTICATION RATE LIMITER
   (Login, register, token operations)
----------------------------------------------------- */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    skipSuccessfulRequests: true,
    message: {
        error: 'Too many authentication attempts',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
});

/* ----------------------------------------------------
   GENERAL API RATE LIMITER
----------------------------------------------------- */
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    message: {
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Please slow down your requests'
    },
    standardHeaders: true,
    legacyHeaders: false
});

/* ----------------------------------------------------
   STRICT LIMITER (Sensitive endpoints)
----------------------------------------------------- */
const strictLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: {
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Please wait before trying again'
    },
    standardHeaders: true,
    legacyHeaders: false
});

/* ----------------------------------------------------
   PASSWORD RESET LIMITER
----------------------------------------------------- */
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    message: {
        error: 'Too many password reset attempts',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Please try again after 1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false
});

/* ----------------------------------------------------
   EMAIL VERIFICATION LIMITER
   (Your missing limiter that caused crash)
----------------------------------------------------- */
const verifyLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10,
    message: {
        error: 'Too many verification attempts',
        code: 'VERIFY_RATE_LIMIT',
        message: 'Please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
});

/* ----------------------------------------------------
   SPEED LIMITER (Gradual slowdown)
----------------------------------------------------- */
const speedLimiter = slowDown({
    windowMs: 60 * 1000,
    delayAfter: 50,
    delayMs: 100,
    maxDelayMs: 2000
});

/* ----------------------------------------------------
   WEBSOCKET RATE LIMITER (Custom)
----------------------------------------------------- */
const wsRateLimits = new Map();

const checkWebSocketRateLimit = (ip, type, max, windowMs) => {
    const key = `${ip}:${type}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    let requests = wsRateLimits.get(key) || [];

    // Remove old requests
    requests = requests.filter(t => t > windowStart);

    // Check limit
    if (requests.length >= max) {
        return false;
    }

    // Add current request
    requests.push(now);
    wsRateLimits.set(key, requests);

    return true;
};

// Automatic cleanup every 30 minutes
setInterval(() => {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    for (const [key, requests] of wsRateLimits.entries()) {
        const remaining = requests.filter(t => t > oneHourAgo);
        if (remaining.length === 0) wsRateLimits.delete(key);
        else wsRateLimits.set(key, remaining);
    }
}, 30 * 60 * 1000);

/* ----------------------------------------------------
   EXPORT ALL LIMITERS
----------------------------------------------------- */
module.exports = {
    authLimiter,
    apiLimiter,
    strictLimiter,
    passwordResetLimiter,
    verifyLimiter,        // REQUIRED by verification.js
    speedLimiter,
    checkWebSocketRateLimit,
    wsRateLimits
};
