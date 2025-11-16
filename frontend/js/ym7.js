/**
 * YM7 Hobby - Main Application Module
 * Robust, production-ready application core with proper initialization
 */

class YM7App {
    constructor() {
        this.accessToken = null;
        this.refreshTokenValue = null; // renamed to avoid conflict with method
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.initialized = false;

        this.buddies = {};
        this.pendingRequests = [];
        this.unreadCount = 0;

        this.status = "online";
        this.statusTimer = null;

        // Configuration with fallbacks
        this.WS_BASE = window.YM7_CONFIG?.WS_BASE || 'wss://ym.betahobby.dpdns.org/ym7-ws';
        this.API_BASE = window.YM7_CONFIG?.API_BASE || '/ym7-api';
        this.STATIC_BASE = window.YM7_CONFIG?.STATIC_BASE || '/ym7';

        // Status constants
        this.STATUS = {
            ONLINE: 'online',
            AWAY: 'away',
            OFFLINE: 'offline',
            BUSY: 'busy'
        };

        this.init();
    }

    /* -----------------------------------------------------
       INITIALIZATION
    ----------------------------------------------------- */
    init() {
        if (this.initialized) {
            console.warn('YM7App already initialized');
            return;
        }

        if (document.readyState === 'loading') {
            document.addEventListener("DOMContentLoaded", () => {
                this.initializeApp();
            });
        } else {
            this.initializeApp();
        }

        window.addEventListener("blur", () => this.scheduleAwayStatus());
        window.addEventListener("focus", () => this.setOnlineStatus());
        
        this.initialized = true;
        console.log('YM7App initialized successfully');
    }

    initializeApp() {
        this.loadTokens();
        this.setupGlobalEventListeners();
        this.checkAuthenticationState();
        this.initializeWebSocket();
        this.initializeManagers();
    }

    setupGlobalEventListeners() {
        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + F: Focus search
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                const searchInput = document.getElementById('buddySearch');
                if (searchInput) searchInput.focus();
            }
            
