/*
 * YM7 Hobby - Authentication Handling (Fixed)
 * Frontend auth.js improvements:
 * - Send snake_case display_name to backend
 * - Robust JSON parsing when backend returns HTML
 * - Better error messages and defensive checks
 */

class AuthManager {
    constructor(app) {
        this.app = app;
        this.setupAuthEventListeners();
    }

    /* Setup authentication event listeners */
    setupAuthEventListeners() {
        const loginForm = document.getElementById('loginForm');
        if (loginForm) loginForm.addEventListener('submit', this.handleLogin.bind(this));

        const registerForm = document.getElementById('registerForm');
        if (registerForm) registerForm.addEventListener('submit', this.handleRegister.bind(this));

        const forgotPasswordForm = document.getElementById('forgotPasswordForm');
        if (forgotPasswordForm) forgotPasswordForm.addEventListener('submit', this.handleForgotPassword.bind(this));

        this.setupFormNavigation();
        this.setupPasswordStrength();
    }

    /* Form navigation */
    setupFormNavigation() {
        const showRegister = document.getElementById('showRegister');
        if (showRegister) showRegister.addEventListener('click', (e) => { e.preventDefault(); this.showRegisterForm(); });

        const showLogin = document.getElementById('showLogin');
        if (showLogin) showLogin.addEventListener('click', (e) => { e.preventDefault(); this.showLoginForm(); });

        const showForgotPassword = document.getElementById('showForgotPassword');
        if (showForgotPassword) showForgotPassword.addEventListener('click', (e) => { e.preventDefault(); this.showForgotPasswordForm(); });

        const showLoginFromForgot = document.getElementById('showLoginFromForgot');
        if (showLoginFromForgot) showLoginFromForgot.addEventListener('click', (e) => { e.preventDefault(); this.showLoginForm(); });
    }

    /* Password strength */
    setupPasswordStrength() {
        const passwordInput = document.getElementById('registerPassword');
        const strengthIndicator = document.getElementById('passwordStrength');
        if (passwordInput && strengthIndicator) {
            passwordInput.addEventListener('input', () => {
                this.updatePasswordStrength(passwordInput.value, strengthIndicator);
            });
        }
    }

