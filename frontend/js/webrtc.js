/**
 * YM7 Hobby - WebRTC Voice/Video Calls
 * Handles peer-to-peer voice and video calling functionality
 */

class WebRTCManager {
    constructor(app) {
        this.app = app;
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.dataChannel = null;
        this.currentCall = null;
        this.iceCandidates = [];
        this.setupWebRTCEventListeners();
        
        // WebRTC configuration
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
    }

    /**
     * Setup WebRTC event listeners
     */
    setupWebRTCEventListeners() {
        // Call buttons in chat windows will be setup dynamically
    }

    /**
     * Initialize a call with a buddy
     */
    async initiateCall(buddyId, callType = 'audio') {
        if (this.currentCall) {
            this.app.showNotification('You are already in a call', 'warning');
            return;
        }

        try {
            this.app.showLoading('Starting call...');
            
            // Get user media
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: callType === 'video'
            });

            // Create peer connection
            this.createPeerConnection();

            // Add local stream to peer connection
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            // Create data channel for call metadata
            this.dataChannel = this.peerConnection.createDataChannel('callData');
            this.setupDataChannel();

            // Create and send offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            // Send call invitation via WebSocket
            this.sendCallInvitation(buddyId, offer, callType);

            // Setup current call state
            this.currentCall = {
                buddyId: buddyId,
                callType: callType,
                status: 'calling',
                startTime: new Date(),
                isInitiator: true
            };