            // Esc: Close modals
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
    }

    initializeManagers() {
        // Initialize AuthManager if it exists
        if (typeof AuthManager === 'function' && !window.authManager) {
            window.authManager = new AuthManager(this);
            console.log('AuthManager initialized');
        }
        
        // Other managers will be initialized by their respective modules
    }

    /* -----------------------------------------------------
       AUTHENTICATION STATE MANAGEMENT
    ----------------------------------------------------- */
    checkAuthenticationState() {
        if (this.accessToken) {
            this.showMainInterface();
        } else {
            this.showLoginInterface();
        }
    }

    showMainInterface() {
        this.hideAllInterfaces();
        const mainInterface = document.getElementById('mainInterface');
        if (mainInterface) mainInterface.classList.remove('hidden');
        
        this.updateUserInfo();
    }

    showLoginInterface() {
        this.hideAllInterfaces();
        const loginWindow = document.getElementById('loginWindow');
        if (loginWindow) loginWindow.classList.remove('hidden');
    }

    showRegisterInterface() {
        this.hideAllInterfaces();
        const registerWindow = document.getElementById('registerWindow');
        if (registerWindow) registerWindow.classList.remove('hidden');
    }

    hideAllInterfaces() {
        const interfaces = ['loginWindow', 'registerWindow', 'forgotPasswordWindow', 'mainInterface'];
        interfaces.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.classList.add('hidden');
        });
    }

    updateUserInfo() {
        if (this.currentUser) {
            const userDisplayName = document.getElementById('userDisplayName');
            if (userDisplayName) {
                userDisplayName.textContent = this.currentUser.displayName || this.currentUser.email;
            }
        }
    }

    /* -----------------------------------------------------
       TOKEN MANAGEMENT
    ----------------------------------------------------- */
    loadTokens() {
        this.accessToken = localStorage.getItem("ym7_access_token");
        this.refreshTokenValue = localStorage.getItem("ym7_refresh_token");
        
        const userData = localStorage.getItem("ym7_user");
        if (userData) {
            try {
                this.currentUser = JSON.parse(userData);
            } catch (error) {
                console.error('Error parsing user data:', error);
                this.currentUser = null;
            }
        }
    }

    saveTokens(accessToken, refreshToken, user) {
        this.accessToken = accessToken;
        this.refreshTokenValue = refreshToken;
        this.currentUser = user;

        localStorage.setItem("ym7_access_token", accessToken);
        localStorage.setItem("ym7_refresh_token", refreshToken);
        localStorage.setItem("ym7_user", JSON.stringify(user));
        
        this.showMainInterface();
    }

    clearTokens() {
        this.accessToken = null;
        this.refreshTokenValue = null;
        this.currentUser = null;

        localStorage.removeItem("ym7_access_token");
        localStorage.removeItem("ym7_refresh_token");
        localStorage.removeItem("ym7_user");
        
        this.showLoginInterface();
    }

    async refreshAccessToken() {
        if (!this.refreshTokenValue) {
            console.warn("No refresh token available.");
            return null;
        }

        try {
            const response = await fetch(`${this.API_BASE}/api/auth/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refreshToken: this.refreshTokenValue })
            });

            if (!response.ok) return null;

            const data = await response.json();
            if (data.accessToken) {
                this.accessToken = data.accessToken;
                localStorage.setItem("ym7_access_token", data.accessToken);
                return data.accessToken;
            }

            return null;

        } catch (err) {
            console.error("Refresh token failed:", err);
            return null;
        }
    }

    /* -----------------------------------------------------
       AUTHENTICATED FETCH
    ----------------------------------------------------- */
    async authenticatedFetch(url, options = {}) {
        // Prepend API base path
        if (url.startsWith('/api/')) {
            url = this.API_BASE + url;
        }

        if (!options.headers) options.headers = {};
        
        if (this.accessToken) {
            options.headers["Authorization"] = `Bearer ${this.accessToken}`;
        }

        if (!options.headers['Content-Type'] && !(options.body instanceof FormData)) {
            options.headers['Content-Type'] = 'application/json';
        }

        try {
            let response = await fetch(url, options);

            // If token expired, try to refresh
            if (response.status === 401) {
                const newToken = await this.refreshAccessToken();
                if (!newToken) {
                    console.warn("Session expired - logging out");
                    this.logout();
                    return null;
                }

                // Retry with new token
                options.headers["Authorization"] = `Bearer ${newToken}`;
                response = await fetch(url, options);
            }

            return response;

        } catch (error) {
            console.error("Fetch failed:", error);
            this.showNotification('Network error - please check your connection', 'error');
            return null;
        }
    }

    /* -----------------------------------------------------
       WEBSOCKET MANAGEMENT
    ----------------------------------------------------- */
    initializeWebSocket() {
        if (!this.accessToken) return;

        if (!this.WS_BASE) {
            console.error("WebSocket URL not configured");
            return;
        }

        try {
            const wsUrl = `${this.WS_BASE}?token=${encodeURIComponent(this.accessToken)}`;
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.isConnected = true;
                this.reconnectAttempts = 0;
                console.log('WebSocket connected');
                
                // Load initial data when connected
                this.loadInitialData();
                
                this.showNotification('Connected successfully', 'success');
            };

            this.ws.onclose = (event) => {
                this.isConnected = false;
                console.log(`WebSocket disconnected: ${event.code} ${event.reason}`);
                this.retryWebSocket();
            };

            this.ws.onerror = (error) => {
                this.isConnected = false;
                console.error('WebSocket error:', error);
            };

            this.ws.onmessage = (event) => {
                this.handleIncomingMessage(event);
            };

        } catch (error) {
            console.error('WebSocket initialization failed:', error);
        }
    }

    retryWebSocket() {
        if (this.reconnectAttempts >= 10) {
            console.error("Max reconnection attempts reached.");
            return;
        }

        this.reconnectAttempts += 1;
        const delay = Math.min(1000 * this.reconnectAttempts, 10000);
        
        console.log(`Attempting WebSocket reconnection in ${delay}ms (attempt ${this.reconnectAttempts})`);
        
        setTimeout(() => {
            this.initializeWebSocket();
        }, delay);
    }

    sendWS(data) {
        if (this.ws && this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(data));
                return true;
            } catch (error) {
                console.error('WebSocket send failed:', error);
                return false;
            }
        } else {
            console.warn('WebSocket not connected, message not sent:', data);
            return false;
        }
    }

    /* -----------------------------------------------------
       INITIAL DATA LOADING
    ----------------------------------------------------- */
    async loadInitialData() {
        if (!this.accessToken) return;

        try {
            await Promise.all([
                this.fetchBuddyList(),
                this.fetchPendingRequests()
            ]);
            console.log('Initial data loaded successfully');
        } catch (error) {
            console.error('Error loading initial data:', error);
        }
    }

    /* -----------------------------------------------------
       API METHODS
    ----------------------------------------------------- */
    async fetchBuddyList() {
        const res = await this.authenticatedFetch('/api/buddies');
        if (!res || !res.ok) return;

        const data = await res.json();
        this.buddies = data.buddies || [];
        
        // Update UI if buddies manager exists
        if (window.buddiesManager?.updateBuddyList) {
            window.buddiesManager.updateBuddyList(this.buddies);
        }
    }

    async fetchPendingRequests() {
        const res = await this.authenticatedFetch('/api/buddies/requests/pending');
        if (!res || !res.ok) return;

        const data = await res.json();
        this.pendingRequests = data.requests || [];
        
        // Update UI if buddies manager exists
        if (window.buddiesManager?.updatePendingRequests) {
            window.buddiesManager.updatePendingRequests(this.pendingRequests);
        }
    }

    async updateStatus(status) {
        if (!this.accessToken) return;

        try {
            const response = await this.authenticatedFetch('/api/auth/profile', {
                method: 'PUT',
                body: JSON.stringify({ status })
            });

            if (response.ok) {
                this.status = status;
                
                // Send status update via WebSocket
                this.sendWS({ type: 'status_update', status });
                
                // Update status select if exists
                const statusSelect = document.getElementById('statusSelect');
                if (statusSelect) statusSelect.value = status;
            }
        } catch (error) {
            console.error('Error updating status:', error);
        }
    }

    /* -----------------------------------------------------
       STATUS MANAGEMENT
    ----------------------------------------------------- */
    scheduleAwayStatus() {
        clearTimeout(this.statusTimer);
        this.statusTimer = setTimeout(() => {
            this.updateStatus(this.STATUS.AWAY);
        }, 300000); // 5 minutes
    }

    setOnlineStatus() {
        clearTimeout(this.statusTimer);
        this.updateStatus(this.STATUS.ONLINE);
    }

    /* -----------------------------------------------------
       MESSAGE HANDLING
    ----------------------------------------------------- */
    handleIncomingMessage(event) {
        let msg;
        try {
            msg = JSON.parse(event.data);
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
            return;
        }

        if (!msg.type) {
            console.warn('WebSocket message missing type:', msg);
            return;
        }

        switch (msg.type) {
            case 'auth_success':
                console.log('WebSocket authentication successful');
                break;

            case 'private_message':
                if (window.chatManager?.handleIncomingMessage) {
                    window.chatManager.handleIncomingMessage(msg);
                }
                break;

            case 'buddy_status_change':
                if (window.buddiesManager?.updateBuddyStatus) {
                    window.buddiesManager.updateBuddyStatus(msg.userId, msg.status);
                }
                break;

            case 'buddy_request':
                if (window.buddiesManager?.handleIncomingRequest) {
                    window.buddiesManager.handleIncomingRequest(msg);
                }
                break;

            case 'typing_start':
            case 'typing_stop':
                if (window.chatManager?.handleTypingIndicator) {
                    window.chatManager.handleTypingIndicator(msg);
                }
                break;

            case 'message_read':
                if (window.chatManager?.handleMessageRead) {
                    window.chatManager.handleMessageRead(msg);
                }
                break;

            case 'notification':
                this.showNotification(msg.message, msg.level || 'info');
                break;

            default:
                console.log('Unknown WebSocket message type:', msg.type, msg);
        }
    }

    /* -----------------------------------------------------
       NOTIFICATION SYSTEM
    ----------------------------------------------------- */
    showNotification(message, type = 'info', duration = 5000) {
        // Use existing notification system if available
        if (window.authManager?.showAuthStatus) {
            window.authManager.showAuthStatus(message, type);
            return;
        }

        // Fallback notification
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // Simple browser notification as fallback
        if (type === 'error' || type === 'success') {
            alert(`${type.toUpperCase()}: ${message}`);
        }
    }

    /* -----------------------------------------------------
       MODAL MANAGEMENT
    ----------------------------------------------------- */
    closeAllModals() {
        const modals = document.querySelectorAll('.ym7-modal');
        modals.forEach(modal => {
            modal.classList.add('hidden');
        });
    }

    /* -----------------------------------------------------
       LOGOUT
    ----------------------------------------------------- */
    async logout() {
        try {
            // Close WebSocket
            if (this.ws) {
                this.ws.close();
                this.ws = null;
            }

            // Call logout endpoint
            await this.authenticatedFetch('/api/auth/logout', {
                method: 'POST'
            });

        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.clearTokens();
            this.showNotification('Logged out successfully', 'success');
        }
    }
}

/* -----------------------------------------------------
   GLOBAL INSTANCE & SAFE INITIALIZATION
----------------------------------------------------- */

// Safe global instance creation
if (!window.app) {
    window.app = new YM7App();
} else {
    console.warn('YM7App instance already exists');
}

/* -----------------------------------------------------
   SAFE WINDOW HELPER FUNCTIONS
   These won't break if called before managers are initialized
----------------------------------------------------- */

function minimizeWindow(windowId) {
    // Implementation would depend on window management system
    console.log('Minimize window:', windowId);
}

function closeWindow(windowId) {
    // Implementation would depend on window management system
    console.log('Close window:', windowId);
}

function logout() {
    if (window.app?.logout) {
        window.app.logout();
    } else {
        console.warn('App not initialized for logout');
    }
}

function minimizeChat(buddyId) {
    window.chatManager?.minimizeChat?.(buddyId);
}

function closeChat(buddyId) {
    window.chatManager?.closeChat?.(buddyId);
}

function sendMessage(buddyId) {
    window.chatManager?.sendMessage?.(buddyId);
}

function toggleGroup(groupId) {
    const group = document.getElementById(groupId);
    if (group) {
        group.classList.toggle('hidden');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

console.log('YM7 Hobby Core Module loaded successfully');

/* -----------------------------------------------------
   LEGACY SUPPORT FOR HTML INITIALIZATION
   Keep this for backward compatibility with HTML event listeners
----------------------------------------------------- */

/**
 * Legacy initializeApp function for HTML event listeners
 * This ensures compatibility with existing HTML onload attributes
 */
function initializeApp() {
    console.log('Legacy initializeApp called - using modern YM7App');
    // The modern app is already initialized automatically
    // This function exists only for backward compatibility
}

/**
 * Auto-initialize for legacy support
 * This ensures the app works with both old and new initialization methods
 */
if (typeof YM7App === 'function' && !window.app) {
    window.app = new YM7App();
}
