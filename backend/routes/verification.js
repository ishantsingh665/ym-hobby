// backend/routes/verification.js
const express = require('express');
const router = express.Router();
const auth = require('../modules/auth');

const VERIFICATION_REDIRECT_URL = process.env.VERIFICATION_REDIRECT_URL || '';
const VERIFICATION_SUCCESS_MESSAGE = process.env.VERIFICATION_SUCCESS_MESSAGE || 'Email verified successfully. Please login.';

/**
 * Verify email token endpoint
 * Accepts token in query (GET) or body (POST)
 */
async function handleVerify(req, res) {
    try {
        const token = (req.method === 'GET') ? req.query.token : req.body.token;

        if (!token) {
            // If browser requested without token, show friendly page
            if (req.accepts('html')) {
                return res.status(400).send(`
                    <!doctype html>
                    <html><head><meta charset="utf-8"><title>Verification Failed</title></head>
                    <body style="font-family:Arial,Helvetica,sans-serif;text-align:center;padding:40px;">
                        <h2 style="color:#c00">Verification Failed</h2>
                        <p>Missing verification token.</p>
                        <a href="/ym7/">Go to home</a>
                    </body></html>
                `);
            }
            return res.status(400).json({ error: 'Token required', code: 'TOKEN_REQUIRED' });
        }

        const result = await auth.verifyEmail(token);

        if (result && result.success) {
            // If VERIFICATION_REDIRECT_URL configured, redirect the user to frontend
            if (VERIFICATION_REDIRECT_URL) {
                // Append flags so frontend can show message if desired
                const msg = encodeURIComponent(VERIFICATION_SUCCESS_MESSAGE);
                const url = `${VERIFICATION_REDIRECT_URL}?verified=1&msg=${msg}`;
                return res.redirect(url);
            }

            // Fallback: return minimal HTML success page
            if (req.accepts('html')) {
                return res.send(`
                    <!doctype html>
                    <html><head><meta charset="utf-8"><title>Verified</title></head>
                    <body style="font-family:Arial,Helvetica,sans-serif;text-align:center;padding:40px;">
                        <h2 style="color:#28a745">Email Verified</h2>
                        <p>${VERIFICATION_SUCCESS_MESSAGE}</p>
                        <a href="/ym7/">Go to home</a>
                    </body></html>
                `);
            }

            return res.json({ success: true, message: 'Email verified' });
        } else {
            // Verification failed or token invalid
            const err = result || { error: 'Invalid or expired token', code: 'INVALID_TOKEN' };

            if (req.accepts('html')) {
                return res.status(400).send(`
                    <!doctype html>
                    <html><head><meta charset="utf-8"><title>Verification Failed</title></head>
                    <body style="font-family:Arial,Helvetica,sans-serif;text-align:center;padding:40px;">
                        <h2 style="color:#c00">Verification Failed</h2>
                        <p>${err.error || 'Invalid or expired verification token'}</p>
                        <a href="/ym7/">Go to home</a>
                    </body></html>
                `);
            }

            return res.status(400).json(err);
        }

    } catch (error) {
        console.error('Verification route error:', error);
        if (req.accepts('html')) {
            return res.status(500).send(`
                <!doctype html>
                <html><head><meta charset="utf-8"><title>Verification Error</title></head>
                <body style="font-family:Arial,Helvetica,sans-serif;text-align:center;padding:40px;">
                    <h2 style="color:#c00">Verification Error</h2>
                    <p>There was an error while verifying your email. Please try again later.</p>
                    <a href="/ym7/">Go to home</a>
                </body></html>
            `);
        }
        return res.status(500).json({ error: 'VERIFICATION_FAILED', code: 'VERIFICATION_FAILED' });
    }
}

// GET for link clicks
router.get('/verify-email', handleVerify);

// POST for API calls (if any)
router.post('/verify-email', handleVerify);

module.exports = router;
