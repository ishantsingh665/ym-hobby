/**
 * YM7 Hobby - Buddy Management
 * Handles buddy list, friend requests, and buddy relationships
 */

class BuddiesManager {
    constructor(app) {
        this.app = app;
        this.buddies = [];
        this.pendingRequests = [];
        this.setupBuddyEventListeners();
    }

    /**
     * Setup buddy event listeners
     */
    setupBuddyEventListeners() {
        // Add buddy modal
        const addBuddyBtn = document.querySelector('[onclick*="showAddBuddyModal"]');
        if (addBuddyBtn) {
            addBuddyBtn.addEventListener('click', this.showAddBuddyModal.bind(this));
        }

        // Pending requests modal
        const pendingRequestsBtn = document.querySelector('[onclick*="showPendingRequests"]');
        if (pendingRequestsBtn) {
            pendingRequestsBtn.addEventListener('click', this.showPendingRequestsModal.bind(this));
        }

        // Context menu for buddies
        document.addEventListener('contextmenu', this.handleContextMenu.bind(this));
    }

    /**
     * Update buddy list in UI
     */
    updateBuddyList(buddies) {
        this.buddies = buddies;
        this.renderBuddyList();
    }

    /**
     * Render buddy list in UI
     */
    renderBuddyList() {
        const onlineGroup = document.getElementById('onlineGroup');
        const offlineGroup = document.getElementById('offlineGroup');
        
        if (!onlineGroup || !offlineGroup) return;

        // Clear existing lists
        onlineGroup.innerHTML = '';
        offlineGroup.innerHTML = '';

        // Separate online and offline buddies
        const onlineBuddies = this.buddies.filter(buddy => buddy.status !== 'offline');
        const offlineBuddies = this.buddies.filter(buddy => buddy.status === 'offline');

        // Update group headers
        this.updateGroupHeader('onlineGroup', `Online (${onlineBuddies.length})`);
        this.updateGroupHeader('offlineGroup', `Offline (${offlineBuddies.length})`);

        // Render online buddies
        onlineBuddies.forEach(buddy => {
            const buddyElement = this.createBuddyElement(buddy);
            onlineGroup.appendChild(buddyElement);
        });

        // Render offline buddies
        offlineBuddies.forEach(buddy => {
            const buddyElement = this.createBuddyElement(buddy);
            offlineGroup.appendChild(buddyElement);
        });
    }

    /**
     * Update group header with count
     */
    updateGroupHeader(groupId, text) {
        const header = document.querySelector(`#${groupId}`).previousElementSibling;
        if (header) {
            header.textContent = text;
        }
    }

