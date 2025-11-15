const { body, validationResult, param, query } = require('express-validator');

/**
 * Input validation middleware for YM7 Hobby
 * Uses express-validator for comprehensive input sanitization
 */

// Common validation patterns
const patterns = {
    email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, // At least one lowercase, one uppercase, one number
    displayName: /^[a-zA-Z0-9 _-]{2,50}$/,
    hexToken: /^[a-f0-9]{64}$/
};

// User registration validation
const registrationValidation = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .isLength({ min: 5, max: 255 })
        .withMessage('Email must be between 5 and 255 characters'),
    
    body('password')
        .isLength({ min: 8, max: 100 })
        .withMessage('Password must be between 8 and 100 characters')
        .matches(patterns.password)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    
    body('displayName')
        .isLength({ min: 2, max: 50 })
        .withMessage('Display name must be between 2 and 50 characters')
        .trim()
        .escape()
        .matches(patterns.displayName)
        .withMessage('Display name can only contain letters, numbers, spaces, hyphens, and underscores')
];

// User login validation
const loginValidation = [
    body('email')
        .isEmail()
        .normalizeEmail(),
    
    body('password')
        .isLength({ min: 1 })
        .withMessage('Password is required')
];

// Message validation
const messageValidation = [
    body('message')
        .isLength({ min: 1, max: 1000 })
        .withMessage('Message must be between 1 and 1000 characters')
        .trim()
        .escape()
];

// Buddy request validation
const buddyValidation = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .isLength({ min: 5, max: 255 })
];

// Password reset request validation
const passwordResetValidation = [
    body('email')
        .isEmail()
        .normalizeEmail()
];

// Password change validation
const passwordChangeValidation = [
    body('token')
        .isLength({ min: 64, max: 64 })
        .withMessage('Token must be 64 characters')
        .matches(patterns.hexToken)
        .withMessage('Token must be a valid hex string'),
    
    body('newPassword')
        .isLength({ min: 8, max: 100 })
        .withMessage('Password must be between 8 and 100 characters')
        .matches(patterns.password)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
];

// ID parameter validation
const idValidation = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('ID must be a positive integer')
];

// Pagination validation
const paginationValidation = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
];

// Search validation
const searchValidation = [
    query('query')
        .isLength({ min: 3, max: 100 })
        .withMessage('Search query must be between 3 and 100 characters')
        .trim()
        .escape()
];

// Centralized error handling for validation
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(error => ({
            field: error.path,
            message: error.msg,
            value: error.value
        }));

        return res.status(400).json({
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: errorMessages
        });
    }
    
    next();
};

// Sanitize input data
const sanitizeInput = (req, res, next) => {
    // Sanitize request body
    if (req.body) {
        Object.keys(req.body).forEach(key => {
            if (typeof req.body[key] === 'string') {
                req.body[key] = req.body[key].trim();
            }
        });
    }
    
    // Sanitize query parameters
    if (req.query) {
        Object.keys(req.query).forEach(key => {
            if (typeof req.query[key] === 'string') {
                req.query[key] = req.query[key].trim();
            }
        });
    }
    
    next();
};

module.exports = {
    registrationValidation,
    loginValidation,
    messageValidation,
    buddyValidation,
    passwordResetValidation,
    passwordChangeValidation,
    idValidation,
    paginationValidation,
    searchValidation,
    handleValidationErrors,
    sanitizeInput,
    patterns
};
