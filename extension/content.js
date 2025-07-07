// Content script - runs on every page
console.log('TTS Study Assistant - Content script loaded');

// State management
let isEnabled = true;
let selectedText = '';
let selectionTimeout = null;
let tooltip = null;
let queueDialog = null;

// Initialize
(async function init() {
    // Get initial settings
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
        if (response && response.enabled !== undefined) {
            isEnabled = response.enabled;
        }
    } catch (e) {
        console.log('Settings not loaded:', e);
    }

    // Setup event listeners
    setupEventListeners();

    // Create UI elements
    createTooltip();
    createQueueDialog();
})();

// Setup event listeners
function setupEventListeners() {
    // Mouse selection
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);

    // Touch selection (for tablets)
    document.addEventListener('touchend', handleMouseUp);

    // Selection change
    document.addEventListener('selectionchange', handleSelectionChange);

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'speakSelection') {
            speakSelectedText();
        }
    });

    // Storage change listener for settings
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync' && changes.settings) {
            const newSettings = changes.settings.newValue;
            isEnabled = newSettings.enabled !== false;
            console.log('Settings updated, enabled:', isEnabled);
        }
    });
}

// Handle mouse up event
function handleMouseUp(event) {
    // Clear any existing timeout
    if (selectionTimeout) {
        clearTimeout(selectionTimeout);
    }

    // Check for text selection after a short delay
    selectionTimeout = setTimeout(() => {
        checkForSelection(event);
    }, 10);
}

// Handle mouse down event
function handleMouseDown(event) {
    // Hide tooltip when user clicks
    if (tooltip && !tooltip.contains(event.target)) {
        hideTooltip();
    }

    // Hide queue dialog when user clicks outside
    if (queueDialog && !queueDialog.contains(event.target)) {
        hideQueueDialog();
    }
}

// Check for text selection
function checkForSelection(event) {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 0 && isEnabled) {
        selectedText = text;
        showTooltip(selection);
    } else {
        hideTooltip();
    }
}

// Handle selection change
function handleSelectionChange() {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length === 0) {
        hideTooltip();
    }
}

// Create tooltip element
function createTooltip() {
    // Create container
    tooltip = document.createElement('div');
    tooltip.id = 'tts-tooltip';
    tooltip.className = 'tts-tooltip hidden';

    // Create speak button
    const speakButton = document.createElement('button');
    speakButton.className = 'tts-speak-button';
    speakButton.innerHTML = '🔊';
    speakButton.title = 'Speak selected text (Ctrl+Shift+S)';
    speakButton.addEventListener('click', speakSelectedText);


    // ADD SAVE BUTTON
    const saveButton = document.createElement('button');
    saveButton.className = 'tts-save-button';
    saveButton.innerHTML = '📝';
    saveButton.title = 'Save as note';
    saveButton.addEventListener('click', saveSelectedNote);

    tooltip.appendChild(speakButton);
    tooltip.appendChild(saveButton);
    document.body.appendChild(tooltip);
}

// Create queue dialog
function createQueueDialog() {
    queueDialog = document.createElement('div');
    queueDialog.id = 'tts-queue-dialog';
    queueDialog.className = 'tts-queue-dialog hidden';
    queueDialog.innerHTML = `
    <div class="tts-dialog-content">
      <h3>Text already playing</h3>
      <p>What would you like to do with the new selection?</p>
      <div class="tts-dialog-buttons">
        <button id="tts-append">Add to Queue</button>
        <button id="tts-replace">Replace Current</button>
        <button id="tts-cancel">Cancel</button>
      </div>
    </div>
  `;

    document.body.appendChild(queueDialog);

    // Add event listeners
    document.getElementById('tts-append').addEventListener('click', () => {
        appendToQueue();
    });

    document.getElementById('tts-replace').addEventListener('click', () => {
        replaceQueue();
    });

    document.getElementById('tts-cancel').addEventListener('click', () => {
        hideQueueDialog();
    });
}

