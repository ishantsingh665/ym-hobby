/**
 * YM7 Hobby - Main Application Logic
 * Handles window management, core functionality, and application state
 */

class YM7Application {
    constructor() {
        this.currentUser = null;
        this.accessToken = null;
        this.refreshToken = null;
        this.ws = null;
        this.isConnected = false;
        this.chatWindows = new Map();
        this.buddies = [];
        this.pendingRequests = [];
        
        // Application state
        this.state = {
            isAuthenticated: false,
            status: 'online',
            activeChats: new Set(),
            notifications: []
        };
        
        this.initializeApp();
    }

    /**
     * Initialize the application
     */
    initializeApp() {
        this.setupEventListeners();
        this.checkExistingAuth();
        this.setupWindowManagement();
        this.setupNotifications();
        
        console.log('YM7 Hobby Application Initialized');
    }

    /**
     * Setup global event listeners
     */
    setupEventListeners() {
        // Window management
        document.addEventListener('mousedown', this.handleWindowDragStart.bind(this));
        document.addEventListener('mousemove', this.handleWindowDrag.bind(this));
        document.addEventListener('mouseup', this.handleWindowDragEnd.bind(this));
        
        // Keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyboardShortcuts.bind(this));
        
        // Window focus management
        window.addEventListener('focus', this.handleWindowFocus.bind(this));
        window.addEventListener('blur', this.handleWindowBlur.bind(this));
    }

    /**
     * Check for existing authentication
     */
    checkExistingAuth() {
        const savedToken = localStorage.getItem('ym7_access_token');
        const savedUser = localStorage.getItem('ym7_user');
        
        if (savedToken && savedUser) {
            try {
                this.accessToken = savedToken;
                this.currentUser = JSON.parse(savedUser);
                this.state.isAuthenticated = true;
                
                // Show main interface
                this.showMainInterface();
                
                // Connect to WebSocket
                this.connectWebSocket();
                
                // Load initial data
                this.loadInitialData();
                
            } catch (error) {
                console.error('Error restoring session:', error);
                this.clearAuth();
            }
        }
    }

    /**
     * Setup window management system
     */
    setupWindowManagement() {
        this.draggedWindow = null;
        this.dragOffset = { x: 0, y: 0 };
        
        // Z-index management
        this.maxZIndex = 1000;
    }

    /**
     * Setup notification system
     */
    setupNotifications() {
        this.notificationId = 0;
        this.notificationQueue = [];
    }

    /**
     * Handle window drag start
     */
    handleWindowDragStart(e) {
        const titleBar = e.target.closest('.ym7-title-bar');
        if (!titleBar) return;
        
        const windowElement = titleBar.closest('.ym7-window, .chat-window');
        if (!windowElement) return;
        
        this.draggedWindow = windowElement;
        const rect = windowElement.getBoundingClientRect();
        
        this.dragOffset.x = e.clientX - rect.left;
        this.dragOffset.y = e.clientY - rect.top;
        
        // Bring window to front
        this.bringWindowToFront(windowElement);
        
        e.preventDefault();
    }

    /**
     * Handle window dragging
     */
    handleWindowDrag(e) {
        if (!this.draggedWindow) return;
        
        const x = e.clientX - this.dragOffset.x;
        const y = e.clientY - this.dragOffset.y;
        
        // Constrain to viewport
        const maxX = window.innerWidth - this.draggedWindow.offsetWidth;
        const maxY = window.innerHeight - this.draggedWindow.offsetHeight;
        
        this.draggedWindow.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
        this.draggedWindow.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
    }

    /**
     * Handle window drag end
     */
    handleWindowDragEnd() {
        this.draggedWindow = null;
        this.dragOffset = { x: 0, y: 0 };
    }

