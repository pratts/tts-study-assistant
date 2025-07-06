// Content script - runs on every page
console.log('TTS Study Assistant - Content script loaded');

// State management
let isEnabled = true;
let selectedText = '';
let selectionTimeout = null;
let tooltip = null;

// Initialize
(async function init() {
    // Get initial settings
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    if (response && response.enabled !== undefined) {
        isEnabled = response.enabled;
    }

    // Setup event listeners
    setupEventListeners();

    // Create tooltip element
    createTooltip();
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

    tooltip.appendChild(speakButton);
    document.body.appendChild(tooltip);
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

// Speak selected text
async function speakSelectedText() {
    if (!selectedText) {
        const selection = window.getSelection();
        selectedText = selection.toString().trim();
    }

    if (selectedText) {
        // Send to background script
        chrome.runtime.sendMessage({
            action: 'speak',
            text: selectedText,
            options: {}
        });

        // Hide tooltip after speaking starts
        hideTooltip();

        // Clear selection (optional - remove if you want to keep selection)
        // window.getSelection().removeAllRanges();
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