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

function updateAuthHeader() {
    const header = document.getElementById('auth-header');
    if (!header) return;
    if (authState.loggedIn) {
        header.innerHTML = `<span class="welcome-msg">Welcome, <b>${authState.username}</b></span> <button class="header-btn" id="logout-btn">Logout</button>`;
        document.getElementById('logout-btn').onclick = () => {
            authState.loggedIn = false;
            authState.username = null;
            updateAuthHeader();
        };
    } else {
        header.innerHTML = `<button class="header-btn" id="login-btn">Login</button> <button class="header-btn" id="signup-btn">Sign Up</button>`;
        document.getElementById('login-btn').onclick = () => showModal('login-modal-overlay');
        document.getElementById('signup-btn').onclick = () => showModal('signup-modal-overlay');
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

    // Setup event listeners
    setupEventListeners();

    // Listen for state updates
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'stateUpdate') {
            currentState = request.state;
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
        updateAuthHeader();
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
        updateAuthHeader();
    };

    updateAuthHeader();

    // === TTS DEMO FUNCTIONALITY ===
    let synth = window.speechSynthesis;
    let utterance = null;
    let ttsEnabled = true;
    let paused = false;

    // Sliders
    const volumeSlider = document.getElementById('volume-slider');
    const pitchSlider = document.getElementById('pitch-slider');
    const rateSlider = document.getElementById('rate-slider');
    const volumeValue = document.getElementById('volume-value');
    const pitchValue = document.getElementById('pitch-value');
    const rateValue = document.getElementById('rate-value');

    function updateSliderDisplays() {
        if (volumeValue) volumeValue.textContent = Math.round(volumeSlider.value * 100) + '%';
        if (pitchValue) pitchValue.textContent = parseFloat(pitchSlider.value).toFixed(2);
        if (rateValue) rateValue.textContent = parseFloat(rateSlider.value).toFixed(2) + 'x';
    }
    if (volumeSlider) volumeSlider.oninput = updateSliderDisplays;
    if (pitchSlider) pitchSlider.oninput = updateSliderDisplays;
    if (rateSlider) rateSlider.oninput = updateSliderDisplays;
    updateSliderDisplays();

    // Button grid logic
    const ttsControls = document.getElementById('tts-controls');
    const pauseBtn = document.getElementById('pause-btn');
    const resumeBtn = document.getElementById('resume-btn');
    const stopBtn = document.getElementById('stop-btn');
    const playBtn = document.getElementById('play-btn');
    const clearBtn = document.getElementById('clear-btn');

    let isPlaying = false;
    let isPaused = false;
    let demoUtterance = null;

    function updateButtonStates() {
        if (!currentState) return;
        ttsControls.style.display = '';
        // Play button: enable only if there is something in the queue or a current text
        const canPlay = (currentState.queue && currentState.queue.length > 0) || currentState.currentText;
        if (currentState.isPlaying && !currentState.isPaused) {
            playBtn.textContent = 'Pause';
            playBtn.disabled = false;
            pauseBtn.style.display = 'none';
            resumeBtn.style.display = 'none';
        } else {
            playBtn.textContent = 'Play';
            playBtn.disabled = !canPlay;
            pauseBtn.style.display = 'none';
            resumeBtn.style.display = 'none';
        }
        // Enable clear queue if there are items in the queue
        if (currentState.queue && currentState.queue.length > 0) {
            clearBtn.disabled = false;
        } else {
            clearBtn.disabled = true;
        }
        // Stop button always visible if playing or paused
        if (currentState.isPlaying || currentState.isPaused) {
            stopBtn.style.display = '';
        } else {
            stopBtn.style.display = 'none';
        }
    }

    function updateStatusDot() {
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.getElementById('status-text');
        if (!ttsEnabled) {
            statusDot.classList.add('disabled');
            statusText.classList.add('disabled');
        } else {
            statusDot.classList.remove('disabled');
            statusText.classList.remove('disabled');
        }
    }

    // Demo TTS (for popup only, not content script)
    function playDemoTTS() {
        if (!ttsEnabled) return;
        if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
        demoUtterance = new SpeechSynthesisUtterance('This is a demo of the Study Assistant TTS.');
        demoUtterance.volume = parseFloat(volumeSlider.value);
        demoUtterance.pitch = parseFloat(pitchSlider.value);
        demoUtterance.rate = parseFloat(rateSlider.value);
        demoUtterance.onstart = () => {
            isPlaying = true;
            isPaused = false;
            updateButtonStates();
        };
        demoUtterance.onpause = () => {
            isPaused = true;
            isPlaying = false;
            updateButtonStates();
        };
        demoUtterance.onresume = () => {
            isPaused = false;
            isPlaying = true;
            updateButtonStates();
        };
        demoUtterance.onend = () => {
            isPlaying = false;
            isPaused = false;
            updateButtonStates();
        };
        window.speechSynthesis.speak(demoUtterance);
    }

    pauseBtn.onclick = () => {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
            window.speechSynthesis.pause();
        }
    };
    resumeBtn.onclick = () => {
        if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
        }
    };
    stopBtn.onclick = () => {
        if (window.speechSynthesis.speaking || window.speechSynthesis.paused) {
            window.speechSynthesis.cancel();
        }
    };

    // Remove all speechSynthesis event listeners and polling
    // Instead, listen for stateUpdate messages from background
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'stateUpdate') {
            currentState = request.state;
            updateButtonStates();
        }
    });

    // Initial state
    updateButtonStates();
    updateStatusDot();

    document.getElementById('toggle-btn').onclick = () => {
        ttsEnabled = !ttsEnabled;
        const statusText = document.getElementById('status-text');
        if (statusText) {
            statusText.textContent = ttsEnabled ? 'Active' : 'Disabled';
        }
        document.getElementById('toggle-btn').textContent = ttsEnabled ? 'Disable TTS' : 'Enable TTS';
        updateStatusDot();
    };

    // Optionally, you can trigger playDemoTTS() from a button or event for demo.
    // playDemoTTS();

    playBtn.onclick = async () => {
        if (!currentState) return;
        if (currentState.isPlaying && !currentState.isPaused) {
            // Pause
            await chrome.runtime.sendMessage({ action: 'pause' });
        } else if (currentState.isPaused) {
            // Resume
            await chrome.runtime.sendMessage({ action: 'resume' });
        } else {
            // Play (resume or play current text)
            if (currentState.currentText) {
                await chrome.runtime.sendMessage({ action: 'speak', text: currentState.currentText });
            }
        }
    };
    stopBtn.onclick = async () => {
        await chrome.runtime.sendMessage({ action: 'stop' });
    };
    clearBtn.onclick = async () => {
        // Clear the queue and stop playback
        await chrome.runtime.sendMessage({ action: 'stop' });
    };
});