            this.showCallInterface();
            this.app.hideLoading();

        } catch (error) {
            console.error('Error initiating call:', error);
            this.app.showNotification('Failed to start call', 'error');
            this.cleanupCall();
            this.app.hideLoading();
        }
    }

    /**
     * Create peer connection
     */
    createPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.rtcConfig);

        // Handle incoming tracks
        this.peerConnection.ontrack = (event) => {
            this.remoteStream = event.streams[0];
            this.setupRemoteMedia();
        };

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendICECandidate(event.candidate);
            }
        };

        // Handle connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
            
            switch (this.peerConnection.connectionState) {
                case 'connected':
                    this.handleCallConnected();
                    break;
                case 'disconnected':
                case 'failed':
                    this.handleCallFailed();
                    break;
                case 'closed':
                    this.handleCallEnded();
                    break;
            }
        };

        // Handle data channel
        this.peerConnection.ondatachannel = (event) => {
            this.dataChannel = event.channel;
            this.setupDataChannel();
        };
    }

    /**
     * Setup data channel for call metadata
     */
    setupDataChannel() {
        if (!this.dataChannel) return;

        this.dataChannel.onopen = () => {
            console.log('Data channel opened');
            this.sendCallMetadata();
        };

        this.dataChannel.onmessage = (event) => {
            this.handleDataChannelMessage(event.data);
        };

        this.dataChannel.onclose = () => {
            console.log('Data channel closed');
        };
    }

    /**
     * Send call invitation via WebSocket
     */
    sendCallInvitation(buddyId, offer, callType) {
        if (this.app.ws && this.app.isConnected) {
            this.app.ws.send(JSON.stringify({
                type: 'call_invitation',
                toUserId: buddyId,
                offer: offer,
                callType: callType
            }));
        }
    }

    /**
     * Send ICE candidate via WebSocket
     */
    sendICECandidate(candidate) {
        if (this.app.ws && this.app.isConnected && this.currentCall) {
            this.app.ws.send(JSON.stringify({
                type: 'ice_candidate',
                toUserId: this.currentCall.buddyId,
                candidate: candidate
            }));
        }
    }

    /**
     * Handle incoming call invitation
     */
    async handleCallInvitation(message) {
        if (this.currentCall) {
            // Busy - send busy signal
            this.sendCallResponse(message.fromUserId, 'busy');
            return;
        }

        // Show incoming call interface
        this.showIncomingCallInterface(message);
    }

    /**
     * Show incoming call interface
     */
    showIncomingCallInterface(message) {
        const caller = this.app.buddies.find(b => b.id === message.fromUserId);
        if (!caller) return;

        // Create incoming call modal
        const modalHtml = `
            <div class="ym7-modal" id="incomingCallModal">
                <div class="ym7-modal-content incoming-call-modal">
                    <div class="incoming-call-header">
                        <div class="call-type-icon">${message.callType === 'video' ? '📹' : '📞'}</div>
                        <h3>Incoming ${message.callType} Call</h3>
                    </div>
                    <div class="incoming-call-body">
                        <div class="caller-info">
                            <div class="caller-avatar">${this.getAvatarInitials(caller.display_name)}</div>
                            <div class="caller-details">
                                <div class="caller-name">${caller.display_name}</div>
                                <div class="caller-status">${message.callType} call</div>
                            </div>
                        </div>
                    </div>
                    <div class="incoming-call-actions">
                        <button class="ym7-btn ym7-btn-danger" onclick="webrtcManager.rejectCall(${message.fromUserId})">
                            Decline
                        </button>
                        <button class="ym7-btn ym7-btn-success" onclick="webrtcManager.acceptCall(${message.fromUserId}, '${message.callType}', ${JSON.stringify(message.offer).replace(/"/g, '&quot;')})">
                            Accept
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Store call info for later use
        this.pendingCall = {
            fromUserId: message.fromUserId,
            callType: message.callType,
            offer: message.offer
        };

        // Play ringtone
        this.playRingtone();
    }

    /**
     * Accept incoming call
     */
    async acceptCall(fromUserId, callType, offer) {
        this.stopRingtone();
        this.closeIncomingCallModal();

        try {
            this.app.showLoading('Connecting call...');

            // Get user media
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: callType === 'video'
            });

            // Create peer connection
            this.createPeerConnection();

            // Add local stream
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            // Set remote description
            await this.peerConnection.setRemoteDescription(offer);

            // Create and send answer
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            // Send answer
            this.sendCallResponse(fromUserId, 'accepted', answer);

            // Setup current call
            this.currentCall = {
                buddyId: fromUserId,
                callType: callType,
                status: 'connecting',
                startTime: new Date(),
                isInitiator: false
            };

            this.showCallInterface();
            this.app.hideLoading();

        } catch (error) {
            console.error('Error accepting call:', error);
            this.app.showNotification('Failed to accept call', 'error');
            this.cleanupCall();
            this.app.hideLoading();
        }
    }

    /**
     * Reject incoming call
     */
    rejectCall(fromUserId) {
        this.stopRingtone();
        this.closeIncomingCallModal();
        this.sendCallResponse(fromUserId, 'rejected');
    }

    /**
     * Send call response
     */
    sendCallResponse(toUserId, response, answer = null) {
        if (this.app.ws && this.app.isConnected) {
            this.app.ws.send(JSON.stringify({
                type: 'call_response',
                toUserId: toUserId,
                response: response,
                answer: answer
            }));
        }
    }

    /**
     * Handle call response
     */
    async handleCallResponse(message) {
        if (!this.currentCall) return;

        switch (message.response) {
            case 'accepted':
                await this.peerConnection.setRemoteDescription(message.answer);
                break;
            case 'rejected':
                this.app.showNotification('Call was rejected', 'warning');
                this.cleanupCall();
                break;
            case 'busy':
                this.app.showNotification('User is busy', 'warning');
                this.cleanupCall();
                break;
        }
    }

    /**
     * Handle ICE candidate from remote peer
     */
    async handleICECandidate(message) {
        if (this.peerConnection && this.currentCall) {
            try {
                await this.peerConnection.addIceCandidate(message.candidate);
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
            }
        }
    }

    /**
     * Show call interface
     */
    showCallInterface() {
        const buddy = this.app.buddies.find(b => b.id === this.currentCall.buddyId);
        if (!buddy) return;

        const callHtml = `
            <div class="ym7-modal call-interface" id="callInterface">
                <div class="ym7-modal-content call-modal">
                    <div class="call-header">
                        <div class="call-status" id="callStatus">Connecting...</div>
                        <div class="call-timer" id="callTimer">00:00</div>
                    </div>
                    <div class="call-body">
                        <div class="video-container">
                            <div class="remote-video-container">
                                <video id="remoteVideo" autoplay playsinline></video>
                                <div class="remote-user-info">
                                    <div class="remote-avatar">${this.getAvatarInitials(buddy.display_name)}</div>
                                    <div class="remote-name">${buddy.display_name}</div>
                                </div>
                            </div>
                            <div class="local-video-container">
                                <video id="localVideo" autoplay playsinline muted></video>
                            </div>
                        </div>
                        <div class="call-controls">
                            <button class="call-control-btn mic-toggle" onclick="webrtcManager.toggleMicrophone()">
                                <span class="call-control-icon">🎤</span>
                                <span class="call-control-text">Mute</span>
                            </button>
                            <button class="call-control-btn camera-toggle" onclick="webrtcManager.toggleCamera()">
                                <span class="call-control-icon">📹</span>
                                <span class="call-control-text">Camera</span>
                            </button>
                            <button class="call-control-btn end-call" onclick="webrtcManager.endCall()">
                                <span class="call-control-icon">📞</span>
                                <span class="call-control-text">End</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', callHtml);
        
        // Setup media elements
        this.setupLocalMedia();
        if (this.remoteStream) {
            this.setupRemoteMedia();
        }

        // Start call timer
        this.startCallTimer();
    }

    /**
     * Setup local media element
     */
    setupLocalMedia() {
        const localVideo = document.getElementById('localVideo');
        if (localVideo && this.localStream) {
            localVideo.srcObject = this.localStream;
        }
    }

    /**
     * Setup remote media element
     */
    setupRemoteMedia() {
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo && this.remoteStream) {
            remoteVideo.srcObject = this.remoteStream;
        }
    }

    /**
     * Start call timer
     */
    startCallTimer() {
        this.callTimer = setInterval(() => {
            if (this.currentCall && this.currentCall.startTime) {
                const elapsed = Math.floor((new Date() - this.currentCall.startTime) / 1000);
                const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
                const seconds = (elapsed % 60).toString().padStart(2, '0');
                
                const timerElement = document.getElementById('callTimer');
                if (timerElement) {
                    timerElement.textContent = `${minutes}:${seconds}`;
                }
            }
        }, 1000);
    }

    /**
     * Handle call connected
     */
    handleCallConnected() {
        this.currentCall.status = 'connected';
        
        const statusElement = document.getElementById('callStatus');
        if (statusElement) {
            statusElement.textContent = 'Connected';
        }
        
        this.app.showNotification('Call connected', 'success');
    }

    /**
     * Handle call failed
     */
    handleCallFailed() {
        this.app.showNotification('Call failed', 'error');
        this.cleanupCall();
    }

    /**
     * Handle call ended
     */
    handleCallEnded() {
        this.cleanupCall();
    }

    /**
     * End current call
     */
    endCall() {
        // Send call end signal
        if (this.app.ws && this.app.isConnected && this.currentCall) {
            this.app.ws.send(JSON.stringify({
                type: 'call_end',
                toUserId: this.currentCall.buddyId
            }));
        }

        this.cleanupCall();
        this.app.showNotification('Call ended', 'info');
    }

    /**
     * Handle call end from remote peer
     */
    handleCallEnd() {
        this.cleanupCall();
        this.app.showNotification('Call ended by other user', 'info');
    }

    /**
     * Cleanup call resources
     */
    cleanupCall() {
        // Stop media tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // Clear data channel
        this.dataChannel = null;

        // Stop timer
        if (this.callTimer) {
            clearInterval(this.callTimer);
            this.callTimer = null;
        }

        // Close call interfaces
        this.closeCallInterface();
        this.closeIncomingCallModal();

        // Stop ringtone
        this.stopRingtone();

        // Clear current call
        this.currentCall = null;
        this.pendingCall = null;
    }

    /**
     * Close call interface
     */
    closeCallInterface() {
        const callInterface = document.getElementById('callInterface');
        if (callInterface) {
            callInterface.remove();
        }
    }

    /**
     * Close incoming call modal
     */
    closeIncomingCallModal() {
        const incomingCallModal = document.getElementById('incomingCallModal');
        if (incomingCallModal) {
            incomingCallModal.remove();
        }
    }

    /**
     * Toggle microphone
     */
    toggleMicrophone() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                
                const micBtn = document.querySelector('.mic-toggle');
                if (micBtn) {
                    const text = micBtn.querySelector('.call-control-text');
                    if (text) {
                        text.textContent = audioTrack.enabled ? 'Mute' : 'Unmute';
                    }
                }
                
                this.app.showNotification(audioTrack.enabled ? 'Microphone on' : 'Microphone muted', 'info');
            }
        }
    }

    /**
     * Toggle camera
     */
    toggleCamera() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                
                const cameraBtn = document.querySelector('.camera-toggle');
                if (cameraBtn) {
                    const text = cameraBtn.querySelector('.call-control-text');
                    if (text) {
                        text.textContent = videoTrack.enabled ? 'Camera Off' : 'Camera On';
                    }
                }
                
                this.app.showNotification(videoTrack.enabled ? 'Camera on' : 'Camera off', 'info');
            }
        }
    }

    /**
     * Play ringtone for incoming calls
     */
    playRingtone() {
        // Create audio context for ringtone
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            
            // Pulsing effect
            gainNode.gain.exponentialRampToValueAtTime(0.1, audioContext.currentTime + 0.5);
            gainNode.gain.exponentialRampToValueAtTime(0.3, audioContext.currentTime + 1);
            
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 2);
            
            // Repeat every 2 seconds
            this.ringtoneInterval = setInterval(() => {
                const newOscillator = audioContext.createOscillator();
                const newGain = audioContext.createGain();
                
                newOscillator.connect(newGain);
                newGain.connect(audioContext.destination);
                
                newOscillator.type = 'sine';
                newOscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                newGain.gain.setValueAtTime(0.3, audioContext.currentTime);
                newGain.gain.exponentialRampToValueAtTime(0.1, audioContext.currentTime + 0.5);
                newGain.gain.exponentialRampToValueAtTime(0.3, audioContext.currentTime + 1);
                
                newOscillator.start();
                newOscillator.stop(audioContext.currentTime + 2);
            }, 2000);
            
        } catch (error) {
            console.error('Error playing ringtone:', error);
        }
    }

    /**
     * Stop ringtone
     */
    stopRingtone() {
        if (this.ringtoneInterval) {
            clearInterval(this.ringtoneInterval);
            this.ringtoneInterval = null;
        }
    }

    /**
     * Send call metadata over data channel
     */
    sendCallMetadata() {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            const metadata = {
                type: 'call_metadata',
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString()
            };
            this.dataChannel.send(JSON.stringify(metadata));
        }
    }

    /**
     * Handle data channel messages
     */
    handleDataChannelMessage(data) {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'call_metadata':
                    console.log('Received call metadata:', message);
                    break;
                case 'user_action':
                    this.handleUserAction(message);
                    break;
            }
        } catch (error) {
            console.error('Error parsing data channel message:', error);
        }
    }

    /**
     * Handle user actions from data channel
     */
    handleUserAction(message) {
        // Handle various user actions during call
        console.log('User action:', message);
    }

    /**
     * Get avatar initials
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
     * Handle WebRTC messages from WebSocket
     */
    handleWebRTCMessage(message) {
        switch (message.type) {
            case 'call_invitation':
                this.handleCallInvitation(message);
                break;
            case 'call_response':
                this.handleCallResponse(message);
                break;
            case 'ice_candidate':
                this.handleICECandidate(message);
                break;
            case 'call_end':
                this.handleCallEnd();
                break;
        }
    }
}

// Initialize WebRTC manager when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        if (window.app) {
            window.webrtcManager = new WebRTCManager(window.app);
            
            // Extend app to handle WebRTC messages
            const originalHandleMessage = window.app.handleWebSocketMessage;
            window.app.handleWebSocketMessage = function(message) {
                if (message.type && message.type.startsWith('call_') || message.type === 'ice_candidate') {
                    window.webrtcManager.handleWebRTCMessage(message);
                } else {
                    originalHandleMessage.call(this, message);
                }
            };
        }
    }, 100);
});

/**
 * Global functions for WebRTC operations
 */
function startVoiceCall(buddyId) {
    if (window.webrtcManager) {
        window.webrtcManager.initiateCall(buddyId, 'audio');
    }
}

function startVideoCall(buddyId) {
    if (window.webrtcManager) {
        window.webrtcManager.initiateCall(buddyId, 'video');
    }
}

function endCall() {
    if (window.webrtcManager) {
        window.webrtcManager.endCall();
    }
}

function toggleMicrophone() {
    if (window.webrtcManager) {
        window.webrtcManager.toggleMicrophone();
    }
}

function toggleCamera() {
    if (window.webrtcManager) {
        window.webrtcManager.toggleCamera();
    }
}
