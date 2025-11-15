/**
 * YM7 Hobby - Chat Functionality
 * Handles real-time messaging, chat windows, and message management
 */

class ChatManager {
    constructor(app) {
        this.app = app;
        this.chatWindows = new Map();
        this.typingIndicators = new Map();
        this.messageHistory = new Map();
        this.setupChatEventListeners();
    }

    /**
     * Setup chat event listeners
     */
    setupChatEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('buddySearch');
        const searchBtn = document.getElementById('searchBtn');
        
        if (searchInput) {
            searchInput.addEventListener('input', this.handleSearchInput.bind(this));
            searchInput.addEventListener('keypress', this.handleSearchKeypress.bind(this));
        }
        
        if (searchBtn) {
            searchBtn.addEventListener('click', this.handleSearchClick.bind(this));
        }

        // Global click handler for closing context menus
        document.addEventListener('click', this.handleGlobalClick.bind(this));
    }

    /**
     * Open or focus chat window for a buddy
     */
    openChatWindow(buddy) {
        const chatId = `chat-${buddy.id}`;
        
        // Check if chat window already exists
        if (this.chatWindows.has(buddy.id)) {
            const existingWindow = this.chatWindows.get(buddy.id);
            this.bringChatToFront(existingWindow);
            return existingWindow;
        }

        // Create new chat window
        const chatWindow = this.createChatWindow(buddy);
        this.chatWindows.set(buddy.id, chatWindow);
        
        // Load message history
        this.loadMessageHistory(buddy.id);
        
        return chatWindow;
    }

    /**
     * Create chat window HTML
     */
    createChatWindow(buddy) {
        const chatId = `chat-${buddy.id}`;
        const container = document.getElementById('chatWindowsContainer');
        
        const chatWindow = document.createElement('div');
        chatWindow.className = 'chat-window';
        chatWindow.id = chatId;
        chatWindow.dataset.buddyId = buddy.id;
        
        // Position window randomly but within viewport
        const left = 100 + (Object.keys(this.chatWindows).length * 30);
        const top = 100 + (Object.keys(this.chatWindows).length * 30);
        chatWindow.style.left = `${left}px`;
        chatWindow.style.top = `${top}px`;
        
        chatWindow.innerHTML = `
            <div class="chat-header">
                <div class="chat-buddy-info">
                    <div class="chat-buddy-status ${buddy.status}"></div>
                    <span class="chat-buddy-name">${buddy.display_name || buddy.email}</span>
                </div>
                <div class="chat-controls">
                    <button class="chat-minimize" onclick="chatManager.minimizeChat(${buddy.id})">_</button>
                    <button class="chat-close" onclick="chatManager.closeChat(${buddy.id})">×</button>
                </div>
            </div>
            <div class="chat-messages" id="${chatId}-messages">
                <div class="chat-timestamp">Conversation started</div>
            </div>
            <div class="typing-indicator hidden" id="${chatId}-typing">
                <span class="typing-dots">
                    <span></span><span></span><span></span>
                </span>
                ${buddy.display_name} is typing...
            </div>
            <div class="chat-input-area">
                <div class="chat-input-container">
                    <textarea 
                        class="chat-input" 
                        id="${chatId}-input" 
                        placeholder="Type a message..." 
                        rows="1"
                    ></textarea>
                    <button class="chat-send-btn" onclick="chatManager.sendMessage(${buddy.id})">Send</button>
                </div>
            </div>
        `;
        
        container.appendChild(chatWindow);
        
        // Setup event listeners for this chat window
        this.setupChatWindowEvents(chatWindow, buddy.id);
        
        // Bring to front
        this.bringChatToFront(chatWindow);
        
        return chatWindow;
    }

    /**
     * Setup event listeners for a chat window
     */
    setupChatWindowEvents(chatWindow, buddyId) {
        const input = chatWindow.querySelector('.chat-input');
        const sendBtn = chatWindow.querySelector('.chat-send-btn');
        
        // Input events
        input.addEventListener('input', () => {
            this.handleChatInput(buddyId, input.value);
            this.autoResizeTextarea(input);
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage(buddyId);
            }
        });
        
        input.addEventListener('focus', () => {
            this.markMessagesAsRead(buddyId);
        });
        
        // Drag events for chat header
        const header = chatWindow.querySelector('.chat-header');
        header.addEventListener('mousedown', (e) => {
            if (!e.target.closest('.chat-controls')) {
                this.app.handleWindowDragStart(e);
            }
        });
    }

    /**
     * Auto-resize textarea based on content
     */
    autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 80) + 'px';
    }

    /**
     * Handle chat input for typing indicators
     */
    handleChatInput(buddyId, text) {
        if (text.trim().length > 0) {
            this.startTypingIndicator(buddyId);
        } else {
            this.stopTypingIndicator(buddyId);
        }
    }

    /**
     * Start typing indicator
     */
    startTypingIndicator(buddyId) {
        // Clear existing timer
        if (this.typingIndicators.has(buddyId)) {
            clearTimeout(this.typingIndicators.get(buddyId));
        }
        
        // Send typing start via WebSocket
        if (this.app.ws && this.app.isConnected) {
            this.app.ws.send(JSON.stringify({
                type: 'typing_start',
                toUserId: buddyId
            }));
        }
        
        // Set timer to stop typing after 3 seconds
        const timer = setTimeout(() => {
            this.stopTypingIndicator(buddyId);
        }, 3000);
        
        this.typingIndicators.set(buddyId, timer);
    }

    /**
     * Stop typing indicator
     */
    stopTypingIndicator(buddyId) {
        if (this.typingIndicators.has(buddyId)) {
            clearTimeout(this.typingIndicators.get(buddyId));
            this.typingIndicators.delete(buddyId);
        }
        
        // Send typing stop via WebSocket
        if (this.app.ws && this.app.isConnected) {
            this.app.ws.send(JSON.stringify({
                type: 'typing_stop',
                toUserId: buddyId
            }));
        }
        
        // Hide typing indicator in UI
        const chatId = `chat-${buddyId}`;
        const typingIndicator = document.getElementById(`${chatId}-typing`);
        if (typingIndicator) {
            typingIndicator.classList.add('hidden');
        }
    }

    /**
     * Send message to buddy
     */
    async sendMessage(buddyId) {
        const chatId = `chat-${buddyId}`;
        const input = document.getElementById(`${chatId}-input`);
        const message = input.value.trim();
        
        if (!message) return;
        
        try {
            // Clear input and reset height
            input.value = '';
            input.style.height = 'auto';
            
            // Stop typing indicator
            this.stopTypingIndicator(buddyId);
            
            // Send via WebSocket if connected
            if (this.app.ws && this.app.isConnected) {
                this.app.ws.send(JSON.stringify({
                    type: 'private_message',
                    toUserId: buddyId,
                    message: message
                }));
            } else {
                // Fallback to HTTP API
                const response = await this.app.authenticatedFetch('/api/messages/private', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        toUserId: buddyId,
                        message: message
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    this.displayMessage({
                        fromUserId: this.app.currentUser.id,
                        toUserId: buddyId,
                        message: message,
                        messageId: data.messageId,
                        timestamp: data.timestamp,
                        direction: 'outgoing'
                    });
                }
            }
            
        } catch (error) {
            console.error('Error sending message:', error);
            this.app.showNotification('Failed to send message', 'error');
        }
    }

    /**
     * Handle incoming message from WebSocket
     */
    handleIncomingMessage(message) {
        // Add to message history
        if (!this.messageHistory.has(message.fromUserId)) {
            this.messageHistory.set(message.fromUserId, []);
        }
        this.messageHistory.get(message.fromUserId).push({
            ...message,
            direction: 'incoming',
            timestamp: message.timestamp || new Date().toISOString()
        });
        
        // Display message
        this.displayMessage({
            ...message,
            direction: 'incoming'
        });
        
        // Show notification if chat is not active
        if (!this.isChatActive(message.fromUserId)) {
            this.showMessageNotification(message);
        }
        
        // Mark as read if chat is open and focused
        if (this.isChatActive(message.fromUserId)) {
            this.markMessagesAsRead(message.fromUserId);
        }
    }

    /**
     * Display message in chat window
     */
    displayMessage(message) {
        const buddyId = message.direction === 'incoming' ? message.fromUserId : message.toUserId;
        const chatId = `chat-${buddyId}`;
        
        // Ensure chat window exists
        if (!this.chatWindows.has(buddyId)) {
            const buddy = this.app.buddies.find(b => b.id === buddyId);
            if (buddy) {
                this.openChatWindow(buddy);
            } else {
                console.warn('Cannot display message: buddy not found', buddyId);
                return;
            }
        }
        
        const messagesContainer = document.getElementById(`${chatId}-messages`);
        if (!messagesContainer) return;
        
        // Create message element
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${message.direction === 'outgoing' ? 'own' : 'buddy'}`;
        messageElement.dataset.messageId = message.messageId;
        
        const timestamp = new Date(message.timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        messageElement.innerHTML = `
            ${message.direction === 'incoming' ? 
                `<div class="chat-message-sender">${this.getBuddyName(buddyId)}</div>` : 
                ''
            }
            <div class="chat-message-text">${this.escapeHtml(message.message)}</div>
            <div class="chat-message-time">
                ${timestamp}
                ${message.direction === 'outgoing' ? 
                    '<span class="message-status sent"></span>' : 
                    ''
                }
            </div>
        `;
        
        messagesContainer.appendChild(messageElement);
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Add new message animation
        messageElement.style.animation = 'fadeIn 0.3s ease-out';
    }

    /**
     * Load message history for a buddy
     */
    async loadMessageHistory(buddyId) {
        try {
            const response = await this.app.authenticatedFetch(`/api/messages/conversation/${buddyId}?limit=50`);
            if (response.ok) {
                const data = await response.json();
                this.messageHistory.set(buddyId, data.messages || []);
                
                // Display messages
                data.messages.forEach(message => {
                    this.displayMessage({
                        ...message,
                        direction: message.from_user_id === this.app.currentUser.id ? 'outgoing' : 'incoming'
                    });
                });
            }
        } catch (error) {
            console.error('Error loading message history:', error);
        }
    }

    /**
     * Handle typing indicator from WebSocket
     */
    handleTypingIndicator(message) {
        const chatId = `chat-${message.fromUserId}`;
        const typingIndicator = document.getElementById(`${chatId}-typing`);
        
        if (typingIndicator) {
            if (message.type === 'typing_start') {
                typingIndicator.classList.remove('hidden');
            } else {
                typingIndicator.classList.add('hidden');
            }
        }
    }

    /**
     * Handle message read receipt
     */
    handleMessageRead(message) {
        // Update message status in UI
        const messageElement = document.querySelector(`[data-message-id="${message.messageId}"]`);
        if (messageElement) {
            const statusElement = messageElement.querySelector('.message-status');
            if (statusElement) {
                statusElement.className = 'message-status read';
            }
        }
    }

    /**
     * Mark messages as read
     */
    async markMessagesAsRead(buddyId) {
        try {
            await this.app.authenticatedFetch(`/api/messages/conversation/${buddyId}/read`, {
                method: 'POST'
            });
            
            // Update UI
            const chatId = `chat-${buddyId}`;
            const messages = document.querySelectorAll(`#${chatId}-messages .chat-message.own .message-status`);
            messages.forEach(status => {
                if (status.classList.contains('sent')) {
                    status.className = 'message-status read';
                }
            });
            
        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    }

    /**
     * Check if chat window is active (open and focused)
     */
    isChatActive(buddyId) {
        const chatWindow = this.chatWindows.get(buddyId);
        if (!chatWindow) return false;
        
        return !chatWindow.classList.contains('hidden') && 
               !chatWindow.classList.contains('minimized');
    }

    /**
     * Show notification for new message
     */
    showMessageNotification(message) {
        const buddyName = this.getBuddyName(message.fromUserId);
        this.app.showNotification(`New message from ${buddyName}: ${message.message}`, 'info', 5000);
        
        // Flash chat window in taskbar (simulated)
        const chatWindow = this.chatWindows.get(message.fromUserId);
        if (chatWindow) {
            chatWindow.classList.add('has-unread');
        }
    }

    /**
     * Get buddy name by ID
     */
    getBuddyName(buddyId) {
        const buddy = this.app.buddies.find(b => b.id === buddyId);
        return buddy ? (buddy.display_name || buddy.email) : 'Unknown User';
    }

    /**
     * Bring chat window to front
     */
    bringChatToFront(chatWindow) {
        this.app.bringWindowToFront(chatWindow);
        
        // Remove unread indicator
        chatWindow.classList.remove('has-unread');
        
        // Mark messages as read
        const buddyId = chatWindow.dataset.buddyId;
        this.markMessagesAsRead(buddyId);
    }

    /**
     * Minimize chat window
     */
    minimizeChat(buddyId) {
        const chatWindow = this.chatWindows.get(buddyId);
        if (chatWindow) {
            chatWindow.classList.toggle('minimized');
        }
    }

    /**
     * Close chat window
     */
    closeChat(buddyId) {
        const chatWindow = this.chatWindows.get(buddyId);
        if (chatWindow) {
            chatWindow.remove();
            this.chatWindows.delete(buddyId);
        }
    }

    /**
     * Handle search input
     */
    handleSearchInput(e) {
        const query = e.target.value.trim();
        if (query.length >= 2) {
            this.performSearch(query);
        } else {
            this.hideSearchResults();
        }
    }

    /**
     * Handle search keypress
     */
    handleSearchKeypress(e) {
        if (e.key === 'Enter') {
            this.performSearch(e.target.value.trim());
        }
    }

    /**
     * Handle search button click
     */
    handleSearchClick() {
        const query = document.getElementById('buddySearch').value.trim();
        this.performSearch(query);
    }

    /**
     * Perform user search
     */
    async performSearch(query) {
        if (!query || query.length < 2) return;
        
        try {
            const response = await this.app.authenticatedFetch(`/api/users/search?query=${encodeURIComponent(query)}`);
            if (response.ok) {
                const data = await response.json();
                this.displaySearchResults(data.users);
            }
        } catch (error) {
            console.error('Search error:', error);
        }
    }

    /**
     * Display search results
     */
    displaySearchResults(users) {
        const resultsContainer = document.getElementById('searchResults');
        if (!resultsContainer) return;
        
        if (users.length === 0) {
            resultsContainer.innerHTML = '<div class="ym7-search-result">No users found</div>';
        } else {
            resultsContainer.innerHTML = users.map(user => `
                <div class="ym7-search-result">
                    <div class="ym7-search-info">
                        <div class="ym7-search-name">${user.display_name}</div>
                        <div class="ym7-search-email">${user.email}</div>
                    </div>
                    <button class="ym7-add-buddy-btn" onclick="chatManager.startChat(${user.id})">
                        Chat
                    </button>
                </div>
            `).join('');
        }
        
        resultsContainer.classList.remove('hidden');
    }

    /**
     * Hide search results
     */
    hideSearchResults() {
        const resultsContainer = document.getElementById('searchResults');
        if (resultsContainer) {
            resultsContainer.classList.add('hidden');
        }
    }

    /**
     * Start chat with user (for search results)
     */
    startChat(userId) {
        const user = this.app.buddies.find(b => b.id === userId) || 
                    { id: userId, email: 'Unknown User', status: 'offline' };
        this.openChatWindow(user);
        this.hideSearchResults();
        
        // Clear search input
        document.getElementById('buddySearch').value = '';
    }

    /**
     * Handle global click (for closing context menus)
     */
    handleGlobalClick(e) {
        // Close search results when clicking outside
        if (!e.target.closest('.ym7-search-box') && !e.target.closest('.ym7-search-results')) {
            this.hideSearchResults();
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize chat manager when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        if (window.app) {
            window.chatManager = new ChatManager(window.app);
        }
    }, 100);
});

/**
 * Global functions for chat operations
 */
function sendMessage(buddyId) {
    if (window.chatManager) {
        window.chatManager.sendMessage(buddyId);
    }
}

function minimizeChat(buddyId) {
    if (window.chatManager) {
        window.chatManager.minimizeChat(buddyId);
    }
}

function closeChat(buddyId) {
    if (window.chatManager) {
        window.chatManager.closeChat(buddyId);
    }
}
