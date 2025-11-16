/**
 * YM7 Hobby - Authentication Handling
 * Manages user login, registration, and authentication state
 */

class AuthManager {
    constructor(app) {
        this.app = app;
        this.setupAuthEventListeners();
    }

    /**
     * Setup authentication event listeners
     */
    setupAuthEventListeners() {
        // Login form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', this.handleLogin.bind(this));
        }

        // Register form
        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', this.handleRegister.bind(this));
        }

        // Forgot password form
        const forgotPasswordForm = document.getElementById('forgotPasswordForm');
        if (forgotPasswordForm) {
            forgotPasswordForm.addEventListener('submit', this.handleForgotPassword.bind(this));
        }

        // Form navigation
        this.setupFormNavigation();
        
        // Password strength indicator
        this.setupPasswordStrength();
    }

    /**
     * Setup form navigation between login/register/forgot password
     */
    setupFormNavigation() {
        // Show register form
        const showRegister = document.getElementById('showRegister');
        if (showRegister) {
            showRegister.addEventListener('click', (e) => {
                e.preventDefault();
                this.showRegisterForm();
            });
        }

        // Show login form from register
        const showLogin = document.getElementById('showLogin');
        if (showLogin) {
            showLogin.addEventListener('click', (e) => {
                e.preventDefault();
                this.showLoginForm();
            });
        }

        // Show forgot password form
        const showForgotPassword = document.getElementById('showForgotPassword');
        if (showForgotPassword) {
            showForgotPassword.addEventListener('click', (e) => {
                e.preventDefault();
                this.showForgotPasswordForm();
            });
        }

        // Show login form from forgot password
        const showLoginFromForgot = document.getElementById('showLoginFromForgot');
        if (showLoginFromForgot) {
            showLoginFromForgot.addEventListener('click', (e) => {
                e.preventDefault();
                this.showLoginForm();
            });
        }
    }

    /**
     * Setup password strength indicator
     */
    setupPasswordStrength() {
        const passwordInput = document.getElementById('registerPassword');
        const strengthIndicator = document.getElementById('passwordStrength');
        
        if (passwordInput && strengthIndicator) {
            passwordInput.addEventListener('input', () => {
                this.updatePasswordStrength(passwordInput.value, strengthIndicator);
            });
        }
    }

    /**
     * Handle user login
     */
    async handleLogin(e) {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const rememberMe = document.getElementById('rememberMe').checked;
        
        // Basic validation
        if (!email || !password) {
            this.showAuthStatus('Please fill in all fields', 'error');
            return;
        }

        try {
            this.setFormLoading('loginForm', true);
            
            const response = await fetch(window.YM7_CONFIG.API_BASE + '/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: email,
                    password: password
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Login successful
                this.handleLoginSuccess(data);
            } else {
                // Login failed
                this.handleLoginFailure(data);
            }
            
        } catch (error) {
            console.error('Login error:', error);
            this.showAuthStatus('Login failed. Please try again.', 'error');
        } finally {
            this.setFormLoading('loginForm', false);
        }
    }

    /**
     * Handle successful login
     */
    handleLoginSuccess(data) {
        this.app.saveAuth(data.accessToken, data.refreshToken, data.user);
        this.app.showMainInterface();
        this.app.connectWebSocket();
        this.app.loadInitialData();
        
        this.showAuthStatus('Login successful!', 'success');
        
        // Clear form
        document.getElementById('loginForm').reset();
    }

    /**
     * Handle login failure
     */
    handleLoginFailure(data) {
        let errorMessage = 'Login failed';
        
        switch (data.code) {
            case 'INVALID_CREDENTIALS':
                errorMessage = 'Invalid email or password';
                break;
            case 'ACCOUNT_LOCKED':
                errorMessage = 'Account temporarily locked. Please try again later.';
                break;
            case 'EMAIL_NOT_VERIFIED':
                errorMessage = 'Please verify your email before logging in.';
                break;
            default:
                errorMessage = data.error || 'Login failed';
        }
        
        this.showAuthStatus(errorMessage, 'error');
    }

    /**
     * Handle user registration
     */
    async handleRegister(e) {
        e.preventDefault();
        
        const email = document.getElementById('registerEmail').value;
        const displayName = document.getElementById('registerDisplayName').value;
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('registerConfirmPassword').value;
        
        // Validation
        if (!email || !displayName || !password || !confirmPassword) {
            this.showAuthStatus('Please fill in all fields', 'error', 'registerStatus');
            return;
        }

        if (password !== confirmPassword) {
            this.showAuthStatus('Passwords do not match', 'error', 'registerStatus');
            return;
        }

        if (password.length < 8) {
            this.showAuthStatus('Password must be at least 8 characters', 'error', 'registerStatus');
            return;
        }

        try {
            this.setFormLoading('registerForm', true);
            
            const response = await fetch(window.YM7_CONFIG.API_BASE + '/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: email,
                    displayName: displayName,
                    password: password
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Registration successful
                this.handleRegisterSuccess(data);
            } else {
                // Registration failed
                this.handleRegisterFailure(data);
            }
            
        } catch (error) {
            console.error('Registration error:', error);
            this.showAuthStatus('Registration failed. Please try again.', 'error', 'registerStatus');
        } finally {
            this.setFormLoading('registerForm', false);
        }
    }

    /**
     * Handle successful registration
     */
    handleRegisterSuccess(data) {
        this.showAuthStatus(
            'Registration successful! Please check your email for verification.', 
            'success', 
            'registerStatus'
        );
        
        // Clear form and show login
        document.getElementById('registerForm').reset();
        setTimeout(() => {
            this.showLoginForm();
        }, 3000);
    }

    /**
     * Handle registration failure
     */
    handleRegisterFailure(data) {
        let errorMessage = 'Registration failed';
        
        switch (data.code) {
            case 'USER_EXISTS':
                errorMessage = 'An account with this email already exists';
                break;
            case 'INVALID_EMAIL':
                errorMessage = 'Please enter a valid email address';
                break;
            case 'DISPLAY_NAME_INVALID':
                errorMessage = 'Display name can only contain letters, numbers, and spaces';
                break;
            default:
                errorMessage = data.error || 'Registration failed';
        }
        
        this.showAuthStatus(errorMessage, 'error', 'registerStatus');
    }

    /**
     * Handle forgot password
     */
    async handleForgotPassword(e) {
        e.preventDefault();
        
        const email = document.getElementById('forgotPasswordEmail').value;
        
        if (!email) {
            this.showAuthStatus('Please enter your email address', 'error', 'forgotPasswordStatus');
            return;
        }

        try {
            this.setFormLoading('forgotPasswordForm', true);
            
            const response = await fetch(window.YM7_CONFIG.API_BASE + '/api/auth/forgot-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email: email })
            });

            const data = await response.json();

            if (response.ok) {
                this.handleForgotPasswordSuccess(data);
            } else {
                this.handleForgotPasswordFailure(data);
            }
            
        } catch (error) {
            console.error('Forgot password error:', error);
            this.showAuthStatus('Request failed. Please try again.', 'error', 'forgotPasswordStatus');
        } finally {
            this.setFormLoading('forgotPasswordForm', false);
        }
    }

    /**
     * Handle successful forgot password request
     */
    handleForgotPasswordSuccess(data) {
        this.showAuthStatus(
            'If an account exists with this email, a password reset link has been sent.',
            'success',
            'forgotPasswordStatus'
        );
        
        document.getElementById('forgotPasswordForm').reset();
    }

    /**
     * Handle forgot password failure
     */
    handleForgotPasswordFailure(data) {
        this.showAuthStatus(
            data.error || 'Password reset request failed',
            'error',
            'forgotPasswordStatus'
        );
    }

    /**
     * Show login form
     */
    showLoginForm() {
        document.getElementById('loginWindow').classList.remove('hidden');
        document.getElementById('registerWindow').classList.add('hidden');
        document.getElementById('forgotPasswordWindow').classList.add('hidden');
        
        // Clear status messages
        this.clearAuthStatus();
    }

    /**
     * Show register form
     */
    showRegisterForm() {
        document.getElementById('loginWindow').classList.add('hidden');
        document.getElementById('registerWindow').classList.remove('hidden');
        document.getElementById('forgotPasswordWindow').classList.add('hidden');
        
        // Clear status messages
        this.clearAuthStatus();
    }

    /**
     * Show forgot password form
     */
    showForgotPasswordForm() {
        document.getElementById('loginWindow').classList.add('hidden');
        document.getElementById('registerWindow').classList.add('hidden');
        document.getElementById('forgotPasswordWindow').classList.remove('hidden');
        
        // Clear status messages
        this.clearAuthStatus();
    }

    /**
     * Show authentication status message
     */
    showAuthStatus(message, type = 'info', elementId = 'loginStatus') {
        const statusElement = document.getElementById(elementId);
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `login-status ${type}`;
        }
    }

    /**
     * Clear authentication status messages
     */
    clearAuthStatus() {
        const statusElements = document.querySelectorAll('.login-status');
        statusElements.forEach(element => {
            element.textContent = '';
            element.className = 'login-status';
        });
    }

    /**
     * Set form loading state
     */
    setFormLoading(formId, isLoading) {
        const form = document.getElementById(formId);
        const submitButton = form.querySelector('button[type="submit"]');
        
        if (isLoading) {
            form.classList.add('form-loading');
            submitButton.disabled = true;
            submitButton.textContent = 'Please wait...';
        } else {
            form.classList.remove('form-loading');
            submitButton.disabled = false;
            
            // Reset button text based on form type
            if (formId === 'loginForm') {
                submitButton.textContent = 'Login';
            } else if (formId === 'registerForm') {
                submitButton.textContent = 'Create Account';
            } else if (formId === 'forgotPasswordForm') {
                submitButton.textContent = 'Send Reset Link';
            }
        }
    }

    /**
     * Update password strength indicator
     */
    updatePasswordStrength(password, indicator) {
        if (!password) {
            indicator.className = 'password-strength';
            return;
        }

        let strength = 0;
        let className = 'very-weak';

        // Length check
        if (password.length >= 8) strength++;
        if (password.length >= 12) strength++;

        // Character variety checks
        if (/[a-z]/.test(password)) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/[0-9]/.test(password)) strength++;
        if (/[^a-zA-Z0-9]/.test(password)) strength++;

        // Determine strength class
        if (strength >= 5) className = 'strong';
        else if (strength >= 4) className = 'good';
        else if (strength >= 3) className = 'fair';
        else if (strength >= 2) className = 'weak';
        else className = 'very-weak';

        indicator.className = `password-strength ${className}`;
    }

    /**
     * Verify email with token (for email verification links)
     */
    async verifyEmail(token) {
        try {
            const response = await fetch('/api/verify-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token: token })
            });

            const data = await response.json();

            if (response.ok) {
                this.app.showNotification('Email verified successfully! You can now login.', 'success');
                this.showLoginForm();
            } else {
                this.app.showNotification(data.error || 'Email verification failed', 'error');
            }
            
        } catch (error) {
            console.error('Email verification error:', error);
            this.app.showNotification('Email verification failed', 'error');
        }
    }

    /**
     * Reset password with token
     */
    async resetPassword(token, newPassword) {
        try {
            const response = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    token: token,
                    newPassword: newPassword
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.app.showNotification('Password reset successfully! You can now login with your new password.', 'success');
                this.showLoginForm();
            } else {
                this.app.showNotification(data.error || 'Password reset failed', 'error');
            }
            
        } catch (error) {
            console.error('Password reset error:', error);
            this.app.showNotification('Password reset failed', 'error');
        }
    }
}

// Initialize auth manager when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Auth manager will be initialized after the main app
    setTimeout(() => {
        if (window.app) {
            window.authManager = new AuthManager(window.app);
        }
    }, 100);
});

/**
 * Global function for email verification (called from verification links)
 */
function verifyEmail(token) {
    if (window.authManager) {
        window.authManager.verifyEmail(token);
    }
}

/**
 * Global function for password reset (called from reset links)
 */
function resetPassword(token, newPassword) {
    if (window.authManager) {
        window.authManager.resetPassword(token, newPassword);
    }
}
