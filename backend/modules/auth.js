const db = require('../config/database');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const tokenManager = require('./tokenManager');

class Auth {
    /**
     * Register new user
     */
    async register(userData, ipAddress, userAgent) {
        try {
            const { email, password, displayName } = userData;

            console.log('🔐 Registration attempt for:', email);

            // Check if user already exists
            const existingUser = await db.query(
                'SELECT id FROM users WHERE email = $1',
                [email]
            );

            if (existingUser.rows.length > 0) {
                return {
                    error: 'User already exists with this email',
                    code: 'USER_EXISTS'
                };
            }

            // Hash password
            const saltRounds = 12;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Create user
            const result = await db.query(
                `INSERT INTO users (email, password_hash, display_name, created_ip, user_agent) 
                 VALUES ($1, $2, $3, $4, $5) 
                 RETURNING id, email, display_name, created_at`,
                [email, hashedPassword, displayName, ipAddress, userAgent]
            );

            const user = result.rows[0];
            console.log('✅ User registered:', user.email);

            // Generate email verification token
            const verificationToken = this.generateVerificationToken(user.id);

            // Save verification token to database
            await db.query(
                `INSERT INTO email_verifications (user_id, token, expires_at) 
                 VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
                [user.id, verificationToken]
            );

            // Send verification email
            try {
                await this.sendVerificationEmail(user, verificationToken);
                console.log('✅ Verification email sent to:', user.email);
            } catch (emailError) {
                console.error('❌ Failed to send verification email:', emailError);
                // Continue with registration even if email fails
            }

            return {
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    display_name: user.display_name
                },
                message: 'User registered successfully. Please check your email for verification.'
            };

        } catch (error) {
            console.error('Registration error:', error);
            return {
                error: 'Registration failed',
                code: 'REGISTRATION_FAILED'
            };
        }
    }

    /**
     * User login
     */
    async login(email, password, ipAddress, userAgent) {
        try {
            console.log('🔐 Login attempt for:', email);

            // Find user
            const userResult = await db.query(
                `SELECT id, email, display_name, password_hash, email_verified, status 
                 FROM users WHERE email = $1`,
                [email]
            );

            if (userResult.rows.length === 0) {
                return {
                    error: 'Invalid email or password',
                    code: 'INVALID_CREDENTIALS'
                };
            }

            const user = userResult.rows[0];

            // Check if email is verified
            if (!user.email_verified) {
                return {
                    error: 'Please verify your email before logging in',
                    code: 'EMAIL_NOT_VERIFIED'
                };
            }

            // Verify password
            const validPassword = await bcrypt.compare(password, user.password_hash);
            if (!validPassword) {
                return {
                    error: 'Invalid email or password',
                    code: 'INVALID_CREDENTIALS'
                };
            }

            // Generate tokens
            const tokens = await tokenManager.generateTokens(user.id);

            // Update last login
            await db.query(
                'UPDATE users SET last_login = NOW(), last_login_ip = $1 WHERE id = $2',
                [ipAddress, user.id]
            );

            console.log('✅ Login successful for:', user.email);

            return {
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    display_name: user.display_name,
                    email_verified: user.email_verified
                },
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresIn: tokens.expiresIn
            };

        } catch (error) {
            console.error('Login error:', error);
            return {
                error: 'Login failed',
                code: 'LOGIN_FAILED'
            };
        }
    }

    /**
     * Verify email with token
     */
    async verifyEmail(token) {
        try {
            console.log('🔐 Email verification attempt with token');

            // Validate token format (64-character hex)
            if (!token || token.length !== 64 || !/^[a-f0-9]+$/i.test(token)) {
                return {
                    error: 'Invalid token format',
                    code: 'INVALID_TOKEN_FORMAT'
                };
            }

            // Check if token exists and is not expired
            const tokenResult = await db.query(
                `SELECT ev.user_id, ev.token, ev.expires_at, u.email, u.display_name, u.email_verified
                 FROM email_verifications ev
                 JOIN users u ON ev.user_id = u.id
                 WHERE ev.token = $1 AND ev.expires_at > NOW()`,
                [token]
            );

            if (tokenResult.rows.length === 0) {
                return {
                    error: 'Invalid or expired verification token',
                    code: 'INVALID_TOKEN'
                };
            }

            const verification = tokenResult.rows[0];

            // Check if already verified
            if (verification.email_verified) {
                return {
                    error: 'Email already verified',
                    code: 'ALREADY_VERIFIED'
                };
            }

            // Mark email as verified
            await db.query(
                'UPDATE users SET email_verified = true, verified_at = NOW() WHERE id = $1',
                [verification.user_id]
            );

            // Delete used verification token
            await db.query(
                'DELETE FROM email_verifications WHERE token = $1',
                [token]
            );

            console.log('✅ Email verified for:', verification.email);

            return {
                success: true,
                user: {
                    id: verification.user_id,
                    email: verification.email,
                    display_name: verification.display_name
                },
                message: 'Email verified successfully'
            };

        } catch (error) {
            console.error('Email verification error:', error);
            return {
                error: 'Email verification failed',
                code: 'VERIFICATION_FAILED'
            };
        }
    }

    /**
     * Resend verification email
     */
    async resendVerificationEmail(email) {
        try {
            console.log('🔄 Resend verification request for:', email);

            // Find user
            const userResult = await db.query(
                'SELECT id, email, display_name, email_verified FROM users WHERE email = $1',
                [email]
            );

            if (userResult.rows.length === 0) {
                return {
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                };
            }

            const user = userResult.rows[0];

            if (user.email_verified) {
                return {
                    error: 'Email already verified',
                    code: 'ALREADY_VERIFIED'
                };
            }

            // Delete any existing verification tokens
            await db.query(
                'DELETE FROM email_verifications WHERE user_id = $1',
                [user.id]
            );

            // Generate new verification token
            const verificationToken = this.generateVerificationToken(user.id);

            // Save new verification token
            await db.query(
                `INSERT INTO email_verifications (user_id, token, expires_at) 
                 VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
                [user.id, verificationToken]
            );

            // Send verification email
            try {
                await this.sendVerificationEmail(user, verificationToken);
                console.log('✅ Verification email resent to:', user.email);
                
                return {
                    success: true,
                    message: 'Verification email sent successfully'
                };
                
            } catch (emailError) {
                console.error('❌ Failed to send verification email:', emailError);
                return {
                    error: 'Failed to send verification email',
                    code: 'EMAIL_SEND_FAILED'
                };
            }

        } catch (error) {
            console.error('Resend verification error:', error);
            return {
                error: 'Failed to resend verification email',
                code: 'RESEND_FAILED'
            };
        }
    }

