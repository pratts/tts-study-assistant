// Popup script
let currentState = null;

// === AUTH MODAL LOGIC ===
let authState = {
    loggedIn: false,
    username: null
};

function showModal(overlayId) {
    document.getElementById(overlayId).classList.add('active');
}
function hideModal(overlayId) {
    document.getElementById(overlayId).classList.remove('active');
}

function updateAuthLinks() {
    const links = document.querySelector('.auth-links');
    if (authState.loggedIn) {
        links.innerHTML = `<span class="welcome-msg">Welcome, <b>${authState.username}</b></span> <a href="#" class="auth-link" id="logout-link">Logout</a>`;
        document.getElementById('logout-link').onclick = (e) => {
            e.preventDefault();
            authState.loggedIn = false;
            authState.username = null;
            updateAuthLinks();
        };
    } else {
        links.innerHTML = `<a href="#" id="login-link" class="auth-link">Login</a><span class="auth-sep">|</span><a href="#" id="signup-link" class="auth-link">Sign Up</a>`;
        document.getElementById('login-link').onclick = (e) => { e.preventDefault(); showModal('login-modal-overlay'); };
        document.getElementById('signup-link').onclick = (e) => { e.preventDefault(); showModal('signup-modal-overlay'); };
    }
}

async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
    // Get current settings and state
    const data = await chrome.storage.sync.get(['settings']);
    const settings = data.settings || {};

    // Get TTS state
    const stateResponse = await chrome.runtime.sendMessage({ action: 'getState' });
    currentState = stateResponse.state;

    // Initialize UI
    updateUI(settings);
    updatePlaybackUI(currentState);

    // Setup event listeners
    setupEventListeners();

    // Listen for state updates
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'stateUpdate') {
            currentState = request.state;
            updatePlaybackUI(currentState);
        }
    });

    // Modal open/close
    document.getElementById('login-close').onclick = () => hideModal('login-modal-overlay');
    document.getElementById('signup-close').onclick = () => hideModal('signup-modal-overlay');

    // Click outside to close
    document.getElementById('login-modal-overlay').addEventListener('mousedown', (e) => {
        if (e.target === e.currentTarget) hideModal('login-modal-overlay');
    });
    document.getElementById('signup-modal-overlay').addEventListener('mousedown', (e) => {
        if (e.target === e.currentTarget) hideModal('signup-modal-overlay');
    });

    // Login form
    document.getElementById('login-form').onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        if (!email || !password) {
            alert('Please enter both email and password.');
            return;
        }
        const hashed = await sha256(password);
        // Demo: No alert, just update UI
        authState.loggedIn = true;
        authState.username = email.split('@')[0];
        hideModal('login-modal-overlay');
        updateAuthLinks();
    };
    // Signup form
    document.getElementById('signup-form').onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;
        if (!name || !email || !password) {
            alert('Please fill all fields.');
            return;
        }
        const hashed = await sha256(password);
        // Demo: No alert, just update UI
        authState.loggedIn = true;
        authState.username = name;
        hideModal('signup-modal-overlay');
        updateAuthLinks();
    };

    updateAuthLinks();
});

function updateUI(settings) {
    // Update sliders
    document.getElementById('rate-slider').value = settings.rate || 1.0;
    document.getElementById('pitch-slider').value = settings.pitch || 1.0;
    document.getElementById('volume-slider').value = settings.volume || 1.0;

    // Update value displays
    document.getElementById('rate-value').textContent = `${settings.rate || 1.0}x`;
    document.getElementById('pitch-value').textContent = settings.pitch || 1.0;
    document.getElementById('volume-value').textContent = `${Math.round((settings.volume || 1.0) * 100)}%`;

    // Update status
    const statusText = document.getElementById('status-text');
    const toggleButton = document.getElementById('toggle-button');

    if (settings.enabled !== false) {
        statusText.textContent = 'Active';
        statusText.className = 'status-active';
        toggleButton.textContent = 'Disable';
        toggleButton.className = 'btn btn-primary';
    } else {
        statusText.textContent = 'Disabled';
        statusText.className = 'status-inactive';
        toggleButton.textContent = 'Enable';
        toggleButton.className = 'btn btn-secondary';
    }
}

function updatePlaybackUI(state) {
    const playbackStatus = document.getElementById('playback-status');
    const playbackState = document.getElementById('playback-state');
    const playPauseButton = document.getElementById('play-pause-button');
    const queueInfo = document.getElementById('queue-info');
    const queueCount = document.getElementById('queue-count');

    if (state.isPlaying || state.isPaused) {
        playbackStatus.classList.remove('hidden');
        playPauseButton.classList.remove('hidden');

        if (state.isPlaying) {
            playbackState.textContent = 'Playing...';
            playPauseButton.textContent = 'Pause';
            playPauseButton.onclick = () => pauseSpeaking();
        } else if (state.isPaused) {
            playbackState.textContent = 'Paused';
            playPauseButton.textContent = 'Resume';
            playPauseButton.onclick = () => resumeSpeaking();
        }

        if (state.queue.length > 0) {
            queueInfo.classList.remove('hidden');
            queueCount.textContent = state.queue.length;
        } else {
            queueInfo.classList.add('hidden');
        }
    } else {
        playbackStatus.classList.add('hidden');
        playPauseButton.classList.add('hidden');
    }
}

function setupEventListeners() {
    // Rate slider
    document.getElementById('rate-slider').addEventListener('input', async (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('rate-value').textContent = `${value}x`;
        await updateSetting('rate', value);
    });

    // Pitch slider
    document.getElementById('pitch-slider').addEventListener('input', async (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('pitch-value').textContent = value;
        await updateSetting('pitch', value);
    });

    // Volume slider
    document.getElementById('volume-slider').addEventListener('input', async (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('volume-value').textContent = `${Math.round(value * 100)}%`;
        await updateSetting('volume', value);
    });

    // Stop button
    document.getElementById('stop-button').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'stop' });
    });

    // Toggle button
    document.getElementById('toggle-button').addEventListener('click', async () => {
        const data = await chrome.storage.sync.get(['settings']);
        const settings = data.settings || {};
        const newEnabled = !(settings.enabled !== false);

        await updateSetting('enabled', newEnabled);
        updateUI({ ...settings, enabled: newEnabled });
    });
}

async function updateSetting(key, value) {
    const data = await chrome.storage.sync.get(['settings']);
    const settings = data.settings || {};
    settings[key] = value;

    await chrome.storage.sync.set({ settings });
}

function pauseSpeaking() {
    chrome.runtime.sendMessage({ action: 'pause' });
}

function resumeSpeaking() {
    chrome.runtime.sendMessage({ action: 'resume' });
}