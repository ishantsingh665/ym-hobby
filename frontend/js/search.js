/**
 * YM7 Hobby - User Search Functionality
 * Handles user search, search results, and user discovery
 */

class SearchManager {
    constructor(app) {
        this.app = app;
        this.searchResults = [];
        this.searchDebounceTimer = null;
        this.currentQuery = '';
        this.setupSearchEventListeners();
    }

    /**
     * Setup search event listeners
     */
    setupSearchEventListeners() {
        const searchInput = document.getElementById('buddySearch');
        const searchBtn = document.getElementById('searchBtn');
        
        if (searchInput) {
            searchInput.addEventListener('input', this.handleSearchInput.bind(this));
            searchInput.addEventListener('keypress', this.handleSearchKeypress.bind(this));
            searchInput.addEventListener('focus', this.handleSearchFocus.bind(this));
            searchInput.addEventListener('blur', this.handleSearchBlur.bind(this));
        }
        
        if (searchBtn) {
            searchBtn.addEventListener('click', this.handleSearchClick.bind(this));
        }

        // Close search results when clicking outside
        document.addEventListener('click', this.handleGlobalClick.bind(this));
    }

    /**
     * Handle search input with debounce
     */
    handleSearchInput(e) {
        const query = e.target.value.trim();
        this.currentQuery = query;
        
        // Clear previous debounce timer
        if (this.searchDebounceTimer) {
            clearTimeout(this.searchDebounceTimer);
        }
        
        // Hide results if query is too short
        if (query.length < 2) {
            this.hideSearchResults();
            return;
        }
        
        // Debounce search to avoid too many requests
        this.searchDebounceTimer = setTimeout(() => {
            this.performSearch(query);
        }, 300);
    }

