import { ApiClient } from '../js/api-client.js';
import { API_URL, DASHBOARD_URL } from '../js/config.js';
const apiClient = new ApiClient();

let currentState = null;
let authState = {
    loggedIn: false,
    user: null
};

const API_BASE = API_URL;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadSettings();
    await loadSiteNotes();
    setupEventListeners();
    setupAuthListeners();

    // Get TTS state
    const stateResponse = await chrome.runtime.sendMessage({ action: 'getState' });
    currentState = stateResponse.state;
    updatePlayerControls();
});

// Auth Functions
async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join('');
}

async function checkAuth() {
    const auth = await chrome.storage.local.get(['access_token', 'refresh_token', 'user']);
    if (auth.access_token && auth.user) {
        authState.loggedIn = true;
        authState.user = auth.user;
    }
    updateAuthHeader();
}

function updateAuthHeader() {
    const header = document.getElementById('auth-header');

    if (authState.loggedIn) {
        header.innerHTML = `
            <div class="user-info">
                <span>${authState.user.name || authState.user.email}</span>
                <button id="profile-btn" title="Profile">👤</button>
                <button id="logout-btn" title="Logout">🚪</button>
            </div>
        `;

        // Add event listeners after creating elements
        document.getElementById('profile-btn').addEventListener('click', () => {
            chrome.tabs.create({ url: 'http://localhost:5173/' });
        });

        document.getElementById('logout-btn').addEventListener('click', async () => {
            await logout();
        });
    } else {
        header.innerHTML = `
            <button class="header-btn" id="login-btn">Login</button>
            <button class="header-btn" id="signup-btn">Sign Up</button>
        `;

        // Add event listeners after creating elements
        document.getElementById('login-btn').addEventListener('click', () => {
            showModal('login-modal-overlay');
        });

        document.getElementById('signup-btn').addEventListener('click', () => {
            showModal('signup-modal-overlay');
        });
    }
}

