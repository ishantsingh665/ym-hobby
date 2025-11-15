// chat.js - Cleaned & corrected YM7 ChatManager
// Notes:
// - Replaces Object.keys(map).length with map.size
// - Avoids inline onclick handlers; uses proper event listeners
// - Safely checks DOM nodes and app properties
// - Normalizes message field names and prevents duplicates
// - Cleans up timers when closing chat windows

window.chatManager = null; // ensure global exists early

class ChatManager {
    constructor(app) {
        this.app = app || {};
        // messageHistory map: buddyId -> { messages: [], ids: Set() }
        this.messageHistory = new Map();
        // chatWindows: buddyId -> DOM element
        this.chatWindows = new Map();
        // typingIndicators: buddyId -> timerId
        this.typingIndicators = new Map();
        this.setupChatEventListeners();
    }

    /* ---------- Setup ---------- */

    setupChatEventListeners() {
        const searchInput = document.getElementById('buddySearch');
        const searchBtn = document.getElementById('searchBtn');
        const resultsContainer = document.getElementById('searchResults');

        if (searchInput) {
            searchInput.addEventListener('input', this.handleSearchInput.bind(this));
            searchInput.addEventListener('keypress', this.handleSearchKeypress.bind(this));
        }

        if (searchBtn) {
            searchBtn.addEventListener('click', this.handleSearchClick.bind(this));
        }

        // Delegate clicks inside search results (handles Chat button clicks)
        if (resultsContainer) {
            resultsContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.ym7-add-buddy-btn');
                if (!btn) return;
                const id = btn.dataset.userId;
                if (!id) return;
                this.startChat(Number(id));
            });
        }

        // Global click handler to hide search results on outside click
        document.addEventListener('click', this.handleGlobalClick.bind(this));
    }

    /* ---------- Chat window lifecycle ---------- */

    openChatWindow(buddy) {
        if (!buddy || buddy.id == null) return null;
        const buddyId = Number(buddy.id);

        if (this.chatWindows.has(buddyId)) {
            const existingWindow = this.chatWindows.get(buddyId);
            this.bringChatToFront(existingWindow);
            return existingWindow;
        }

        const chatWindow = this.createChatWindow(buddy);
        this.chatWindows.set(buddyId, chatWindow);
        // initialize message history container structure if not exists
        if (!this.messageHistory.has(buddyId)) {
            this.messageHistory.set(buddyId, { messages: [], ids: new Set() });
        }
        this.loadMessageHistory(buddyId);
        return chatWindow;
    }

    createChatWindow(buddy) {
        const buddyId = Number(buddy.id);
        const chatId = `chat-${buddyId}`;
        const container = document.getElementById('chatWindowsContainer');
        if (!container) {
            console.error('chatWindowsContainer not found in DOM');
            return null;
        }

        const chatWindow = document.createElement('div');
        chatWindow.className = 'chat-window';
        chatWindow.id = chatId;
        chatWindow.dataset.buddyId = String(buddyId);

        // Position windows by count of Map
        const offset = this.chatWindows.size;
        const left = 100 + (offset * 30);
        const top = 100 + (offset * 30);
        chatWindow.style.left = `${left}px`;
        chatWindow.style.top = `${top}px`;

        // Header
        const header = document.createElement('div');
        header.className = 'chat-header';

        const buddyInfo = document.createElement('div');
        buddyInfo.className = 'chat-buddy-info';

        const status = document.createElement('div');
        status.className = `chat-buddy-status ${buddy.status || ''}`;

        const name = document.createElement('span');
        name.className = 'chat-buddy-name';
        name.textContent = buddy.display_name || buddy.email || 'Unknown User';

        buddyInfo.appendChild(status);
        buddyInfo.appendChild(name);

        const controls = document.createElement('div');
        controls.className = 'chat-controls';

        const btnMin = document.createElement('button');
        btnMin.className = 'chat-minimize';
        btnMin.title = 'Minimize';
        btnMin.textContent = '_';
        btnMin.addEventListener('click', () => this.minimizeChat(buddyId));

        const btnClose = document.createElement('button');
        btnClose.className = 'chat-close';
        btnClose.title = 'Close';
        btnClose.textContent = '×';
        btnClose.addEventListener('click', () => this.closeChat(buddyId));

        controls.appendChild(btnMin);
        controls.appendChild(btnClose);

        header.appendChild(buddyInfo);
        header.appendChild(controls);

        // Messages container
        const messages = document.createElement('div');
        messages.className = 'chat-messages';
        messages.id = `${chatId}-messages`;
        const ts = document.createElement('div');
        ts.className = 'chat-timestamp';
        ts.textContent = 'Conversation started';
        messages.appendChild(ts);

        // Typing indicator
        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'typing-indicator hidden';
        typingIndicator.id = `${chatId}-typing`;
        const typingDots = document.createElement('span');
        typingDots.className = 'typing-dots';
        typingDots.innerHTML = '<span></span><span></span><span></span>';
        typingIndicator.appendChild(typingDots);
        const typingText = document.createElement('span');
        typingText.textContent = `${buddy.display_name || buddy.email} is typing...`;
        typingIndicator.appendChild(typingText);

        // Input area
        const inputArea = document.createElement('div');
        inputArea.className = 'chat-input-area';

        const inputContainer = document.createElement('div');
        inputContainer.className = 'chat-input-container';

        const textarea = document.createElement('textarea');
        textarea.className = 'chat-input';
        textarea.id = `${chatId}-input`;
        textarea.placeholder = 'Type a message...';
        textarea.rows = 1;

        const sendBtn = document.createElement('button');
        sendBtn.className = 'chat-send-btn';
        sendBtn.textContent = 'Send';
        sendBtn.addEventListener('click', () => this.sendMessage(buddyId));

        inputContainer.appendChild(textarea);
        inputContainer.appendChild(sendBtn);
        inputArea.appendChild(inputContainer);

        // Assemble window
        chatWindow.appendChild(header);
        chatWindow.appendChild(messages);
        chatWindow.appendChild(typingIndicator);
        chatWindow.appendChild(inputArea);

        container.appendChild(chatWindow);

        // Setup interactions
        this.setupChatWindowEvents(chatWindow, buddyId);

        // Bring to front
        this.bringChatToFront(chatWindow);

        return chatWindow;
    }

    setupChatWindowEvents(chatWindow, buddyId) {
        if (!chatWindow) return;
        const input = chatWindow.querySelector('.chat-input');
        if (input) {
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
        }

        const header = chatWindow.querySelector('.chat-header');
        if (header && this.app && typeof this.app.handleWindowDragStart === 'function') {
            header.addEventListener('mousedown', (e) => {
                if (!e.target.closest('.chat-controls')) {
                    this.app.handleWindowDragStart(e);
                }
            });
        }
    }

    /* ---------- UI helpers ---------- */

    autoResizeTextarea(textarea) {
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 80) + 'px';
    }

    handleChatInput(buddyId, text) {
        if (text && text.trim().length > 0) {
            this.startTypingIndicator(buddyId);
        } else {
            this.stopTypingIndicator(buddyId);
        }
    }

    startTypingIndicator(buddyId) {
        // clear existing timer
        if (this.typingIndicators.has(buddyId)) {
            clearTimeout(this.typingIndicators.get(buddyId));
        }

        // send typing_start via WS if available
        if (this.app && this.app.ws && this.app.isConnected) {
            try {
                this.app.ws.send(JSON.stringify({
                    type: 'typing_start',
                    toUserId: buddyId
                }));
            } catch (e) {
                // ignore send errors
            }
        }

        // set timer to stop
        const timer = setTimeout(() => {
            this.stopTypingIndicator(buddyId);
        }, 3000);
        this.typingIndicators.set(buddyId, timer);
    }

    stopTypingIndicator(buddyId) {
        if (this.typingIndicators.has(buddyId)) {
            clearTimeout(this.typingIndicators.get(buddyId));
            this.typingIndicators.delete(buddyId);
        }

        if (this.app && this.app.ws && this.app.isConnected) {
            try {
                this.app.ws.send(JSON.stringify({
                    type: 'typing_stop',
                    toUserId: buddyId
                }));
            } catch (e) {
                // ignore send errors
            }
        }

        const chatId = `chat-${buddyId}`;
        const typingIndicator = document.getElementById(`${chatId}-typing`);
        if (typingIndicator) {
            typingIndicator.classList.add('hidden');
        }
    }

    /* ---------- Messaging ---------- */

    async sendMessage(buddyId) {
        const chatId = `chat-${buddyId}`;
        const input = document.getElementById(`${chatId}-input`);
        if (!input) return;
        const message = input.value.trim();
        if (!message) return;

        // Cleanup input UI immediately
        input.value = '';
        input.style.height = 'auto';
        this.stopTypingIndicator(buddyId);

        const payload = {
            type: 'private_message',
            toUserId: buddyId,
            message: message
        };

        try {
            if (this.app && this.app.ws && this.app.isConnected) {
                this.app.ws.send(JSON.stringify(payload));
                // optimistically display outgoing message
                const msg = {
                    fromUserId: this.app.currentUser ? this.app.currentUser.id : null,
                    toUserId: buddyId,
                    message,
                    messageId: `local-${Date.now()}`,
                    timestamp: new Date().toISOString(),
                    direction: 'outgoing'
                };
                this.displayMessage(msg);
                this._storeMessage(msg);
            } else {
                // fallback to HTTP
                if (!this.app || typeof this.app.authenticatedFetch !== 'function') {
                    throw new Error('No transport available to send message');
                }
                const response = await this.app.authenticatedFetch('/api/messages/private', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ toUserId: buddyId, message })
                });
                if (response.ok) {
                    const data = await response.json();
                    const msg = {
                        fromUserId: this.app.currentUser ? this.app.currentUser.id : null,
                        toUserId: buddyId,
                        message,
                        messageId: data.messageId || `server-${Date.now()}`,
                        timestamp: data.timestamp || new Date().toISOString(),
                        direction: 'outgoing'
                    };
                    this.displayMessage(msg);
                    this._storeMessage(msg);
                } else {
                    throw new Error('HTTP send failed');
                }
            }
        } catch (error) {
            console.error('Error sending message:', error);
            if (this.app && typeof this.app.showNotification === 'function') {
                this.app.showNotification('Failed to send message', 'error');
            }
        }
    }

    handleIncomingMessage(message) {
        // Normalize fields
        const from = message.fromUserId || message.from_user_id || message.from;
        const to = message.toUserId || message.to_user_id || message.to;
        const msgId = message.messageId || message.message_id || message.id || `srv-${Date.now()}`;

        const normalized = {
            ...message,
            fromUserId: from,
            toUserId: to,
            messageId: msgId,
            timestamp: message.timestamp || new Date().toISOString(),
            direction: (from && this.app && this.app.currentUser && from === this.app.currentUser.id) ? 'outgoing' : 'incoming'
        };

        // store and display
        this._storeMessage(normalized);
        this.displayMessage(normalized);

        // notification if chat not active
        if (!this.isChatActive(normalized.fromUserId)) {
            this.showMessageNotification(normalized);
        } else {
            this.markMessagesAsRead(normalized.fromUserId);
        }
    }

    displayMessage(message) {
        const buddyId = message.direction === 'incoming' ? message.fromUserId : message.toUserId;
        const chatId = `chat-${buddyId}`;
        if (!this.chatWindows.has(buddyId)) {
            // try to open from app.buddies; fallback to minimal user
            const buddy = (this.app.buddies || []).find(b => b.id === buddyId) || { id: buddyId, email: 'Unknown User', display_name: null, status: 'offline' };
            this.openChatWindow(buddy);
        }

        const messagesContainer = document.getElementById(`${chatId}-messages`);
        if (!messagesContainer) return;

        // prevent duplicate display if messageId already rendered
        const hist = this.messageHistory.get(Number(buddyId));
        if (hist && hist.ids.has(message.messageId)) return;

        // create element
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${message.direction === 'outgoing' ? 'own' : 'buddy'}`;
        messageElement.dataset.messageId = message.messageId;

        if (message.direction === 'incoming') {
            const senderLabel = document.createElement('div');
            senderLabel.className = 'chat-message-sender';
            senderLabel.textContent = this.getBuddyName(buddyId);
            messageElement.appendChild(senderLabel);
        }

        const textEl = document.createElement('div');
        textEl.className = 'chat-message-text';
        textEl.textContent = message.message || '';
        messageElement.appendChild(textEl);

        const timeEl = document.createElement('div');
        timeEl.className = 'chat-message-time';
        const ts = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        timeEl.textContent = ts;
        if (message.direction === 'outgoing') {
            const statusSpan = document.createElement('span');
            statusSpan.className = 'message-status sent';
            timeEl.appendChild(statusSpan);
        }
        messageElement.appendChild(timeEl);

        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // animation
        messageElement.style.animation = 'fadeIn 0.3s ease-out';
    }

    /* ---------- History / persistence helpers ---------- */

    _storeMessage(message) {
        const buddyId = message.direction === 'incoming' ? message.fromUserId : message.toUserId;
        const id = message.messageId;
        if (buddyId == null || id == null) return;

        if (!this.messageHistory.has(Number(buddyId))) {
            this.messageHistory.set(Number(buddyId), { messages: [], ids: new Set() });
        }
        const hist = this.messageHistory.get(Number(buddyId));
        if (!hist.ids.has(id)) {
            hist.ids.add(id);
            hist.messages.push(message);
        }
    }

    async loadMessageHistory(buddyId) {
        if (!this.app || typeof this.app.authenticatedFetch !== 'function') return;
        try {
            const response = await this.app.authenticatedFetch(`/api/messages/conversation/${buddyId}?limit=50`);
            if (!response || !response.ok) return;
            const data = await response.json();
            const msgs = Array.isArray(data.messages) ? data.messages : (data || []);
            // initialize history structure
            if (!this.messageHistory.has(Number(buddyId))) {
                this.messageHistory.set(Number(buddyId), { messages: [], ids: new Set() });
            }
            const hist = this.messageHistory.get(Number(buddyId));
            msgs.forEach(m => {
                const from = m.fromUserId || m.from_user_id || m.from;
                const to = m.toUserId || m.to_user_id || m.to;
                const id = m.messageId || m.message_id || m.id;
                const normalized = {
                    ...m,
                    fromUserId: from,
                    toUserId: to,
                    messageId: id,
                    timestamp: m.timestamp || new Date().toISOString(),
                    direction: (from && this.app && this.app.currentUser && from === this.app.currentUser.id) ? 'outgoing' : 'incoming'
                };
                if (!hist.ids.has(normalized.messageId)) {
                    hist.ids.add(normalized.messageId);
                    hist.messages.push(normalized);
                    this.displayMessage(normalized);
                }
            });
        } catch (e) {
            console.error('Error loading message history:', e);
        }
    }

    /* ---------- Typing / receipts ---------- */

    handleTypingIndicator(message) {
        const from = message.fromUserId || message.from_user_id || message.from;
        const chatId = `chat-${from}`;
        const typingIndicator = document.getElementById(`${chatId}-typing`);
        if (!typingIndicator) return;
        if (message.type === 'typing_start') {
            typingIndicator.classList.remove('hidden');
        } else {
            typingIndicator.classList.add('hidden');
        }
    }

    handleMessageRead(message) {
        const el = document.querySelector(`[data-message-id="${message.messageId}"]`);
        if (el) {
            const status = el.querySelector('.message-status');
            if (status) {
                status.className = 'message-status read';
            }
        }
    }

    async markMessagesAsRead(buddyId) {
        if (!this.app || typeof this.app.authenticatedFetch !== 'function') return;
        try {
            await this.app.authenticatedFetch(`/api/messages/conversation/${buddyId}/read`, { method: 'POST' });
            const chatId = `chat-${buddyId}`;
            const messages = document.querySelectorAll(`#${chatId}-messages .chat-message.own .message-status`);
            messages.forEach(status => {
                if (status.classList.contains('sent')) {
                    status.className = 'message-status read';
                }
            });
        } catch (e) {
            console.error('Error marking messages as read:', e);
        }
    }

    /* ---------- Utilities ---------- */

    isChatActive(buddyId) {
        const chatWindow = this.chatWindows.get(Number(buddyId));
        if (!chatWindow) return false;
        return !chatWindow.classList.contains('hidden') && !chatWindow.classList.contains('minimized');
    }

    showMessageNotification(message) {
        const buddyName = this.getBuddyName(message.fromUserId);
        if (this.app && typeof this.app.showNotification === 'function') {
            this.app.showNotification(`New message from ${buddyName}: ${message.message}`, 'info', 5000);
        }
        const chatWindow = this.chatWindows.get(Number(message.fromUserId));
        if (chatWindow) {
            chatWindow.classList.add('has-unread');
        }
    }

    getBuddyName(buddyId) {
        const buddy = (this.app.buddies || []).find(b => Number(b.id) === Number(buddyId));
        return buddy ? (buddy.display_name || buddy.email || 'Unknown User') : 'Unknown User';
    }

    bringChatToFront(chatWindow) {
        if (!chatWindow) return;
        if (this.app && typeof this.app.bringWindowToFront === 'function') {
            this.app.bringWindowToFront(chatWindow);
        } else {
            // fallback z-index bump
            chatWindow.style.zIndex = (parseInt(chatWindow.style.zIndex || 1000) + 1).toString();
        }
        chatWindow.classList.remove('has-unread');

        const buddyId = parseInt(chatWindow.dataset.buddyId, 10);
        if (!Number.isNaN(buddyId)) {
            this.markMessagesAsRead(buddyId);
        }
    }

    minimizeChat(buddyId) {
        const chatWindow = this.chatWindows.get(Number(buddyId));
        if (chatWindow) {
            chatWindow.classList.toggle('minimized');
        }
    }

    closeChat(buddyId) {
        const id = Number(buddyId);
        const chatWindow = this.chatWindows.get(id);
        if (chatWindow) {
            // cleanup timers
            if (this.typingIndicators.has(id)) {
                clearTimeout(this.typingIndicators.get(id));
                this.typingIndicators.delete(id);
            }
            // remove DOM
            chatWindow.remove();
            this.chatWindows.delete(id);
            // do not purge messageHistory by default, user may reopen
        }
    }

    /* ---------- Search ---------- */

    handleSearchInput(e) {
        const query = e.target.value.trim();
        if (query.length >= 2) {
            this.performSearch(query);
        } else {
            this.hideSearchResults();
        }
    }

    handleSearchKeypress(e) {
        if (e.key === 'Enter') {
            const q = e.target.value.trim();
            this.performSearch(q);
        }
    }

    handleSearchClick() {
        const el = document.getElementById('buddySearch');
        const query = el ? el.value.trim() : '';
        this.performSearch(query);
    }

    async performSearch(query) {
        if (!query || query.length < 2) return;
        if (!this.app || typeof this.app.authenticatedFetch !== 'function') return;
        try {
            const response = await this.app.authenticatedFetch(`/api/users/search?query=${encodeURIComponent(query)}`);
            if (!response || !response.ok) return;
            const data = await response.json();
            this.displaySearchResults(Array.isArray(data.users) ? data.users : []);
        } catch (e) {
            console.error('Search error:', e);
        }
    }

    displaySearchResults(users) {
        const resultsContainer = document.getElementById('searchResults');
        if (!resultsContainer) return;
        if (!Array.isArray(users) || users.length === 0) {
            resultsContainer.innerHTML = '<div class="ym7-search-result">No users found</div>';
        } else {
            // build HTML safely and include dataset for userId
            resultsContainer.innerHTML = users.map(user => {
                const name = (user.display_name || user.email || 'Unknown User').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const email = (user.email || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                return `<div class="ym7-search-result">
                    <div class="ym7-search-info">
                        <div class="ym7-search-name">${name}</div>
                        <div class="ym7-search-email">${email}</div>
                    </div>
                    <button class="ym7-add-buddy-btn" data-user-id="${Number(user.id)}">Chat</button>
                </div>`;
            }).join('');
        }
        resultsContainer.classList.remove('hidden');
    }

    hideSearchResults() {
        const resultsContainer = document.getElementById('searchResults');
        if (resultsContainer) resultsContainer.classList.add('hidden');
    }

    startChat(userId) {
        const user = (this.app.buddies || []).find(b => Number(b.id) === Number(userId)) ||
            { id: Number(userId), email: 'Unknown User', status: 'offline', display_name: null };
        this.openChatWindow(user);
        this.hideSearchResults();
        const searchEl = document.getElementById('buddySearch');
        if (searchEl) searchEl.value = '';
    }

    handleGlobalClick(e) {
        if (!e.target.closest('.ym7-search-box') && !e.target.closest('#searchResults')) {
            this.hideSearchResults();
        }
    }
}

/* ---------- Auto-initialize when DOM ready ---------- */
document.addEventListener('DOMContentLoaded', function () {
    // create chatManager early so inline code that expects it will not fail
    if (!window.chatManager) {
        window.chatManager = new ChatManager(window.app || {});
    } else if (window.chatManager && window.chatManager.app == null && window.app) {
        // if chatManager exists but needs app
        window.chatManager.app = window.app;
    }
});
