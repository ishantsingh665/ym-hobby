const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');
const tokenManager = require('./tokenManager');
const { logUserAction } = require('../utils/security');

/**
 * Authentication module for YM7 Hobby
 * Handles user registration, login, and account management
 */

const auth = {
    /**
     * Register a new user
     */
    async register(userData, ipAddress = null, userAgent = null) {
        const { email, password, displayName } = userData;

        try {
            // Check if user already exists
            const existingUser = await db.query(
                'SELECT id FROM users WHERE email = $1',
                [email]
            );

            if (existingUser.rows.length > 0) {
                return { 
                    error: 'User already exists',
                    code: 'USER_EXISTS'
                };
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 12);
            const verificationToken = crypto.randomBytes(32).toString('hex');

            // Create user
            const newUser = await db.query(
                `INSERT INTO users (email, password_hash, display_name, verification_token) 
                 VALUES ($1, $2, $3, $4) 
                 RETURNING id, email, display_name, created_at`,
                [email, hashedPassword, displayName, verificationToken]
            );

            // Log the action
            await logUserAction(
                newUser.rows[0].id, 
                'user_registered', 
                ipAddress, 
                userAgent,
                { email, displayName }
            );

            return {
                success: true,
                user: {
                    id: newUser.rows[0].id,
                    email: newUser.rows[0].email,
                    displayName: newUser.rows[0].display_name
                },
                verificationToken // In production, this would be sent via email
            };

        } catch (error) {
            console.error('Registration error:', error);
            return { 
                error: 'Registration failed',
                code: 'REGISTRATION_FAILED'
            };
        }
    },

    /**
     * Authenticate user login
     */
    async login(email, password, ipAddress = null, userAgent = null) {
        try {
            // Check if account is locked
            const lockedUser = await db.query(
                `SELECT locked_until FROM users 
                 WHERE email = $1 AND locked_until > NOW()`,
                [email]
            );

            if (lockedUser.rows.length > 0) {
                return { 
                    error: 'Account temporarily locked. Try again later.',
                    code: 'ACCOUNT_LOCKED'
                };
            }

            // Get user with password
            const user = await db.query(
                `SELECT id, email, password_hash, display_name, email_verified, login_attempts
                 FROM users WHERE email = $1`,
                [email]
            );

            if (user.rows.length === 0) {
                // Increment failed attempts for existing users
                await db.query(
                    `UPDATE users SET login_attempts = login_attempts + 1 
                     WHERE email = $1`,
                    [email]
                );
                return { 
                    error: 'Invalid credentials',
                    code: 'INVALID_CREDENTIALS'
                };
            }

            const userData = user.rows[0];

            // Verify password
            const isValid = await bcrypt.compare(password, userData.password_hash);

            if (!isValid) {
                // Increment failed attempts
                await db.query(
                    `UPDATE users SET login_attempts = login_attempts + 1 
                     WHERE email = $1`,
                    [email]
                );

                // Lock account after 5 failed attempts
                if (userData.login_attempts + 1 >= 5) {
                    await db.query(
                        `UPDATE users SET locked_until = NOW() + INTERVAL '15 minutes' 
                         WHERE email = $1`,
                        [email]
                    );
                    return { 
                        error: 'Account locked due to too many failed attempts. Try again in 15 minutes.',
                        code: 'ACCOUNT_LOCKED'
                    };
                }

                return { 
                    error: 'Invalid credentials',
                    code: 'INVALID_CREDENTIALS'
                };
            }

            // Check if email is verified
            if (!userData.email_verified) {
                return { 
                    error: 'Email not verified. Please check your email.',
                    code: 'EMAIL_NOT_VERIFIED'
                };
            }

            // Reset login attempts and update last login
            await db.query(
                `UPDATE users SET login_attempts = 0, last_login = NOW(), status = 'online' 
                 WHERE id = $1`,
                [userData.id]
            );

            // Generate tokens
            const tokens = await tokenManager.generateTokens({
                id: userData.id,
                email: userData.email,
                display_name: userData.display_name
            });

            // Log successful login
            await logUserAction(
                userData.id, 
                'user_login', 
                ipAddress, 
                userAgent
            );

            return {
                success: true,
                user: {
                    id: userData.id,
                    email: userData.email,
                    displayName: userData.display_name
                },
                ...tokens
            };

        } catch (error) {
            console.error('Login error:', error);
            return { 
                error: 'Login failed',
                code: 'LOGIN_FAILED'
            };
        }
    },

    /**
     * Verify user email
     */
    async verifyEmail(token) {
        try {
            const result = await db.query(
                `UPDATE users 
                 SET email_verified = TRUE, verification_token = NULL 
                 WHERE verification_token = $1 
                 AND created_at > NOW() - INTERVAL '24 hours'
                 RETURNING id, email, display_name`,
                [token]
            );

            if (result.rows.length === 0) {
                return { 
                    error: 'Invalid or expired verification token',
                    code: 'INVALID_VERIFICATION_TOKEN'
                };
            }

            const user = result.rows[0];

            await logUserAction(user.id, 'email_verified');

            return { 
                success: true, 
                user: {
                    id: user.id,
                    email: user.email,
                    displayName: user.display_name
                }
            };

        } catch (error) {
            console.error('Email verification error:', error);
            return { 
                error: 'Email verification failed',
                code: 'VERIFICATION_FAILED'
            };
        }
    },

    /**
     * Get user profile
     */
    async getProfile(userId) {
        try {
            const result = await db.query(
                `SELECT id, email, display_name, status, avatar_url, created_at, last_login
                 FROM users WHERE id = $1`,
                [userId]
            );

            if (result.rows.length === 0) {
                return { 
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                };
            }

            const user = result.rows[0];

            return {
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    displayName: user.display_name,
                    status: user.status,
                    avatarUrl: user.avatar_url,
                    createdAt: user.created_at,
                    lastLogin: user.last_login
                }
            };

        } catch (error) {
            console.error('Get profile error:', error);
            return { 
                error: 'Failed to get profile',
                code: 'PROFILE_FETCH_FAILED'
            };
        }
    },

    /**
     * Update user profile
     */
    async updateProfile(userId, updates) {
        try {
            const allowedFields = ['display_name', 'avatar_url', 'status'];
            const updateFields = [];
            const updateValues = [];
            let paramCount = 1;

            Object.keys(updates).forEach(field => {
                if (allowedFields.includes(field)) {
                    updateFields.push(`${field} = $${paramCount}`);
                    updateValues.push(updates[field]);
                    paramCount++;
                }
            });

            if (updateFields.length === 0) {
                return { 
                    error: 'No valid fields to update',
                    code: 'NO_VALID_FIELDS'
                };
            }

            updateValues.push(userId);

            const result = await db.query(
                `UPDATE users 
                 SET ${updateFields.join(', ')}, updated_at = NOW()
                 WHERE id = $${paramCount}
                 RETURNING id, email, display_name, status, avatar_url`,
                updateValues
            );

            if (result.rows.length === 0) {
                return { 
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                };
            }

            const user = result.rows[0];

            await logUserAction(userId, 'profile_updated', null, null, { updates });

            return {
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    displayName: user.display_name,
                    status: user.status,
                    avatarUrl: user.avatar_url
                }
            };

        } catch (error) {
            console.error('Update profile error:', error);
            return { 
                error: 'Failed to update profile',
                code: 'PROFILE_UPDATE_FAILED'
            };
        }
    }
};

module.exports = auth;
