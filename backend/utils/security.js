const crypto = require('crypto');
const db = require('../config/database');

/**
 * Security utilities for YM7 Hobby
 * Common security functions used across the application
 */

/**
 * Log user actions for audit trail
 */
const logUserAction = async (userId, action, ipAddress = null, userAgent = null, details = null) => {
    try {
        await db.query(
            `INSERT INTO audit_log (user_id, action, ip_address, user_agent, details) 
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, action, ipAddress, userAgent, details ? JSON.stringify(details) : null]
        );
    } catch (error) {
        console.error('Error logging user action:', error);
    }
};

/**
 * Generate cryptographically secure random string
 */
const generateSecureToken = (length = 32) => {
    return crypto.randomBytes(length).toString('hex');
};

/**
 * Hash data using SHA-256
 */
const hashData = (data) => {
    return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Validate email format
 */
const isValidEmail = (email) => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
};

/**
 * Validate password strength
 */
const isStrongPassword = (password) => {
    if (password.length < 8) return false;
    if (!/(?=.*[a-z])/.test(password)) return false; // lowercase
    if (!/(?=.*[A-Z])/.test(password)) return false; // uppercase
    if (!/(?=.*\d)/.test(password)) return false;    // number
    return true;
};

/**
 * Sanitize user input to prevent XSS
 */
const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;')
        .trim();
};

/**
 * Validate display name
 */
const isValidDisplayName = (displayName) => {
    if (typeof displayName !== 'string') return false;
    if (displayName.length < 2 || displayName.length > 50) return false;
    
    const validRegex = /^[a-zA-Z0-9 _-]+$/;
    return validRegex.test(displayName);
};

/**
 * Check if IP address is allowed (basic IP filtering)
 */
const isAllowedIP = (ip, allowedIPs = []) => {
    if (allowedIPs.length === 0) return true;
    return allowedIPs.includes(ip);
};

/**
 * Generate CSRF token
 */
const generateCSRFToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

/**
 * Verify CSRF token
 */
const verifyCSRFToken = (token, storedToken) => {
    if (!token || !storedToken) return false;
    return crypto.timingSafeEqual(
        Buffer.from(token, 'hex'),
        Buffer.from(storedToken, 'hex')
    );
};

/**
 * Calculate password strength score
 */
const calculatePasswordStrength = (password) => {
    let score = 0;
    
    // Length
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    
    // Character variety
    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^a-zA-Z0-9]/.test(password)) score += 1;
    
    return Math.min(score, 5); // Max score 5
};

/**
 * Get password strength label
 */
const getPasswordStrengthLabel = (password) => {
    const score = calculatePasswordStrength(password);
    
    const labels = {
        0: 'Very Weak',
        1: 'Weak',
        2: 'Fair',
        3: 'Good',
        4: 'Strong',
        5: 'Very Strong'
    };
    
    return labels[score] || 'Very Weak';
};

/**
 * Rate limit helper
 */
const createRateLimiter = (windowMs, maxRequests) => {
    const requests = new Map();
    
    return (identifier) => {
        const now = Date.now();
        const windowStart = now - windowMs;
        
        let userRequests = requests.get(identifier) || [];
        
        // Remove old requests
        userRequests = userRequests.filter(time => time > windowStart);
        
        // Check if under limit
        if (userRequests.length >= maxRequests) {
            return false;
        }
        
        // Add current request
        userRequests.push(now);
        requests.set(identifier, userRequests);
        
        return true;
    };
};

/**
 * Clean up expired data from database
 */
const cleanupExpiredData = async () => {
    try {
        // This would call the database cleanup function
        await db.query('SELECT cleanup_expired_data()');
        console.log('✅ Expired data cleanup completed');
    } catch (error) {
        console.error('Error cleaning up expired data:', error);
    }
};

module.exports = {
    logUserAction,
    generateSecureToken,
    hashData,
    isValidEmail,
    isStrongPassword,
    sanitizeInput,
    isValidDisplayName,
    isAllowedIP,
    generateCSRFToken,
    verifyCSRFToken,
    calculatePasswordStrength,
    getPasswordStrengthLabel,
    createRateLimiter,
    cleanupExpiredData
};
