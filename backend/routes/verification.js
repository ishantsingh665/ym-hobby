const express = require('express');
const router = express.Router();
const auth = require('../modules/auth');
const { verifyLimiter } = require('../middleware/rateLimit');

/**
 * Email verification routes for YM7 Hobby
 */

// Email verification endpoint (web page)
router.get('/verify-email', 
    verifyLimiter,
    async (req, res) => {
        try {
            const { token } = req.query;

            if (!token || token.length !== 64 || !/^[a-f0-9]+$/i.test(token)) {
                return res.status(400).send(`
                    <html>
                    <head>
                        <title>Email Verification Failed - YM7 Hobby</title>
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                            .error { color: #dc3545; }
                            .success { color: #28a745; }
                        </style>
                    </head>
                    <body>
                        <h2 class="error">Email Verification Failed</h2>
                        <p>The verification link is invalid or malformed.</p>
                        <a href="/">Go to Login</a>
                    </body>
                    </html>
                `);
            }

            const result = await auth.verifyEmail(token);

            if (result.error) {
                return res.status(400).send(`
                    <html>
                    <head>
                        <title>Email Verification Failed - YM7 Hobby</title>
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                            .error { color: #dc3545; }
                            .success { color: #28a745; }
                        </style>
                    </head>
                    <body>
                        <h2 class="error">Email Verification Failed</h2>
                        <p>${result.error}</p>
                        <a href="/">Go to Login</a>
                    </body>
                    </html>
                `);
            }

            res.send(`
                <html>
                <head>
                    <title>Email Verified - YM7 Hobby</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .error { color: #dc3545; }
                        .success { color: #28a745; }
                    </style>
                </head>
                <body>
                    <h2 class="success">Email Verified Successfully!</h2>
                    <p>Your email has been verified. You can now login to YM7 Hobby.</p>
                    <a href="/">Go to Login</a>
                </body>
                </html>
            `);

        } catch (error) {
            console.error('Email verification route error:', error);
            res.status(500).send(`
                <html>
                <head>
                    <title>Email Verification Failed - YM7 Hobby</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .error { color: #dc3545; }
                        .success { color: #28a745; }
                    </style>
                </head>
                <body>
                    <h2 class="error">Email Verification Failed</h2>
                    <p>Verification failed due to server error. Please try again.</p>
                    <a href="/">Go to Login</a>
                </body>
                </html>
            `);
        }
    }
);

// API endpoint for email verification (for clients)
router.post('/verify-email',
    verifyLimiter,
    async (req, res) => {
        try {
            const { token } = req.body;

            if (!token || token.length !== 64 || !/^[a-f0-9]+$/i.test(token)) {
                return res.status(400).json({
                    error: 'Invalid token format',
                    code: 'INVALID_TOKEN_FORMAT'
                });
            }

            const result = await auth.verifyEmail(token);

            if (result.error) {
                return res.status(400).json(result);
            }

            res.json({
                success: true,
                message: 'Email verified successfully',
                user: result.user
            });

        } catch (error) {
            console.error('Email verification API route error:', error);
            res.status(500).json({
                error: 'Email verification failed',
                code: 'VERIFICATION_FAILED'
            });
        }
    }
);

// Resend verification email
router.post('/resend-verification',
    verifyLimiter,
    async (req, res) => {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({
                    error: 'Email is required',
                    code: 'EMAIL_REQUIRED'
                });
            }

            // FIXED: Call the actual auth method
            const result = await auth.resendVerificationEmail(email);

            if (result.error) {
                return res.status(400).json(result);
            }

            res.json({
                success: true,
                message: 'Verification email sent successfully'
            });

        } catch (error) {
            console.error('Resend verification route error:', error);
            res.status(500).json({
                error: 'Failed to resend verification email',
                code: 'RESEND_FAILED'
            });
        }
    }
);

module.exports = router;