// Show tooltip near selection
function showTooltip(selection) {
    if (!tooltip || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Position tooltip above selection
    const tooltipHeight = 40;
    const padding = 5;

    tooltip.style.left = `${rect.left + rect.width / 2}px`;
    tooltip.style.top = `${rect.top + window.scrollY - tooltipHeight - padding}px`;

    // Show tooltip
    tooltip.classList.remove('hidden');

    // Ensure tooltip is within viewport
    const tooltipRect = tooltip.getBoundingClientRect();
    if (tooltipRect.left < 0) {
        tooltip.style.left = '10px';
    } else if (tooltipRect.right > window.innerWidth) {
        tooltip.style.left = `${window.innerWidth - tooltipRect.width - 10}px`;
    }

    if (tooltipRect.top < 0) {
        // Position below selection if no room above
        tooltip.style.top = `${rect.bottom + window.scrollY + padding}px`;
    }
}

// Hide tooltip
function hideTooltip() {
    if (tooltip) {
        tooltip.classList.add('hidden');
    }
}

// Show queue dialog
function showQueueDialog() {
    if (queueDialog) {
        queueDialog.classList.remove('hidden');
    }
}

// Hide queue dialog
function hideQueueDialog() {
    if (queueDialog) {
        queueDialog.classList.add('hidden');
    }
}

// Speak selected text
let ttsRequestInProgress = false;
async function speakSelectedText() {
    if (!isEnabled) {
        console.log('TTS is disabled');
        return;
    }

    if (!selectedText) {
        const selection = window.getSelection();
        selectedText = selection.toString().trim();
    }

    if (selectedText) {
        try {
            // Prevent double-speaking: only send if not already in progress
            if (ttsRequestInProgress) return;
            ttsRequestInProgress = true;
            // Send to background script
            const response = await chrome.runtime.sendMessage({
                action: 'speak',
                text: selectedText,
                options: {}
            });
            // Handle queue decision
            if (response.status === 'queue_decision_needed') {
                showQueueDialog();
            } else {
                // Hide tooltip after speaking starts
                hideTooltip();
            }
            await saveNoteInBackground(selectedText);

            // Clear selectedText to avoid repeat
            selectedText = '';
            setTimeout(() => { ttsRequestInProgress = false; }, 1000);
        } catch (e) {
            console.error('Error sending message:', e);
            ttsRequestInProgress = false;
        }
    }
}

// Append to queue
async function appendToQueue() {
    if (selectedText) {
        await chrome.runtime.sendMessage({
            action: 'appendToQueue',
            text: selectedText
        });

        hideQueueDialog();
        hideTooltip();
    }
}

// Replace queue
async function replaceQueue() {
    if (selectedText) {
        await chrome.runtime.sendMessage({
            action: 'replaceQueue',
            text: selectedText
        });

        hideQueueDialog();
        hideTooltip();
    }
}

// Utility function to check if element is editable
function isEditableElement(element) {
    const editableTags = ['INPUT', 'TEXTAREA'];

    if (editableTags.includes(element.tagName)) {
        return true;
    }

    if (element.contentEditable === 'true') {
        return true;
    }

    return false;
}

async function saveNoteInBackground(text) {
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'saveNote',
            noteData: {
                content: text,
                source_url: window.location.href,
                source_title: document.title
            }
        });

        if (response.success) {
            showNotification('Note saved!');
        } else if (response.error === 'NOT_AUTHENTICATED') {
            showAuthPrompt();
        }
    } catch (error) {
        console.error('Failed to save note:', error);
    }
}

async function saveSelectedNote() {
    if (!selectedText) {
        const selection = window.getSelection();
        selectedText = selection.toString().trim();
    }

    if (selectedText) {
        await saveNoteInBackground(selectedText);
        hideTooltip();
    }
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'tts-notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Show auth prompt
function showAuthPrompt() {
    const prompt = document.createElement('div');
    prompt.className = 'tts-auth-prompt';
    prompt.innerHTML = `
    <div class="tts-auth-content">
      <p>Please login to save notes</p>
      <button id="tts-login-btn">Login</button>
      <button id="tts-close-btn">Close</button>
    </div>
  `;

    document.body.appendChild(prompt);

    document.getElementById('tts-login-btn').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'openPopup' });
        prompt.remove();
    });

    document.getElementById('tts-close-btn').addEventListener('click', () => {
        prompt.remove();
    });
}