// Popup script
document.addEventListener('DOMContentLoaded', async () => {
    // Get current settings
    const data = await chrome.storage.sync.get(['settings']);
    const settings = data.settings || {};

    // Initialize UI with current settings
    updateUI(settings);

    // Setup event listeners
    setupEventListeners();
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
        statusText.textContent = 'Inactive';
        statusText.className = 'status-inactive';
        toggleButton.textContent = 'Enable';
        toggleButton.className = 'btn btn-secondary';
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