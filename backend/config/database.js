const { Pool } = require('pg');

/**
 * Database configuration for YM7 Hobby
 * Uses connection pooling for better performance
 */

const pool = new Pool({
    user: process.env.DB_USER || 'ymt_superadmin',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'ymd_hobby',
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
    
    // SSL configuration for production
    ssl: process.env.NODE_ENV === 'production' ? { 
        rejectUnauthorized: false 
    } : false,
    
    // Connection pool settings
    max: 20, // maximum number of clients in the pool
    idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed
    connectionTimeoutMillis: 10000, // how long to wait for a connection
    query_timeout: 10000, // query execution timeout
    statement_timeout: 10000, // statement timeout
});

// Set user context for Row Level Security (RLS)
pool.setUserContext = async (userId) => {
    if (userId) {
        try {
            await pool.query('SET app.current_user_id = $1', [userId.toString()]);
        } catch (error) {
            console.error('Error setting user context:', error);
        }
    }
};

// Clear user context
pool.clearUserContext = async () => {
    try {
        await pool.query('RESET app.current_user_id');
    } catch (error) {
        console.error('Error clearing user context:', error);
    }
};

// Health check function
pool.healthCheck = async () => {
    try {
        await pool.query('SELECT 1');
        return true;
    } catch (error) {
        console.error('Database health check failed:', error);
        return false;
    }
};

// Error handling for pool
pool.on('error', (err, client) => {
    console.error('Unexpected database pool error:', err);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Closing database pool...');
    await pool.end();
    process.exit(0);
});

module.exports = pool;
