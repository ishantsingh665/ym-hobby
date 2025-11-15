const crypto = require('crypto');

/**
 * Startup validation for required environment variables
 * This ensures the application fails fast if configuration is missing
 */

const validateEnvironment = () => {
    const required = [
        'JWT_SECRET',
        'JWT_REFRESH_SECRET',
        'DB_PASSWORD',
        'DB_USER', 
        'DB_NAME',
        'ALLOWED_ORIGINS'
    ];

    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Validate JWT secret strength
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
        throw new Error('JWT_SECRET must be at least 32 characters long for security');
    }

    // Validate database password strength
    if (process.env.DB_PASSWORD && process.env.DB_PASSWORD.length < 16) {
        throw new Error('DB_PASSWORD must be at least 16 characters long');
    }

    // Validate allowed origins format
    if (process.env.ALLOWED_ORIGINS) {
        const origins = process.env.ALLOWED_ORIGINS.split(',');
        const invalidOrigins = origins.filter(origin => {
            try {
                new URL(origin);
                return false;
            } catch {
                return true;
            }
        });
        
        if (invalidOrigins.length > 0) {
            throw new Error(`Invalid URLs in ALLOWED_ORIGINS: ${invalidOrigins.join(', ')}`);
        }
    }

    console.log('✅ Environment validation passed');
};

const generateSecrets = () => {
    console.log('\n🔐 If you need to generate new secrets, run:');
    console.log('JWT_SECRET:', crypto.randomBytes(64).toString('base64'));
    console.log('JWT_REFRESH_SECRET:', crypto.randomBytes(64).toString('base64'));
    console.log('DB_PASSWORD:', crypto.randomBytes(32).toString('base64'));
    console.log('');
};

module.exports = { 
    validateEnvironment, 
    generateSecrets 
};
