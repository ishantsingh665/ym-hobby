const express = require('express');
const router = express.Router();
const auth = require('../modules/auth');
const tokenManager = require('../modules/tokenManager');
const tokenBlacklist = require('../modules/tokenBlacklist');
const passwordReset = require('../modules/passwordReset');
const { authenticateToken, disconnectUserWebSocket } = require('../middleware/auth');
const { 
    registrationValidation, 
    loginValidation, 
    passwordResetValidation,
    passwordChangeValidation,
    handleValidationErrors,
    sanitizeInput 
} = require('../middleware/validation');
const { authLimiter } = require('../middleware/rateLimit');

/**
 * Authentication routes for YM7 Hobby
 */

// User registration
router.post('/register', 
    sanitizeInput,
    registrationValidation, 
    handleValidationErrors,
    async (req, res) => {
        try {
            const { email, password, displayName } = req.body;
            const ipAddress = req.ip;
            const userAgent = req.get('User-Agent');

            const result = await auth.register(
                { email, password, displayName }, 
                ipAddress, 
                userAgent
            );

            if (result.error) {
                return res.status(400).json(result);
            }

            res.status(201).json({
                success: true,
                message: 'User registered successfully. Please check your email for verification.',
                user: result.user
            });

        } catch (error) {
            console.error('Registration route error:', error);
            res.status(500).json({
                error: 'Registration failed',
                code: 'REGISTRATION_FAILED'
            });
        }
    }
);

// User login
router.post('/login', 
    sanitizeInput,
    authLimiter,
    loginValidation, 
    handleValidationErrors,
    async (req, res) => {
        try {
            const { email, password } = req.body;
            const ipAddress = req.ip;
            const userAgent = req.get('User-Agent');

            const result = await auth.login(email, password, ipAddress, userAgent);

            if (result.error) {
                return res.status(401).json(result);
            }

            res.json({
                success: true,
                message: 'Login successful',
                user: result.user,
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
                expiresIn: result.expiresIn
            });

        } catch (error) {
            console.error('Login route error:', error);
            res.status(500).json({
                error: 'Login failed',
                code: 'LOGIN_FAILED'
            });
        }
    }
);

// Refresh access token
router.post('/refresh', 
    sanitizeInput,
    async (req, res) => {
        try {
            const { refreshToken } = req.body;

            if (!refreshToken) {
                return res.status(400).json({
                    error: 'Refresh token is required',
                    code: 'REFRESH_TOKEN_REQUIRED'
                });
            }

            const result = await tokenManager.refreshAccessToken(refreshToken);

            if (result.error) {
                return res.status(401).json(result);
            }

            res.json({
                success: true,
                accessToken: result.accessToken,
                expiresIn: result.expiresIn
            });

        } catch (error) {
            console.error('Token refresh route error:', error);
            res.status(500).json({
                error: 'Token refresh failed',
                code: 'TOKEN_REFRESH_FAILED'
            });
        }
    }
);

// Logout
router.post('/logout', 
    authenticateToken,
    async (req, res) => {
        try {
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];

            if (token) {
                await tokenBlacklist.addToken(token);
            }

            // Disconnect WebSocket session
            disconnectUserWebSocket(req.user.id);

            res.json({
                success: true,
                message: 'Logged out successfully'
            });

        } catch (error) {
            console.error('Logout route error:', error);
            res.status(500).json({
                error: 'Logout failed',
                code: 'LOGOUT_FAILED'
            });
        }
    }
);

// Logout from all devices
router.post('/logout-all', 
    authenticateToken,
    async (req, res) => {
        try {
            // Revoke all refresh tokens
            await tokenManager.revokeAllUserTokens(req.user.id);

            // Disconnect WebSocket
            disconnectUserWebSocket(req.user.id);

            res.json({
                success: true,
                message: 'Logged out from all devices'
            });

        } catch (error) {
            console.error('Logout all route error:', error);
            res.status(500).json({
                error: 'Logout failed',
                code: 'LOGOUT_FAILED'
            });
        }
    }
);

// Forgot password
router.post('/forgot-password',
    sanitizeInput,
    passwordResetValidation,
    handleValidationErrors,
    async (req, res) => {
        try {
            const { email } = req.body;

            const result = await passwordReset.requestReset(email);

            if (result.error) {
                return res.status(400).json(result);
            }

            res.json(result);

        } catch (error) {
            console.error('Forgot password route error:', error);
            res.status(500).json({
                error: 'Password reset request failed',
                code: 'RESET_REQUEST_FAILED'
            });
        }
    }
);

// Reset password
router.post('/reset-password',
    sanitizeInput,
    passwordChangeValidation,
    handleValidationErrors,
    async (req, res) => {
        try {
            const { token, newPassword } = req.body;

            const result = await passwordReset.resetPassword(token, newPassword);

            if (result.error) {
                return res.status(400).json(result);
            }

            res.json(result);

        } catch (error) {
            console.error('Reset password route error:', error);
            res.status(500).json({
                error: 'Password reset failed',
                code: 'RESET_FAILED'
            });
        }
    }
);

// Get current user profile
router.get('/profile',
    authenticateToken,
    async (req, res) => {
        try {
            const result = await auth.getProfile(req.user.id);

            if (result.error) {
                return res.status(404).json(result);
            }

            res.json(result);

        } catch (error) {
            console.error('Get profile route error:', error);
            res.status(500).json({
                error: 'Failed to get profile',
                code: 'PROFILE_FETCH_FAILED'
            });
        }
    }
);

// Update user profile
router.put('/profile',
    authenticateToken,
    sanitizeInput,
    async (req, res) => {
        try {
            const result = await auth.updateProfile(req.user.id, req.body);

            if (result.error) {
                return res.status(400).json(result);
            }

            res.json(result);

        } catch (error) {
            console.error('Update profile route error:', error);
            res.status(500).json({
                error: 'Failed to update profile',
                code: 'PROFILE_UPDATE_FAILED'
            });
        }
    }
);

module.exports = router;