    /* Safe response parsing helper */
    async _safeParseResponse(response) {
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            return await response.json();
        }
        // Not JSON — return text wrapped as error
        const text = await response.text();
        return { error: text || response.statusText, status: response.status };
    }

    /* Handle user login */
    async handleLogin(e) {
        e.preventDefault();

        const email = (document.getElementById('loginEmail') || {}).value || '';
        const password = (document.getElementById('loginPassword') || {}).value || '';

        if (!email || !password) {
            this.showAuthStatus('Please fill in all fields', 'error');
            return;
        }

        try {
            this.setFormLoading('loginForm', true);

            const response = await fetch(window.YM7_CONFIG.API_BASE + '/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email, password: password })
            });

            const data = await this._safeParseResponse(response);

            if (response.ok) this.handleLoginSuccess(data);
            else this.handleLoginFailure(data);

        } catch (error) {
            console.error('Login error:', error);
            this.showAuthStatus('Login failed. Please try again.', 'error');
        } finally {
            this.setFormLoading('loginForm', false);
        }
    }

    handleLoginSuccess(data) {
        if (data && data.accessToken) {
            this.app.saveAuth(data.accessToken, data.refreshToken, data.user);
            this.app.showMainInterface();
            if (this.app.connectWebSocket) this.app.connectWebSocket();
            if (this.app.loadInitialData) this.app.loadInitialData();

            this.showAuthStatus('Login successful!', 'success');
            const loginForm = document.getElementById('loginForm');
            if (loginForm) loginForm.reset();
        } else {
            this.showAuthStatus('Login succeeded but response was unexpected.', 'error');
        }
    }

    handleLoginFailure(data) {
        let errorMessage = 'Login failed';
        if (data && data.code) {
            switch (data.code) {
                case 'INVALID_CREDENTIALS': errorMessage = 'Invalid email or password'; break;
                case 'ACCOUNT_LOCKED': errorMessage = 'Account temporarily locked. Please try again later.'; break;
                case 'EMAIL_NOT_VERIFIED': errorMessage = 'Please verify your email before logging in.'; break;
                default: errorMessage = data.error || errorMessage;
            }
        } else if (data && data.error) {
            errorMessage = data.error;
        }
        this.showAuthStatus(errorMessage, 'error');
    }

    /* Handle user registration */
    async handleRegister(e) {
        e.preventDefault();

        const email = (document.getElementById('registerEmail') || {}).value || '';
        const displayName = (document.getElementById('registerDisplayName') || {}).value || '';
        const password = (document.getElementById('registerPassword') || {}).value || '';
        const confirmPassword = (document.getElementById('registerConfirmPassword') || {}).value || '';

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

            // NOTE: backend expects snake_case display_name
            const payload = {
                email: email,
                display_name: displayName,
                password: password
            };

            const response = await fetch(window.YM7_CONFIG.API_BASE + '/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await this._safeParseResponse(response);

            if (response.ok) this.handleRegisterSuccess(data);
            else this.handleRegisterFailure(data);

        } catch (error) {
            console.error('Registration error:', error);
            this.showAuthStatus('Registration failed. Please try again.', 'error', 'registerStatus');
        } finally {
            this.setFormLoading('registerForm', false);
        }
    }

    handleRegisterSuccess(data) {
        this.showAuthStatus('Registration successful! Please check your email for verification.', 'success', 'registerStatus');
        const registerForm = document.getElementById('registerForm');
        if (registerForm) registerForm.reset();
        setTimeout(() => { this.showLoginForm(); }, 3000);
    }

    handleRegisterFailure(data) {
        let errorMessage = 'Registration failed';
        if (data && data.code) {
            switch (data.code) {
                case 'USER_EXISTS': errorMessage = 'An account with this email already exists'; break;
                case 'INVALID_EMAIL': errorMessage = 'Please enter a valid email address'; break;
                case 'DISPLAY_NAME_INVALID': errorMessage = 'Display name can only contain letters, numbers, and spaces'; break;
                default: errorMessage = data.error || errorMessage;
            }
        } else if (data && data.error) {
            errorMessage = data.error;
        }
        this.showAuthStatus(errorMessage, 'error', 'registerStatus');
    }

    /* Forgot password */
    async handleForgotPassword(e) {
        e.preventDefault();
        const email = (document.getElementById('forgotPasswordEmail') || {}).value || '';
        if (!email) { this.showAuthStatus('Please enter your email address', 'error', 'forgotPasswordStatus'); return; }

        try {
            this.setFormLoading('forgotPasswordForm', true);
            const response = await fetch(window.YM7_CONFIG.API_BASE + '/api/auth/forgot-password', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email })
            });
            const data = await this._safeParseResponse(response);
            if (response.ok) this.handleForgotPasswordSuccess(data); else this.handleForgotPasswordFailure(data);
        } catch (error) {
            console.error('Forgot password error:', error);
            this.showAuthStatus('Request failed. Please try again.', 'error', 'forgotPasswordStatus');
        } finally { this.setFormLoading('forgotPasswordForm', false); }
    }

    handleForgotPasswordSuccess(data) {
        this.showAuthStatus('If an account exists with this email, a password reset link has been sent.', 'success', 'forgotPasswordStatus');
        const f = document.getElementById('forgotPasswordForm'); if (f) f.reset();
    }

    handleForgotPasswordFailure(data) {
        this.showAuthStatus(data.error || 'Password reset request failed', 'error', 'forgotPasswordStatus');
    }

    /* UI helpers */
    showLoginForm() {
        const l = document.getElementById('loginWindow'); if (l) l.classList.remove('hidden');
        const r = document.getElementById('registerWindow'); if (r) r.classList.add('hidden');
        const f = document.getElementById('forgotPasswordWindow'); if (f) f.classList.add('hidden');
        this.clearAuthStatus();
    }

    showRegisterForm() {
        const l = document.getElementById('loginWindow'); if (l) l.classList.add('hidden');
        const r = document.getElementById('registerWindow'); if (r) r.classList.remove('hidden');
        const f = document.getElementById('forgotPasswordWindow'); if (f) f.classList.add('hidden');
        this.clearAuthStatus();
    }

    showForgotPasswordForm() {
        const l = document.getElementById('loginWindow'); if (l) l.classList.add('hidden');
        const r = document.getElementById('registerWindow'); if (r) r.classList.add('hidden');
        const f = document.getElementById('forgotPasswordWindow'); if (f) f.classList.remove('hidden');
        this.clearAuthStatus();
    }

    showAuthStatus(message, type = 'info', elementId = 'loginStatus') {
        const statusElement = document.getElementById(elementId);
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `login-status ${type}`;
        }
    }

    clearAuthStatus() {
        const statusElements = document.querySelectorAll('.login-status');
        statusElements.forEach(element => { element.textContent = ''; element.className = 'login-status'; });
    }

    setFormLoading(formId, isLoading) {
        const form = document.getElementById(formId);
        if (!form) return;
        const submitButton = form.querySelector('button[type="submit"]');
        if (!submitButton) return;
        if (isLoading) {
            form.classList.add('form-loading'); submitButton.disabled = true; submitButton.textContent = 'Please wait...';
        } else {
            form.classList.remove('form-loading'); submitButton.disabled = false;
            if (formId === 'loginForm') submitButton.textContent = 'Login';
            else if (formId === 'registerForm') submitButton.textContent = 'Create Account';
            else if (formId === 'forgotPasswordForm') submitButton.textContent = 'Send Reset Link';
        }
    }

    updatePasswordStrength(password, indicator) {
        if (!password) { indicator.className = 'password-strength'; return; }
        let strength = 0; let className = 'very-weak';
        if (password.length >= 8) strength++; if (password.length >= 12) strength++;
        if (/[a-z]/.test(password)) strength++; if (/[A-Z]/.test(password)) strength++; if (/[0-9]/.test(password)) strength++; if (/[^a-zA-Z0-9]/.test(password)) strength++;
        if (strength >= 5) className = 'strong'; else if (strength >= 4) className = 'good'; else if (strength >= 3) className = 'fair'; else if (strength >= 2) className = 'weak'; else className = 'very-weak';
        indicator.className = `password-strength ${className}`;
    }

    /* Verify email */
    async verifyEmail(token) {
        try {
            const response = await fetch(window.YM7_CONFIG.API_BASE + '/api/verify-email', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token })
            });
            const data = await this._safeParseResponse(response);
            if (response.ok) { this.app.showNotification('Email verified successfully! You can now login.', 'success'); this.showLoginForm(); }
            else this.app.showNotification(data.error || 'Email verification failed', 'error');
        } catch (error) { console.error('Email verification error:', error); this.app.showNotification('Email verification failed', 'error'); }
    }

    /* Reset password */
    async resetPassword(token, newPassword) {
        try {
            const response = await fetch(window.YM7_CONFIG.API_BASE + '/api/auth/reset-password', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token, newPassword: newPassword })
            });
            const data = await this._safeParseResponse(response);
            if (response.ok) { this.app.showNotification('Password reset successfully! You can now login with your new password.', 'success'); this.showLoginForm(); }
            else this.app.showNotification(data.error || 'Password reset failed', 'error');
        } catch (error) { console.error('Password reset error:', error); this.app.showNotification('Password reset failed', 'error'); }
    }
}

// Initialize auth manager when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => { if (window.app) window.authManager = new AuthManager(window.app); }, 100);
});

function verifyEmail(token) { if (window.authManager) window.authManager.verifyEmail(token); }
function resetPassword(token, newPassword) { if (window.authManager) window.authManager.resetPassword(token, newPassword); }