    /**
     * Bring window to front
     */
    bringWindowToFront(windowElement) {
        this.maxZIndex++;
        windowElement.style.zIndex = this.maxZIndex;
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeyboardShortcuts(e) {
        // Ctrl/Cmd + N: New chat
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            this.showAddBuddyModal();
        }
        
        // Ctrl/Cmd + F: Search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            document.getElementById('buddySearch').focus();
        }
        
        // Esc: Close modals
        if (e.key === 'Escape') {
            this.closeAllModals();
        }
    }

    /**
     * Handle window focus
     */
    handleWindowFocus() {
        // Update status if was away
        if (this.state.status === 'away') {
            this.updateStatus('online');
        }
    }

    /**
     * Handle window blur
     */
    handleWindowBlur() {
        // Set status to away after 5 minutes of inactivity
        setTimeout(() => {
            if (!document.hasFocus() && this.state.status === 'online') {
                this.updateStatus('away');
            }
        }, 300000); // 5 minutes
    }

    /**
     * Show main application interface
     */
    showMainInterface() {
        document.getElementById('loginWindow').classList.add('hidden');
        document.getElementById('registerWindow').classList.add('hidden');
        document.getElementById('forgotPasswordWindow').classList.add('hidden');
        document.getElementById('mainInterface').classList.remove('hidden');
        
        // Update user info
        if (this.currentUser) {
            document.getElementById('userDisplayName').textContent = this.currentUser.displayName;
        }
    }

    /**
     * Show login interface
     */
    showLoginInterface() {
        document.getElementById('loginWindow').classList.remove('hidden');
        document.getElementById('registerWindow').classList.add('hidden');
        document.getElementById('forgotPasswordWindow').classList.add('hidden');
        document.getElementById('mainInterface').classList.add('hidden');
    }

    /**
     * Connect to WebSocket server
     */
    connectWebSocket() {
        if (!this.accessToken) return;
        
       const wsUrl = window.YM7_CONFIG.WS_BASE;
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.isConnected = true;
            
            // Authenticate WebSocket
            this.ws.send(JSON.stringify({
                type: 'authenticate',
                token: this.accessToken
            }));
            
            this.hideLoading();
        };
        
        this.ws.onmessage = (event) => {
            this.handleWebSocketMessage(JSON.parse(event.data));
        };
        
        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.isConnected = false;
            
            // Attempt reconnect after 5 seconds
            setTimeout(() => {
                if (this.state.isAuthenticated) {
                    this.connectWebSocket();
                }
            }, 5000);
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.showNotification('Connection error', 'error');
        };
    }

    /**
     * Handle WebSocket messages
     */
    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'auth_success':
                this.handleAuthSuccess(message);
                break;
                
            case 'private_message':
                this.handlePrivateMessage(message);
                break;
                
            case 'buddy_status_change':
                this.handleBuddyStatusChange(message);
                break;
                
            case 'buddy_request':
                this.handleBuddyRequest(message);
                break;
                
            case 'typing_start':
            case 'typing_stop':
                this.handleTypingIndicator(message);
                break;
                
            case 'message_read':
                this.handleMessageRead(message);
                break;
                
            case 'server_stats':
                this.handleServerStats(message);
                break;
                
            default:
                console.log('Unknown WebSocket message:', message);
        }
    }

    /**
     * Handle authentication success
     */
    handleAuthSuccess(message) {
        console.log('WebSocket authentication successful');
        this.showNotification('Connected successfully', 'success');
    }

    /**
     * Handle private message
     */
    handlePrivateMessage(message) {
        if (window.chatManager) {
            window.chatManager.handleIncomingMessage(message);
        }
    }

    /**
     * Handle buddy status change
     */
    handleBuddyStatusChange(message) {
        if (window.buddiesManager) {
            window.buddiesManager.updateBuddyStatus(message.userId, message.status);
        }
    }

    /**
     * Handle buddy request
     */
    handleBuddyRequest(message) {
        if (window.buddiesManager) {
            window.buddiesManager.handleIncomingRequest(message);
        }
    }

    /**
     * Handle typing indicator
     */
    handleTypingIndicator(message) {
        if (window.chatManager) {
            window.chatManager.handleTypingIndicator(message);
        }
    }

    /**
     * Handle message read receipt
     */
    handleMessageRead(message) {
        if (window.chatManager) {
            window.chatManager.handleMessageRead(message);
        }
    }

    /**
     * Handle server statistics
     */
    handleServerStats(message) {
        // Could update UI with connection count, etc.
        console.log('Server stats:', message);
    }

    /**
     * Load initial application data
     */
    async loadInitialData() {
        try {
            this.showLoading('Loading your buddies...');
            
            // Load buddies
            await this.loadBuddies();
            
            // Load pending requests
            await this.loadPendingRequests();
            
            this.hideLoading();
            
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showNotification('Error loading data', 'error');
            this.hideLoading();
        }
    }

    /**
     * Load user's buddies
     */
    async loadBuddies() {
        try {
            const response = await this.authenticatedFetch('/api/buddies');
            if (response.ok) {
                const data = await response.json();
                this.buddies = data.buddies || [];
                
                // Update buddy list UI
                if (window.buddiesManager) {
                    window.buddiesManager.updateBuddyList(this.buddies);
                }
            }
        } catch (error) {
            console.error('Error loading buddies:', error);
            throw error;
        }
    }

    /**
     * Load pending buddy requests
     */
    async loadPendingRequests() {
        try {
            const response = await this.authenticatedFetch('/api/buddies/requests/pending');
            if (response.ok) {
                const data = await response.json();
                this.pendingRequests = data.requests || [];
                
                // Update pending requests UI
                if (window.buddiesManager) {
                    window.buddiesManager.updatePendingRequests(this.pendingRequests);
                }
            }
        } catch (error) {
            console.error('Error loading pending requests:', error);
            throw error;
        }
    }

    /**
     * Update user status
     */
    async updateStatus(newStatus) {
        if (!this.state.isAuthenticated) return;
        
        try {
            const response = await this.authenticatedFetch('/api/auth/profile', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: newStatus })
            });
            
            if (response.ok) {
                this.state.status = newStatus;
                
                // Update status select
                document.getElementById('statusSelect').value = newStatus;
                
                // Send status update via WebSocket
                if (this.ws && this.isConnected) {
                    this.ws.send(JSON.stringify({
                        type: 'status_update',
                        status: newStatus
                    }));
                }
            }
        } catch (error) {
            console.error('Error updating status:', error);
        }
    }

    /**
     * Show loading overlay
     */
    showLoading(message = 'Loading...') {
        const overlay = document.getElementById('loadingOverlay');
        const text = overlay.querySelector('.ym7-loading-text');
        
        text.textContent = message;
        overlay.classList.remove('hidden');
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        document.getElementById('loadingOverlay').classList.add('hidden');
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info', duration = 5000) {
        const container = document.getElementById('notificationContainer');
        const notification = document.createElement('div');
        notification.className = `ym7-notification ${type}`;
        notification.id = `notification-${++this.notificationId}`;
        
        notification.innerHTML = `
            <div class="ym7-notification-header">
                <span>${type.charAt(0).toUpperCase() + type.slice(1)}</span>
                <button class="ym7-notification-close" onclick="app.closeNotification('${notification.id}')">×</button>
            </div>
            <div class="ym7-notification-body">${message}</div>
        `;
        
        container.appendChild(notification);
        
        // Auto remove after duration
        if (duration > 0) {
            setTimeout(() => {
                this.closeNotification(notification.id);
            }, duration);
        }
        
        return notification.id;
    }

    /**
     * Close notification
     */
    closeNotification(id) {
        const notification = document.getElementById(id);
        if (notification) {
            notification.style.animation = 'slideInRight 0.3s ease-out reverse';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }

    /**
     * Show add buddy modal
     */
    showAddBuddyModal() {
        this.showModal('addBuddyModal');
    }

    /**
     * Show modal
     */
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
            this.bringWindowToFront(modal);
        }
    }

    /**
     * Close modal
     */
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    /**
     * Close all modals
     */
    closeAllModals() {
        const modals = document.querySelectorAll('.ym7-modal');
        modals.forEach(modal => modal.classList.add('hidden'));
    }

    /**
     * Minimize window
     */
    minimizeWindow(windowId) {
        const window = document.getElementById(windowId);
        if (window) {
            window.classList.toggle('minimized');
        }
    }

    /**
     * Close window
     */
    closeWindow(windowId) {
        const window = document.getElementById(windowId);
        if (window) {
            window.classList.add('hidden');
        }
    }

    /**
     * Logout user
     */
    async logout() {
        try {
            if (this.ws) {
                this.ws.close();
            }
            
            // Call logout endpoint
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
            
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.clearAuth();
            this.showLoginInterface();
        }
    }

    /**
     * Clear authentication data
     */
    clearAuth() {
        this.currentUser = null;
        this.accessToken = null;
        this.refreshToken = null;
        this.state.isAuthenticated = false;
        
        localStorage.removeItem('ym7_access_token');
        localStorage.removeItem('ym7_user');
        localStorage.removeItem('ym7_refresh_token');
        
        // Close all chat windows
        this.chatWindows.forEach((window, buddyId) => {
            this.closeChatWindow(buddyId);
        });
        this.chatWindows.clear();
    }

    /**
     * Save authentication data
     */
    saveAuth(accessToken, refreshToken, user) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.currentUser = user;
        this.state.isAuthenticated = true;
        
        localStorage.setItem('ym7_access_token', accessToken);
        localStorage.setItem('ym7_refresh_token', refreshToken);
        localStorage.setItem('ym7_user', JSON.stringify(user));
    }

    /**
     * Refresh access token
     */
    async refreshToken() {
        try {
            const response = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    refreshToken: this.refreshToken
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                this.accessToken = data.accessToken;
                localStorage.setItem('ym7_access_token', data.accessToken);
                return true;
            }
        } catch (error) {
            console.error('Token refresh failed:', error);
        }
        
        return false;
    }

    /**
     * Make authenticated API request with token refresh
     */
    async authenticatedFetch(url, options = {}) {
        if (!options.headers) {
            options.headers = {};
        }
        
        options.headers['Authorization'] = `Bearer ${this.accessToken}`;
        
        let response = await fetch(url, options);
        
        // If token expired, try to refresh
        if (response.status === 401) {
            const refreshed = await this.refreshToken();
            if (refreshed) {
                options.headers['Authorization'] = `Bearer ${this.accessToken}`;
                response = await fetch(url, options);
            } else {
                this.logout();
                throw new Error('Authentication failed');
            }
        }
        
        return response;
    }
}

// Global application instance
let app;

/**
 * Initialize application when DOM is loaded
 */
function initializeApp() {
    app = new YM7Application();
}

/**
 * Global functions for HTML event handlers
 */
function minimizeWindow(windowId) {
    if (app) app.minimizeWindow(windowId);
}

function closeWindow(windowId) {
    if (app) app.closeWindow(windowId);
}

function logout() {
    if (app) app.logout();
}

function showContactsMenu() {
    // Implementation for contacts menu
    console.log('Contacts menu clicked');
}

function showActionsMenu() {
    // Implementation for actions menu
    console.log('Actions menu clicked');
}

function showHelpMenu() {
    // Implementation for help menu
    console.log('Help menu clicked');
}

function toggleGroup(groupId) {
    const group = document.getElementById(groupId);
    if (group) {
        group.classList.toggle('hidden');
    }
}

function closeModal(modalId) {
    if (app) app.closeModal(modalId);
}

function sendBuddyRequest() {
    if (window.buddiesManager) {
        window.buddiesManager.sendBuddyRequest();
    }
}