async function logout() {
    const auth = await chrome.storage.local.get(['refresh_token']);
    if (auth.refresh_token) {
        try {
            await fetch(`${API_BASE}/auth/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: auth.refresh_token })
            });
        } catch (e) {
            console.error('Logout error:', e);
        }
    }

    await chrome.storage.local.remove(['access_token', 'refresh_token', 'user']);
    authState.loggedIn = false;
    authState.user = null;
    updateAuthHeader();
    await loadSiteNotes();
}

// Modal Functions
function showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function hideModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Settings
async function loadSettings() {
    const data = await chrome.storage.sync.get(['settings']);
    const settings = data.settings || {};

    const rateSlider = document.getElementById('rate-slider');
    const rateValue = document.getElementById('rate-value');

    rateSlider.value = settings.rate || 1.0;
    rateValue.textContent = `${settings.rate || 1.0}x`;
}

// Site Notes
async function loadSiteNotes() {
    try {
        if (!authState.loggedIn) {
            document.getElementById('notes-section').classList.add('hidden');
            document.getElementById('empty-state').classList.remove('hidden');
            // Clear section title and carousel
            const sectionTitle = document.querySelector('#notes-section h3');
            if (sectionTitle) sectionTitle.textContent = '';
            document.getElementById('notes-carousel').innerHTML = '';
            return;
        }

        // Get current tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const currentUrl = new URL(tab.url);

        // Extract main domain (e.g., "edmingle.com" from "app.edmingle.com")
        const getMainDomain = (hostname) => {
            const parts = hostname.split('.');
            if (parts.length > 2) {
                // Handle subdomains - get last two parts for most domains
                // This handles: app.edmingle.com -> edmingle.com
                return parts.slice(-2).join('.');
            }
            return hostname;
        };

        const currentDomain = getMainDomain(currentUrl.hostname);

        // Get all notes for this domain
        const siteNotes = await apiClient.getNotes({ domain: currentDomain });

        // Update the section title to show domain, or clear if no notes
        const sectionTitle = document.querySelector('#notes-section h3');
        if (sectionTitle) {
            sectionTitle.textContent = siteNotes.length > 0 ? `Notes from this site.` : '';
        }

        displayNotes(siteNotes);
    } catch (error) {
        console.error('Failed to load notes:', error);
        document.getElementById('notes-section').classList.add('hidden');
        document.getElementById('empty-state').classList.remove('hidden');
        // Clear section title and carousel
        const sectionTitle = document.querySelector('#notes-section h3');
        if (sectionTitle) sectionTitle.textContent = '';
        document.getElementById('notes-carousel').innerHTML = '';
    }
}

function displayNotes(notes) {
    const carousel = document.getElementById('notes-carousel');
    const notesSection = document.getElementById('notes-section');
    const emptyState = document.getElementById('empty-state');

    if (notes.length === 0) {
        notesSection.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    notesSection.classList.remove('hidden');
    emptyState.classList.add('hidden');

    // Clear existing content
    carousel.innerHTML = '';

    // Create note cards
    notes.forEach(note => {
        const noteCard = document.createElement('div');
        noteCard.className = 'note-card';
        noteCard.id = `note-${note.id}`;

        const noteContent = document.createElement('div');
        noteContent.className = 'note-content';
        noteContent.textContent = truncateText(note.content, 120);

        // Show summary if exists
        if (note.summary) {
            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'note-summary';
            summaryDiv.innerHTML = `<strong>Summary:</strong> ${truncateText(note.summary, 100)}`;
            noteCard.appendChild(summaryDiv);
        }

        const noteSource = document.createElement('div');
        // noteSource.className = 'note-source';
        // noteSource.textContent = note.source_title || 'Untitled';

        const noteDate = document.createElement('div');
        noteDate.className = 'note-date';
        noteDate.textContent = formatDate(note.created_at);

        const noteActions = document.createElement('div');
        noteActions.className = 'note-actions';

        // Play button - plays full content
        const playBtn = document.createElement('button');
        playBtn.textContent = '🔊 Play';
        playBtn.addEventListener('click', async () => {
            await chrome.runtime.sendMessage({
                action: 'speak',
                text: note.content
            });
        });

        // Summary button - either play summary or generate it
        const summaryBtn = document.createElement('button');
        summaryBtn.className = 'summary-btn';

        if (note.summary) {
            // Has summary - play it
            summaryBtn.textContent = '📝 Play Summary';
            summaryBtn.addEventListener('click', async () => {
                await chrome.runtime.sendMessage({
                    action: 'speak',
                    text: note.summary
                });
            });
        } else {
            // No summary - generate it
            summaryBtn.textContent = '✨ Summarize';
            summaryBtn.addEventListener('click', async () => {
                await generateSummary(note.id, summaryBtn, noteCard);
            });
        }

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️ Delete';
        deleteBtn.addEventListener('click', async () => {
            if (confirm('Delete this note?')) {
                try {
                    await apiClient.deleteNote(note.id);
                    await loadSiteNotes();
                } catch (error) {
                    console.error('Failed to delete note:', error);
                }
            }
        });

        noteActions.appendChild(playBtn);
        noteActions.appendChild(summaryBtn);
        noteActions.appendChild(deleteBtn);

        noteCard.appendChild(noteContent);
        noteCard.appendChild(noteSource);
        noteCard.appendChild(noteDate);
        noteCard.appendChild(noteActions);

        carousel.appendChild(noteCard);
    });
}

async function generateSummary(noteId, button, noteCard) {
    try {
        // Show loading state
        const originalText = button.textContent;
        button.textContent = '⏳ Generating...';
        button.disabled = true;

        // Call API to generate summary
        const summaryResponse = await apiClient.summarize(noteId);

        // Update button to play summary
        button.textContent = '📝 Play Summary';
        button.disabled = false;

        // Remove old click listener
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);

        // Add new click listener for playing summary
        newButton.addEventListener('click', async () => {
            await chrome.runtime.sendMessage({
                action: 'speak',
                text: summaryResponse.summary || summaryResponse.content
            });
        });

        // Add summary to the note card UI
        const existingSummary = noteCard.querySelector('.note-summary');
        if (!existingSummary) {
            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'note-summary';
            summaryDiv.innerHTML = `<strong>Summary:</strong> ${truncateText(summaryResponse.summary || summaryResponse.content, 100)}`;

            // Insert after note content
            const noteContent = noteCard.querySelector('.note-content');
            noteContent.insertAdjacentElement('afterend', summaryDiv);
        }

        // Show success notification
        showToast('Summary generated successfully!');

    } catch (error) {
        console.error('Failed to generate summary:', error);
        button.textContent = originalText;
        button.disabled = false;
        showToast('Failed to generate summary', 'error');
    }
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function getDisplayDomain(domain) {
    if (domain === 'mhjfbmdgcfjbbpaeojofohoefgiehjai' || domain === 'local-file') {
        return 'Downloaded/Local file';
    }
    return domain;
}

// Player Controls
function updatePlayerControls() {
    const playerControls = document.getElementById('player-controls');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const nowPlaying = document.getElementById('now-playing');

    if (currentState && (currentState.isPlaying || currentState.isPaused)) {
        playerControls.classList.remove('hidden');

        if (currentState.isPlaying) {
            playPauseBtn.innerHTML = '⏸️ Pause';
        } else {
            playPauseBtn.innerHTML = '▶️ Resume';
        }

        if (currentState.currentText) {
            nowPlaying.textContent = truncateText(currentState.currentText, 50);
        }
    } else {
        playerControls.classList.add('hidden');
    }
}

// Event Listeners
function setupEventListeners() {
    document.getElementById('rate-slider').addEventListener('input', async (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('rate-value').textContent = `${value}x`;
        await updateSetting('rate', value);
    });

    // Player controls
    document.getElementById('play-pause-btn').addEventListener('click', async () => {
        if (currentState.isPlaying) {
            await chrome.runtime.sendMessage({ action: 'pause' });
        } else {
            await chrome.runtime.sendMessage({ action: 'resume' });
        }
    });

    document.getElementById('stop-btn').addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ action: 'stop' });
    });

    // View all notes
    document.getElementById('view-all-notes').addEventListener('click', () => {
        chrome.tabs.create({ url: `${DASHBOARD_URL}/notes` });
    });

    // Listen for state updates
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'stateUpdate') {
            currentState = request.state;
            updatePlayerControls();
        }
    });
}

function setupAuthListeners() {
    // Modal close buttons
    document.getElementById('login-close').addEventListener('click', () => {
        hideModal('login-modal-overlay');
    });

    document.getElementById('signup-close').addEventListener('click', () => {
        hideModal('signup-modal-overlay');
    });

    // Click outside to close
    document.getElementById('login-modal-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) hideModal('login-modal-overlay');
    });

    document.getElementById('signup-modal-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) hideModal('signup-modal-overlay');
    });

    // Login form
    document.getElementById('login-form').onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        try {
            const hashed = await sha256(password);
            const resp = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password: hashed, source: 'extension' })
            });

            const data = await resp.json();
            if (!resp.ok) throw new Error(data.message);

            await chrome.storage.local.set({
                access_token: data.data.access_token,
                refresh_token: data.data.refresh_token,
                user: data.data.user
            });

            authState.loggedIn = true;
            authState.user = data.data.user;

            hideModal('login-modal-overlay');
            updateAuthHeader();
            await loadSiteNotes();
        } catch (err) {
            alert(err.message || 'Login failed');
        }
    };

    // Signup form
    document.getElementById('signup-form').onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;

        try {
            const hashed = await sha256(password);
            const resp = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password: hashed })
            });

            const data = await resp.json();
            if (!resp.ok) throw new Error(data.message);

            await chrome.storage.local.set({
                access_token: data.data.access_token,
                refresh_token: data.data.refresh_token,
                user: data.data.user
            });

            authState.loggedIn = true;
            authState.user = data.data.user;

            hideModal('signup-modal-overlay');
            updateAuthHeader();
            await loadSiteNotes();
        } catch (err) {
            alert(err.message || 'Signup failed');
        }
    };
}

// Helper Functions
async function updateSetting(key, value) {
    const data = await chrome.storage.sync.get(['settings']);
    const settings = data.settings || {};
    settings[key] = value;
    await chrome.storage.sync.set({ settings });
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substr(0, maxLength) + '...';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
}

function escapeQuotes(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// Add privacy policy button at the end of the popup
const privacyBtn = document.createElement('button');
privacyBtn.textContent = '🔒 Privacy Policy';
privacyBtn.style.marginTop = '16px';
privacyBtn.style.background = 'none';
privacyBtn.style.border = 'none';
privacyBtn.style.color = '#2563eb';
privacyBtn.style.cursor = 'pointer';
privacyBtn.style.fontSize = '14px';
privacyBtn.onclick = () => {
    window.open(`${DASHBOARD_URL}/privacy-policy`, '_blank');
};
document.body.appendChild(privacyBtn);