    /**
     * Handle search keypress (Enter key)
     */
    handleSearchKeypress(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.performSearch(this.currentQuery);
        }
    }

    /**
     * Handle search focus
     */
    handleSearchFocus() {
        // Show recent searches or last results
        if (this.searchResults.length > 0) {
            this.showSearchResults();
        }
    }

    /**
     * Handle search blur
     */
    handleSearchBlur() {
        // Don't hide immediately to allow clicking on results
        setTimeout(() => {
            this.hideSearchResults();
        }, 200);
    }

    /**
     * Handle search button click
     */
    handleSearchClick() {
        this.performSearch(this.currentQuery);
    }

    /**
     * Perform user search
     */
    async performSearch(query) {
        if (!query || query.length < 2) {
            this.hideSearchResults();
            return;
        }

        try {
            this.showSearchLoading();
            
            const response = await this.app.authenticatedFetch(`/api/users/search?query=${encodeURIComponent(query)}`);
            
            if (response.ok) {
                const data = await response.json();
                this.searchResults = data.users || [];
                this.displaySearchResults();
            } else {
                throw new Error('Search failed');
            }
            
        } catch (error) {
            console.error('Search error:', error);
            this.showSearchError('Search failed. Please try again.');
        }
    }

    /**
     * Display search results
     */
    displaySearchResults() {
        const resultsContainer = document.getElementById('searchResults');
        if (!resultsContainer) return;

        if (this.searchResults.length === 0) {
            resultsContainer.innerHTML = `
                <div class="search-no-results">
                    <div class="no-results-icon">🔍</div>
                    <div class="no-results-text">No users found</div>
                    <div class="no-results-hint">Try different search terms</div>
                </div>
            `;
        } else {
            resultsContainer.innerHTML = this.searchResults.map(user => this.createSearchResultItem(user)).join('');
        }

        this.showSearchResults();
    }

    /**
     * Create search result item
     */
    createSearchResultItem(user) {
        const isBuddy = this.app.buddies.some(buddy => buddy.id === user.id);
        const isPending = this.app.pendingRequests.some(req => req.from_user_id === user.id);
        const isCurrentUser = this.app.currentUser && user.id === this.app.currentUser.id;
        
        let actionButton = '';
        
        if (isCurrentUser) {
            actionButton = '<div class="search-action-disabled">This is you</div>';
        } else if (isBuddy) {
            actionButton = `
                <button class="ym7-btn ym7-btn-primary search-action-btn" onclick="searchManager.startChat(${user.id})">
                    Chat
                </button>
            `;
        } else if (isPending) {
            actionButton = '<div class="search-action-disabled">Request Pending</div>';
        } else {
            actionButton = `
                <button class="ym7-btn ym7-btn-primary search-action-btn" onclick="searchManager.sendBuddyRequest(${user.id})">
                    Add Buddy
                </button>
                <button class="ym7-btn search-action-btn" onclick="searchManager.startChat(${user.id})">
                    Chat
                </button>
            `;
        }

        return `
            <div class="search-result-item" data-user-id="${user.id}">
                <div class="search-user-info">
                    <div class="search-user-avatar">
                        <div class="search-avatar-placeholder">${this.getAvatarInitials(user.display_name)}</div>
                        <div class="search-user-status ${user.status}"></div>
                    </div>
                    <div class="search-user-details">
                        <div class="search-user-name">${user.display_name}</div>
                        <div class="search-user-email">${user.email}</div>
                        <div class="search-user-status-text">${this.getStatusText(user.status)}</div>
                    </div>
                </div>
                <div class="search-user-actions">
                    ${actionButton}
                </div>
            </div>
        `;
    }

    /**
     * Get avatar initials from display name
     */
    getAvatarInitials(displayName) {
        if (!displayName) return '?';
        return displayName
            .split(' ')
            .map(part => part.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 2);
    }

    /**
     * Get status text for display
     */
    getStatusText(status) {
        const statusMap = {
            'online': 'Online',
            'away': 'Away',
            'busy': 'Busy',
            'offline': 'Offline'
        };
        return statusMap[status] || 'Offline';
    }

    /**
     * Show search results container
     */
    showSearchResults() {
        const resultsContainer = document.getElementById('searchResults');
        if (resultsContainer) {
            resultsContainer.classList.remove('hidden');
            this.positionSearchResults();
        }
    }

    /**
     * Hide search results container
     */
    hideSearchResults() {
        const resultsContainer = document.getElementById('searchResults');
        if (resultsContainer) {
            resultsContainer.classList.add('hidden');
        }
    }

    /**
     * Position search results below search input
     */
    positionSearchResults() {
        const searchInput = document.getElementById('buddySearch');
        const resultsContainer = document.getElementById('searchResults');
        
        if (!searchInput || !resultsContainer) return;
        
        const inputRect = searchInput.getBoundingClientRect();
        resultsContainer.style.width = inputRect.width + 'px';
        resultsContainer.style.left = inputRect.left + 'px';
        resultsContainer.style.top = (inputRect.bottom + 5) + 'px';
    }

    /**
     * Show search loading state
     */
    showSearchLoading() {
        const resultsContainer = document.getElementById('searchResults');
        if (!resultsContainer) return;

        resultsContainer.innerHTML = `
            <div class="search-loading">
                <div class="search-loading-spinner"></div>
                <div class="search-loading-text">Searching...</div>
            </div>
        `;
        
        this.showSearchResults();
    }

    /**
     * Show search error
     */
    showSearchError(message) {
        const resultsContainer = document.getElementById('searchResults');
        if (!resultsContainer) return;

        resultsContainer.innerHTML = `
            <div class="search-error">
                <div class="search-error-icon">⚠️</div>
                <div class="search-error-text">${message}</div>
            </div>
        `;
        
        this.showSearchResults();
    }

    /**
     * Send buddy request to user from search results
     */
    async sendBuddyRequest(userId) {
        const user = this.searchResults.find(u => u.id === userId);
        if (!user) return;

        try {
            this.app.showLoading('Sending buddy request...');

            const response = await this.app.authenticatedFetch('/api/buddies/request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email: user.email })
            });

            const data = await response.json();

            if (response.ok) {
                this.app.showNotification(`Buddy request sent to ${user.display_name}`, 'success');
                this.hideSearchResults();
                
                // Update the search result to show pending state
                this.updateSearchResultState(userId, 'pending');
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
     * Update search result state (e.g., after sending request)
     */
    updateSearchResultState(userId, state) {
        const resultItem = document.querySelector(`.search-result-item[data-user-id="${userId}"]`);
        if (!resultItem) return;

        const user = this.searchResults.find(u => u.id === userId);
        if (!user) return;

        const actionsContainer = resultItem.querySelector('.search-user-actions');
        
        switch (state) {
            case 'pending':
                actionsContainer.innerHTML = '<div class="search-action-disabled">Request Pending</div>';
                break;
            case 'buddy':
                actionsContainer.innerHTML = `
                    <button class="ym7-btn ym7-btn-primary search-action-btn" onclick="searchManager.startChat(${user.id})">
                        Chat
                    </button>
                `;
                break;
        }
    }

    /**
     * Start chat with user from search results
     */
    startChat(userId) {
        const user = this.searchResults.find(u => u.id === userId);
        if (!user) return;

        // Create a buddy-like object for the chat manager
        const buddy = {
            id: user.id,
            email: user.email,
            display_name: user.display_name,
            status: user.status
        };

        if (window.chatManager) {
            window.chatManager.openChatWindow(buddy);
        }

        this.hideSearchResults();
        
        // Clear search input
        const searchInput = document.getElementById('buddySearch');
        if (searchInput) {
            searchInput.value = '';
        }
    }

    /**
     * View user profile from search results
     */
    async viewUserProfile(userId) {
        const user = this.searchResults.find(u => u.id === userId);
        if (!user) return;

        try {
            const response = await this.app.authenticatedFetch(`/api/users/${userId}/profile`);
            if (response.ok) {
                const data = await response.json();
                this.showUserProfileModal(data.user);
            }
        } catch (error) {
            console.error('Error fetching user profile:', error);
            this.app.showNotification('Failed to load user profile', 'error');
        }
    }

    /**
     * Show user profile modal
     */
    showUserProfileModal(user) {
        // Create profile modal HTML
        const modalHtml = `
            <div class="ym7-modal" id="userProfileModal">
                <div class="ym7-modal-content">
                    <div class="ym7-modal-header">
                        <span>User Profile</span>
                        <button class="ym7-close" onclick="searchManager.closeProfileModal()">×</button>
                    </div>
                    <div class="ym7-modal-body">
                        <div class="profile-header">
                            <div class="profile-avatar">
                                <div class="profile-avatar-placeholder">${this.getAvatarInitials(user.displayName)}</div>
                                <div class="profile-status ${user.status}"></div>
                            </div>
                            <div class="profile-info">
                                <h3 class="profile-name">${user.displayName}</h3>
                                <p class="profile-email">${user.email}</p>
                                <p class="profile-status-text">${this.getStatusText(user.status)}</p>
                            </div>
                        </div>
                        <div class="profile-details">
                            <div class="profile-detail">
                                <span class="detail-label">Member since:</span>
                                <span class="detail-value">${new Date(user.memberSince).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                    <div class="ym7-modal-footer">
                        <button class="ym7-btn" onclick="searchManager.closeProfileModal()">Close</button>
                        <button class="ym7-btn ym7-btn-primary" onclick="searchManager.startChat(${user.id})">
                            Send Message
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Add modal to document
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Show modal
        this.app.showModal('userProfileModal');
    }

    /**
     * Close user profile modal
     */
    closeProfileModal() {
        const modal = document.getElementById('userProfileModal');
        if (modal) {
            modal.remove();
        }
    }

    /**
     * Handle global click to close search results
     */
    handleGlobalClick(e) {
        const searchInput = document.getElementById('buddySearch');
        const resultsContainer = document.getElementById('searchResults');
        
        if (!e.target.closest('.ym7-search-box') && 
            !e.target.closest('.ym7-search-results') &&
            resultsContainer && 
            !resultsContainer.classList.contains('hidden')) {
            this.hideSearchResults();
        }
    }

    /**
     * Clear search
     */
    clearSearch() {
        const searchInput = document.getElementById('buddySearch');
        if (searchInput) {
            searchInput.value = '';
        }
        this.currentQuery = '';
        this.hideSearchResults();
    }

    /**
     * Get recent searches from localStorage
     */
    getRecentSearches() {
        try {
            return JSON.parse(localStorage.getItem('ym7_recent_searches') || '[]');
        } catch (error) {
            return [];
        }
    }

    /**
     * Save search to recent searches
     */
    saveRecentSearch(query) {
        if (!query || query.length < 2) return;
        
        try {
            const recentSearches = this.getRecentSearches();
            const updatedSearches = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
            localStorage.setItem('ym7_recent_searches', JSON.stringify(updatedSearches));
        } catch (error) {
            console.error('Error saving recent search:', error);
        }
    }

    /**
     * Show recent searches
     */
    showRecentSearches() {
        const recentSearches = this.getRecentSearches();
        if (recentSearches.length === 0) return;

        const resultsContainer = document.getElementById('searchResults');
        if (!resultsContainer) return;

        resultsContainer.innerHTML = `
            <div class="search-recent">
                <div class="search-recent-header">Recent Searches</div>
                ${recentSearches.map(query => `
                    <div class="search-recent-item" onclick="searchManager.performSearch('${query}')">
                        <span class="search-recent-query">${query}</span>
                        <button class="search-recent-remove" onclick="event.stopPropagation(); searchManager.removeRecentSearch('${query}')">×</button>
                    </div>
                `).join('')}
            </div>
        `;

        this.showSearchResults();
    }

    /**
     * Remove recent search
     */
    removeRecentSearch(query) {
        try {
            const recentSearches = this.getRecentSearches();
            const updatedSearches = recentSearches.filter(s => s !== query);
            localStorage.setItem('ym7_recent_searches', JSON.stringify(updatedSearches));
            
            // Refresh recent searches display
            this.showRecentSearches();
        } catch (error) {
            console.error('Error removing recent search:', error);
        }
    }

    /**
     * Advanced search with filters
     */
    async advancedSearch(filters) {
        try {
            const queryParams = new URLSearchParams();
            
            if (filters.query) queryParams.append('query', filters.query);
            if (filters.status) queryParams.append('status', filters.status);
            if (filters.onlineOnly) queryParams.append('online_only', 'true');
            
            const response = await this.app.authenticatedFetch(`/api/users/search?${queryParams.toString()}`);
            
            if (response.ok) {
                const data = await response.json();
                return data.users || [];
            }
        } catch (error) {
            console.error('Advanced search error:', error);
        }
        return [];
    }
}

// Initialize search manager when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        if (window.app) {
            window.searchManager = new SearchManager(window.app);
        }
    }, 100);
});

/**
 * Global functions for search operations
 */
function performSearch(query) {
    if (window.searchManager) {
        window.searchManager.performSearch(query);
    }
}

function clearSearch() {
    if (window.searchManager) {
        window.searchManager.clearSearch();
    }
}

function showRecentSearches() {
    if (window.searchManager) {
        window.searchManager.showRecentSearches();
    }
}
