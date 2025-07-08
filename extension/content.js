// Content script - runs on every page
console.log('TTS Study Assistant - Content script loaded');

// State management
let isEnabled = true;
let selectedText = '';
let actionButton = null;

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

    // Create action button for PDFs and iframes
    createActionButton();
})();

// Create minimal action button
function createActionButton() {
    actionButton = document.createElement('div');
    actionButton.id = 'tts-action-button';
    actionButton.className = 'tts-action-button hidden';

    // Use text instead of emoji
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save & Play';
    saveBtn.className = 'tts-btn';

    actionButton.appendChild(saveBtn);

    saveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();

        if (selectedText) {
            // Save note first
            const saveResponse = await chrome.runtime.sendMessage({
                action: 'saveNote',
                noteData: {
                    content: selectedText,
                    source_url: window.location.href,
                    source_title: document.title || 'PDF Document'
                }
            });

            // Then play the selected text (not the button text!)
            await chrome.runtime.sendMessage({
                action: 'speak',
                text: selectedText,  // This is the important part
                options: {}
            });

            hideActionButton();

            // Clear selection
            window.getSelection().removeAllRanges();
        }
    });

    document.body.appendChild(actionButton);
}

// Show action button near selection
function showActionButton(x, y) {
    if (!actionButton || !isEnabled) return;

    // Ensure button stays within viewport
    const buttonWidth = 100;
    const buttonHeight = 35;

    let left = x + 10;
    let top = y - buttonHeight - 5;

    // Adjust if too close to edges
    if (left + buttonWidth > window.innerWidth) {
        left = window.innerWidth - buttonWidth - 10;
    }

    if (top < 10) {
        top = y + 20;
    }

    actionButton.style.left = `${left}px`;
    actionButton.style.top = `${top}px`;
    actionButton.classList.remove('hidden');
}

// Hide action button
function hideActionButton() {
    if (actionButton) {
        actionButton.classList.add('hidden');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Mouse selection
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', (e) => {
        // Don't hide if clicking on the button itself
        if (!actionButton?.contains(e.target)) {
            hideActionButton();
        }
    });

    // Selection change
    document.addEventListener('selectionchange', () => {
        const selection = window.getSelection();
        const text = selection.toString().trim();

        if (text.length === 0) {
            hideActionButton();
            selectedText = '';
        }
    });

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'getSelection') {
            const selection = window.getSelection();
            const text = selection.toString().trim();
            sendResponse({ text: text });
            return true;
        }

        if (request.action === 'playText') {
            chrome.runtime.sendMessage({
                action: 'speak',
                text: request.text,
                options: {}
            });
        }
    });

    // Storage change listener for settings
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync' && changes.settings) {
            const newSettings = changes.settings.newValue;
            isEnabled = newSettings.enabled !== false;
            if (!isEnabled) {
                hideActionButton();
            }
        }
    });
}

// Handle mouse up event
function handleMouseUp(event) {
    // Skip if clicking on our button
    if (actionButton?.contains(event.target)) {
        return;
    }

    setTimeout(() => {
        const selection = window.getSelection();
        const text = selection.toString().trim();

        if (text.length > 0 && isEnabled) {
            selectedText = text;

            // Always show button for any selection (not just PDFs)
            // This ensures it works everywhere
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            showActionButton(
                rect.left + rect.width / 2,
                rect.top + window.scrollY
            );
        }
    }, 10);
}