function updateUI(settings) {
    // Update sliders
    const rateSlider = document.getElementById('rate-slider');
    const pitchSlider = document.getElementById('pitch-slider');
    const volumeSlider = document.getElementById('volume-slider');
    if (rateSlider) rateSlider.value = settings.rate || 1.0;
    if (pitchSlider) pitchSlider.value = settings.pitch || 1.0;
    if (volumeSlider) volumeSlider.value = settings.volume || 1.0;

    // Update value displays
    const rateValue = document.getElementById('rate-value');
    const pitchValue = document.getElementById('pitch-value');
    const volumeValue = document.getElementById('volume-value');
    if (rateValue) rateValue.textContent = `${settings.rate || 1.0}x`;
    if (pitchValue) pitchValue.textContent = settings.pitch || 1.0;
    if (volumeValue) volumeValue.textContent = `${Math.round((settings.volume || 1.0) * 100)}%`;

    // Update status
    const statusText = document.getElementById('status-text');
    const toggleButton = document.getElementById('toggle-btn');
    if (!statusText) {
        console.warn("Element with id 'status-text' not found in DOM.");
    }
    if (!toggleButton) {
        console.warn("Element with id 'toggle-btn' not found in DOM.");
    }
    if (statusText && toggleButton) {
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
}

async function updateSetting(key, value) {
    const data = await chrome.storage.sync.get(['settings']);
    const settings = data.settings || {};
    settings[key] = value;

    await chrome.storage.sync.set({ settings });
}