    /**
     * Create buddy list element
     */
    createBuddyElement(buddy) {
        const buddyElement = document.createElement('div');
        buddyElement.className = `ym7-buddy ${buddy.status}`;
        buddyElement.dataset.buddyId = buddy.id;
        
        buddyElement.innerHTML = `
            <div class="ym7-buddy-status ${buddy.status}"></div>
            <div class="ym7-buddy-name">${buddy.display_name || buddy.email}</div>
            ${buddy.nickname ? `<div class="ym7-buddy-nickname">(${buddy.nickname})</div>` : ''}
        `;

        // Add click event for opening chat
        buddyElement.addEventListener('click', (e) => {
            if (!e.target.closest('.ym7-buddy-context')) {
                this.openChatWithBuddy(buddy);
            }
        });

        // Add context menu
        buddyElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showBuddyContextMenu(e, buddy);
        });

        return buddyElement;
    }

    /**
     * Open chat with buddy
     */
    openChatWithBuddy(buddy) {
        if (window.chatManager) {
            window.chatManager.openChatWindow(buddy);
        }
    }

    /**
     * Update buddy status
     */
    updateBuddyStatus(userId, status) {
        const buddy = this.buddies.find(b => b.id === userId);
        if (buddy) {
            buddy.status = status;
            this.renderBuddyList();
        }
    }

    /**
     * Show add buddy modal
     */
    showAddBuddyModal() {
        this.app.showModal('addBuddyModal');
        
        // Focus on email input
        setTimeout(() => {
            const emailInput = document.getElementById('buddyEmail');
            if (emailInput) {
                emailInput.focus();
            }
        }, 100);
    }

    /**
     * Send buddy request
     */
    async sendBuddyRequest() {
        const emailInput = document.getElementById('buddyEmail');
        const email = emailInput.value.trim();

        if (!email) {
            this.app.showNotification('Please enter an email address', 'error');
            return;
        }

        if (!this.isValidEmail(email)) {
            this.app.showNotification('Please enter a valid email address', 'error');
            return;
        }

        try {
            this.app.showLoading('Sending buddy request...');

            const response = await this.app.authenticatedFetch('/api/buddies/request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email: email })
            });

            const data = await response.json();

            if (response.ok) {
                this.app.showNotification('Buddy request sent successfully', 'success');
                emailInput.value = '';
                this.app.closeModal('addBuddyModal');
            } else {
                this.app.showNotification(data.error || 'Failed to send buddy request', 'error');
            }

        } catch (error) {
            console.error('Error sending buddy request:', error);
            this.app.showNotification('Failed to send buddy request', 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    /**
     * Validate email format
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Update pending requests list
     */
    updatePendingRequests(requests) {
        this.pendingRequests = requests;
        this.updatePendingRequestsBadge();
    }

    /**
     * Update pending requests badge
     */
    updatePendingRequestsBadge() {
        const badge = document.querySelector('.pending-requests-badge');
        if (badge) {
            if (this.pendingRequests.length > 0) {
                badge.textContent = this.pendingRequests.length;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    /**
     * Show pending requests modal
     */
    showPendingRequestsModal() {
        this.app.showModal('pendingRequestsModal');
        this.renderPendingRequests();
    }

    /**
     * Render pending requests in modal
     */
    renderPendingRequests() {
        const container = document.getElementById('pendingRequestsList');
        if (!container) return;

        if (this.pendingRequests.length === 0) {
            container.innerHTML = '<div class="no-requests">No pending requests</div>';
            return;
        }

        container.innerHTML = this.pendingRequests.map(request => `
            <div class="pending-request-item" data-request-id="${request.id}">
                <div class="request-info">
                    <div class="request-sender">${request.display_name}</div>
                    <div class="request-email">${request.email}</div>
                    <div class="request-time">${this.formatTime(request.created_at)}</div>
                </div>
                <div class="request-actions">
                    <button class="ym7-btn ym7-btn-primary" onclick="buddiesManager.acceptRequest(${request.id})">
                        Accept
                    </button>
                    <button class="ym7-btn" onclick="buddiesManager.rejectRequest(${request.id})">
                        Reject
                    </button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Handle incoming buddy request from WebSocket
     */
    handleIncomingRequest(message) {
        // Add to pending requests
        this.pendingRequests.push({
            id: message.requestId,
            from_user_id: message.fromUserId,
            display_name: message.fromDisplayName,
            email: '', // Would need to fetch this
            created_at: message.timestamp
        });

        this.updatePendingRequestsBadge();
        
        // Show notification
        this.app.showNotification(
            `New buddy request from ${message.fromDisplayName}`,
            'info',
            10000
        );
    }

    /**
     * Accept buddy request
     */
    async acceptRequest(requestId) {
        try {
            const response = await this.app.authenticatedFetch(`/api/buddies/request/${requestId}/accept`, {
                method: 'POST'
            });

            const data = await response.json();

            if (response.ok) {
                this.app.showNotification('Buddy request accepted', 'success');
                this.removePendingRequest(requestId);
                this.app.closeModal('pendingRequestsModal');
                
                // Reload buddies list
                await this.app.loadBuddies();
            } else {
                this.app.showNotification(data.error || 'Failed to accept request', 'error');
            }

        } catch (error) {
            console.error('Error accepting buddy request:', error);
            this.app.showNotification('Failed to accept buddy request', 'error');
        }
    }

    /**
     * Reject buddy request
     */
    async rejectRequest(requestId) {
        try {
            const response = await this.app.authenticatedFetch(`/api/buddies/request/${requestId}/reject`, {
                method: 'POST'
            });

            const data = await response.json();

            if (response.ok) {
                this.app.showNotification('Buddy request rejected', 'success');
                this.removePendingRequest(requestId);
            } else {
                this.app.showNotification(data.error || 'Failed to reject request', 'error');
            }

        } catch (error) {
            console.error('Error rejecting buddy request:', error);
            this.app.showNotification('Failed to reject buddy request', 'error');
        }
    }

    /**
     * Remove pending request from list
     */
    removePendingRequest(requestId) {
        this.pendingRequests = this.pendingRequests.filter(req => req.id !== requestId);
        this.updatePendingRequestsBadge();
        this.renderPendingRequests();
    }

    /**
     * Show buddy context menu
     */
    showBuddyContextMenu(e, buddy) {
        // Remove existing context menu
        this.removeContextMenu();

        const contextMenu = document.createElement('div');
        contextMenu.className = 'ym7-context-menu';
        contextMenu.style.left = e.pageX + 'px';
        contextMenu.style.top = e.pageY + 'px';
        
        contextMenu.innerHTML = `
            <div class="ym7-context-item" onclick="buddiesManager.startChat(${buddy.id})">
                Send Message
            </div>
            <div class="ym7-context-item" onclick="buddiesManager.viewProfile(${buddy.id})">
                View Profile
            </div>
            <div class="ym7-context-item" onclick="buddiesManager.changeNickname(${buddy.id})">
                Change Nickname
            </div>
            <div class="ym7-context-item" onclick="buddiesManager.removeBuddy(${buddy.id})">
                Remove Buddy
            </div>
            <div class="ym7-context-item" onclick="buddiesManager.blockUser(${buddy.id})">
                Block User
            </div>
        `;

        document.body.appendChild(contextMenu);
        this.currentContextMenu = contextMenu;

        // Close context menu when clicking elsewhere
        setTimeout(() => {
            document.addEventListener('click', this.removeContextMenu.bind(this), { once: true });
        });
    }

    /**
     * Remove context menu
     */
    removeContextMenu() {
        if (this.currentContextMenu) {
            this.currentContextMenu.remove();
            this.currentContextMenu = null;
        }
    }

    /**
     * Handle context menu event
     */
    handleContextMenu(e) {
        // Prevent default context menu on buddy elements
        if (e.target.closest('.ym7-buddy')) {
            e.preventDefault();
        }
    }

    /**
     * Start chat with buddy (from context menu)
     */
    startChat(buddyId) {
        const buddy = this.buddies.find(b => b.id === buddyId);
        if (buddy) {
            this.openChatWithBuddy(buddy);
        }
        this.removeContextMenu();
    }

    /**
     * View buddy profile
     */
    viewProfile(buddyId) {
        // TODO: Implement profile viewing
        this.app.showNotification('Profile view coming soon', 'info');
        this.removeContextMenu();
    }

    /**
     * Change buddy nickname
     */
    changeNickname(buddyId) {
        const buddy = this.buddies.find(b => b.id === buddyId);
        if (!buddy) return;

        const newNickname = prompt(`Enter nickname for ${buddy.display_name}:`, buddy.nickname || '');
        
        if (newNickname !== null) {
            this.updateBuddyNickname(buddyId, newNickname);
        }
        
        this.removeContextMenu();
    }

    /**
     * Update buddy nickname
     */
    async updateBuddyNickname(buddyId, nickname) {
        try {
            const response = await this.app.authenticatedFetch(`/api/buddies/${buddyId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    nickname: nickname
                })
            });

            if (response.ok) {
                this.app.showNotification('Nickname updated', 'success');
                // Reload buddies to reflect changes
                await this.app.loadBuddies();
            } else {
                this.app.showNotification('Failed to update nickname', 'error');
            }

        } catch (error) {
            console.error('Error updating nickname:', error);
            this.app.showNotification('Failed to update nickname', 'error');
        }
    }

    /**
     * Remove buddy
     */
    async removeBuddy(buddyId) {
        const buddy = this.buddies.find(b => b.id === buddyId);
        if (!buddy) return;

        const confirmed = confirm(`Are you sure you want to remove ${buddy.display_name} from your buddy list?`);
        
        if (!confirmed) {
            this.removeContextMenu();
            return;
        }

        try {
            const response = await this.app.authenticatedFetch(`/api/buddies/${buddyId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.app.showNotification('Buddy removed', 'success');
                // Reload buddies list
                await this.app.loadBuddies();
                
                // Close chat window if open
                if (window.chatManager) {
                    window.chatManager.closeChat(buddyId);
                }
            } else {
                this.app.showNotification('Failed to remove buddy', 'error');
            }

        } catch (error) {
            console.error('Error removing buddy:', error);
            this.app.showNotification('Failed to remove buddy', 'error');
        }

        this.removeContextMenu();
    }

    /**
     * Block user
     */
    async blockUser(buddyId) {
        const buddy = this.buddies.find(b => b.id === buddyId);
        if (!buddy) return;

        const confirmed = confirm(`Are you sure you want to block ${buddy.display_name}? You will no longer receive messages from them.`);
        
        if (!confirmed) {
            this.removeContextMenu();
            return;
        }

        try {
            const response = await this.app.authenticatedFetch(`/api/users/${buddyId}/block`, {
                method: 'POST'
            });

            if (response.ok) {
                this.app.showNotification('User blocked', 'success');
                // Reload buddies list (user should be removed)
                await this.app.loadBuddies();
                
                // Close chat window if open
                if (window.chatManager) {
                    window.chatManager.closeChat(buddyId);
                }
            } else {
                this.app.showNotification('Failed to block user', 'error');
            }

        } catch (error) {
            console.error('Error blocking user:', error);
            this.app.showNotification('Failed to block user', 'error');
        }

        this.removeContextMenu();
    }

    /**
     * Format time for display
     */
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) { // Less than 1 minute
            return 'Just now';
        } else if (diff < 3600000) { // Less than 1 hour
            const minutes = Math.floor(diff / 60000);
            return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        } else if (diff < 86400000) { // Less than 1 day
            const hours = Math.floor(diff / 3600000);
            return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    /**
     * Search for users to add as buddies
     */
    async searchUsers(query) {
        try {
            const response = await this.app.authenticatedFetch(`/api/users/search?query=${encodeURIComponent(query)}`);
            if (response.ok) {
                const data = await response.json();
                return data.users || [];
            }
        } catch (error) {
            console.error('Error searching users:', error);
        }
        return [];
    }

    /**
     * Get blocked users
     */
    async getBlockedUsers() {
        try {
            const response = await this.app.authenticatedFetch('/api/users/blocks');
            if (response.ok) {
                const data = await response.json();
                return data.blockedUsers || [];
            }
        } catch (error) {
            console.error('Error getting blocked users:', error);
        }
        return [];
    }

    /**
     * Unblock user
     */
    async unblockUser(userId) {
        try {
            const response = await this.app.authenticatedFetch(`/api/users/${userId}/unblock`, {
                method: 'POST'
            });

            if (response.ok) {
                this.app.showNotification('User unblocked', 'success');
                return true;
            } else {
                this.app.showNotification('Failed to unblock user', 'error');
            }
        } catch (error) {
            console.error('Error unblocking user:', error);
            this.app.showNotification('Failed to unblock user', 'error');
        }
        return false;
    }
}

// Initialize buddies manager when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        if (window.app) {
            window.buddiesManager = new BuddiesManager(window.app);
        }
    }, 100);
});

/**
 * Global functions for buddy operations
 */
function sendBuddyRequest() {
    if (window.buddiesManager) {
        window.buddiesManager.sendBuddyRequest();
    }
}

function showPendingRequests() {
    if (window.buddiesManager) {
        window.buddiesManager.showPendingRequestsModal();
    }
}

function acceptRequest(requestId) {
    if (window.buddiesManager) {
        window.buddiesManager.acceptRequest(requestId);
    }
}

function rejectRequest(requestId) {
    if (window.buddiesManager) {
        window.buddiesManager.rejectRequest(requestId);
    }
}
