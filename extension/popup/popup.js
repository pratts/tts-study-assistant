// Popup script
let currentState = null;

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