    /**
     * Send verification email
     */
    async sendVerificationEmail(user, verificationToken) {
        try {
            console.log('📧 Preparing to send verification email to:', user.email);
            
            // Create email transporter
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST || 'smtp.gmail.com',
                port: process.env.SMTP_PORT || 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                },
                tls: {
                    rejectUnauthorized: false
                }
            });

            // Test connection first
            await transporter.verify();
            console.log('✅ SMTP connection verified');

            // Create verification URL
            const verificationUrl = `${process.env.VERIFICATION_BASE_URL || 'https://ym.betahobby.dpdns.org/ym7'}/api/verification/verify-email?token=${verificationToken}`;

            // Email content
            const mailOptions = {
                from: `"${process.env.FROM_NAME || 'YM7 Hobby'}" <${process.env.FROM_EMAIL}>`,
                to: user.email,
                subject: process.env.VERIFICATION_EMAIL_SUBJECT || 'Verify Your YM7 Hobby Account',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
                            .content { padding: 20px; background: #f9f9f9; }
                            .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 5px; }
                            .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>Verify Your Email</h1>
                            </div>
                            <div class="content">
                                <p>Hello <strong>${user.display_name || user.email}</strong>,</p>
                                <p>Thank you for registering with YM7 Hobby! Please verify your email address by clicking the button below:</p>
                                <p style="text-align: center;">
                                    <a href="${verificationUrl}" class="button">Verify Email Address</a>
                                </p>
                                <p>Or copy and paste this link in your browser:</p>
                                <p><code>${verificationUrl}</code></p>
                                <p>If you didn't create an account, you can safely ignore this email.</p>
                            </div>
                            <div class="footer">
                                <p>&copy; ${new Date().getFullYear()} YM7 Hobby. All rights reserved.</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `,
                text: `
                    Verify Your YM7 Hobby Account

                    Hello ${user.display_name || user.email},

                    Thank you for registering with YM7 Hobby! Please verify your email address by visiting the following link:

                    ${verificationUrl}

                    If you didn't create an account, you can safely ignore this email.

                    Best regards,
                    The YM7 Hobby Team
                `
            };

            // Send email
            const info = await transporter.sendMail(mailOptions);
            console.log('✅ Verification email sent successfully to:', user.email);
            console.log('Message ID:', info.messageId);
            
            return {
                success: true,
                messageId: info.messageId,
                verificationUrl: verificationUrl
            };

        } catch (error) {
            console.error('❌ Failed to send verification email:', error);
            
            // For development, return the URL anyway
            if (process.env.NODE_ENV === 'development') {
                const verificationUrl = `${process.env.VERIFICATION_BASE_URL || 'https://ym.betahobby.dpdns.org/ym7'}/api/verification/verify-email?token=${verificationToken}`;
                
                console.log('🔧 Development mode - Verification URL:', verificationUrl);
                return {
                    success: false,
                    error: 'Email service unavailable',
                    verificationUrl: verificationUrl
                };
            }
            
            throw new Error('Failed to send verification email: ' + error.message);
        }
    }

    /**
     * Generate 64-character hex verification token
     */
    generateVerificationToken(userId) {
        // Create a token that includes user ID and timestamp for validation
        const payload = `${userId}:${Date.now()}:${process.env.JWT_SECRET || 'default-secret'}`;
        return crypto.createHash('sha256').update(payload).digest('hex');
    }

    /**
     * Get user profile
     */
    async getProfile(userId) {
        try {
            const result = await db.query(
                `SELECT id, email, display_name, email_verified, verified_at, 
                        created_at, last_login, status 
                 FROM users WHERE id = $1`,
                [userId]
            );

            if (result.rows.length === 0) {
                return {
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                };
            }

            return {
                success: true,
                user: result.rows[0]
            };

        } catch (error) {
            console.error('Get profile error:', error);
            return {
                error: 'Failed to get profile',
                code: 'PROFILE_FETCH_FAILED'
            };
        }
    }

    /**
     * Update user profile
     */
    async updateProfile(userId, updates) {
        try {
            const allowedUpdates = ['display_name', 'status'];
            const updateFields = {};
            const updateValues = [];
            let paramCount = 1;

            // Filter allowed updates
            for (const [key, value] of Object.entries(updates)) {
                if (allowedUpdates.includes(key) && value !== undefined) {
                    updateFields[key] = value;
                    updateValues.push(value);
                }
            }

            if (Object.keys(updateFields).length === 0) {
                return {
                    error: 'No valid fields to update',
                    code: 'NO_VALID_UPDATES'
                };
            }

            const setClause = Object.keys(updateFields)
                .map((key, index) => `${key} = $${index + 2}`)
                .join(', ');

            const query = `UPDATE users SET ${setClause} WHERE id = $1 RETURNING id, email, display_name, status`;
            const values = [userId, ...updateValues];

            const result = await db.query(query, values);

            return {
                success: true,
                user: result.rows[0],
                message: 'Profile updated successfully'
            };

        } catch (error) {
            console.error('Update profile error:', error);
            return {
                error: 'Failed to update profile',
                code: 'PROFILE_UPDATE_FAILED'
            };
        }
    }
}

module.exports = new Auth();
