/**
 * Production configuration for YM7 Hobby
 * These settings optimize performance and security for production
 */

module.exports = {
    // Database configuration
    database: {
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    },
    
    // Rate limiting configuration
    rateLimiting: {
        // Authentication endpoints
        auth: {
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 5, // Limit each IP to 5 requests per windowMs
        },
        // General API endpoints
        api: {
            windowMs: 1 * 60 * 1000, // 1 minute
            max: 100, // Limit each IP to 100 requests per minute
        },
        // WebSocket messages
        websocket: {
            message: {
                windowMs: 60000, // 1 minute
                max: 60, // 60 messages per minute per connection
            }
        }
    },
    
    // Security configuration
    security: {
        // JWT settings
        jwt: {
            accessExpiry: '15m', // Short-lived access tokens
            refreshExpiry: '7d', // Longer-lived refresh tokens
        },
        // Password hashing
        bcryptRounds: 12,
        // Password policy
        password: {
            minLength: 8,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSymbols: false, // Optional for better UX
        }
    },
    
    // WebSocket configuration
    websocket: {
        maxPayload: 1024 * 10, // 10KB max message size
        pingInterval: 30000, // 30 seconds
        pongTimeout: 10000, // 10 seconds
        maxConnectionsPerUser: 3, // Limit concurrent connections per user
    },
    
    // CORS configuration
    cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost'],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
    
    // Logging configuration
    logging: {
        level: 'info', // 'error', 'warn', 'info', 'debug'
        format: 'combined', // 'combined', 'common', 'tiny', 'dev'
        file: {
            enabled: true,
            path: '/var/log/ym7-hobby/application.log',
            maxSize: '10m',
            maxFiles: 5,
        }
    },
    
    // Performance tuning
    performance: {
        compression: {
            enabled: true,
            threshold: 1024, // Compress responses larger than 1KB
        },
        helmet: {
            enabled: true,
            // Security headers configuration
        }
    }
};
