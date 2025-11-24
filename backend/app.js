require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');

// Import validation and configuration
const { validateEnvironment } = require('./utils/startupValidation');
const { safeErrorHandler } = require('./middleware/auth');

// Import middleware
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// Import WebSocket server
const SecureWebSocketServer = require('./websocket/server');

// Import routes
const authRoutes = require('./routes/auth');
const verificationRoutes = require('./routes/verification');
const buddyRoutes = require('./routes/buddies');
const messageRoutes = require('./routes/messages');
const userRoutes = require('./routes/users');

/**
 * YM7 Hobby - Main Application Entry Point
 * Classic Yahoo Messenger revival with modern security
 */

// Validate environment on startup
try {
    validateEnvironment();
    console.log('✅ Environment validation passed');
} catch (error) {
    console.error('❌ Startup validation failed:', error.message);
    process.exit(1);
}

// Create Express application
const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new SecureWebSocketServer(server);
console.log('✅ WebSocket server initialized');

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:8080'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parsing middleware
app.use(express.json({ 
    limit: '10kb',
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf);
        } catch (e) {
            res.status(400).json({
                error: 'Invalid JSON',
                code: 'INVALID_JSON'
            });
            throw new Error('Invalid JSON');
        }
    }
}));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Rate limiting
const generalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // Limit each IP to 100 requests per minute
    message: {
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 auth requests per windowMs
    message: {
        error: 'Too many authentication attempts',
        code: 'AUTH_RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Apply rate limiting
app.use('/api/', generalLimiter);
app.use('/api/auth/', authLimiter);

// Static file serving (for frontend)
app.use(express.static(path.join(__dirname, '../frontend'), {
    maxAge: '1d',
    etag: true,
    lastModified: true
}));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api', verificationRoutes);
app.use('/api/buddies', buddyRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
    const db = require('./config/database');
    
    try {
        const dbHealthy = await db.healthCheck();
        const wsConnections = wss.getConnectionCount();
        
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            services: {
                database: dbHealthy ? 'healthy' : 'unhealthy',
                websocket: `connected: ${wsConnections}`,
                api: 'healthy'
            },
            uptime: process.uptime(),
            memory: process.memoryUsage()
        });
    } catch (error) {
        res.status(503).json({
            status: 'error',
            error: 'Service unavailable',
            details: error.message
        });
    }
});

// API info endpoint
app.get('/api', (req, res) => {
    res.json({
        name: 'YM7 Hobby API',
        version: '1.0.0',
        description: 'Classic Yahoo Messenger revival with modern security',
        endpoints: {
            auth: '/api/auth',
            buddies: '/api/buddies',
            messages: '/api/messages',
            users: '/api/users',
            verification: '/api/verify-email'
        },
        documentation: 'https://github.com/ishantsingh665/ym-hobby'
    });
});

// Serve frontend for all other routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Safe error handler (must be last)
app.use(safeErrorHandler);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
    console.log(`\n🔄 Received ${signal}. Starting graceful shutdown...`);
    
    server.close(async (err) => {
        if (err) {
            console.error('Error during server shutdown:', err);
            process.exit(1);
        }
        
        console.log('✅ HTTP server closed');
        
        // Close WebSocket server
        await wss.close();
        console.log('✅ WebSocket server closed');
        
        // Close database connections
        const db = require('./config/database');
        await db.end();
        console.log('✅ Database connections closed');
        
        console.log('🎉 Graceful shutdown completed');
        process.exit(0);
    });
    
    // Force shutdown after 30 seconds
    setTimeout(() => {
        console.error('🛑 Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
    🚀 YM7 Hobby Server Started!
    
    📍 Environment: ${process.env.NODE_ENV || 'development'}
    🌐 Server URL: http://localhost:${PORT}
    🔌 WebSocket: ws://localhost:${PORT}
    📊 Health Check: http://localhost:${PORT}/health
    📚 API Info: http://localhost:${PORT}/api
    
    ⏰ Started at: ${new Date().toISOString()}
    `);
});

module.exports = { app, server, wss };
