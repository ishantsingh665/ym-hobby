-- YM7 Hobby - Complete Database Schema
-- Database: ymd_hobby
-- User: ymt_superadmin

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table with comprehensive security
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(100),
    reset_token VARCHAR(100),
    reset_token_expires TIMESTAMP,
    status VARCHAR(20) DEFAULT 'offline',
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Buddies table with mutual relationships
CREATE TABLE buddies (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    buddy_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    nickname VARCHAR(100),
    group_name VARCHAR(100) DEFAULT 'General',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, buddy_user_id),
    CHECK (user_id != buddy_user_id)
);

-- Messages with size limits and read receipts
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    from_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    to_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 1000),
    message_type VARCHAR(20) DEFAULT 'text',
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    CHECK (from_user_id != to_user_id)
);

-- Buddy requests system
CREATE TABLE buddy_requests (
    id SERIAL PRIMARY KEY,
    from_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    to_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(from_user_id, to_user_id),
    CHECK (from_user_id != to_user_id),
    CHECK (status IN ('pending', 'accepted', 'rejected', 'expired'))
);

-- Blocks system
CREATE TABLE blocks (
    id SERIAL PRIMARY KEY,
    blocker_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_id),
    CHECK (blocker_id != blocked_id)
);

-- Refresh tokens for secure authentication
CREATE TABLE refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Token blacklist for logout functionality
CREATE TABLE token_blacklist (
    token_hash VARCHAR(255) PRIMARY KEY,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Audit log for security monitoring
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Chat rooms for group conversations
CREATE TABLE chat_rooms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by INTEGER REFERENCES users(id),
    is_public BOOLEAN DEFAULT TRUE,
    max_users INTEGER DEFAULT 50,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Room members
CREATE TABLE room_members (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(room_id, user_id)
);

-- Room messages
CREATE TABLE room_messages (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 1000),
    created_at TIMESTAMP DEFAULT NOW()
);
