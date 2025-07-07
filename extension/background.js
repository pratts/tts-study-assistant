// Background service worker - handles extension logic
console.log('TTS Study Assistant - Background service worker loaded');

// State management
let ttsState = {
    isPlaying: false,
    isPaused: false,
    currentText: '',
    queue: [],
    currentPosition: 0,
    currentUtterance: null
};

// Initialize default settings
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.set({
        settings: {
            voice: 'default',
            rate: 1.0,
            pitch: 1.0,
            volume: 1.0,
            enabled: true
        }
    });
    console.log('Default settings initialized');
});

// Message listener for communication with content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received:', request.action);

    switch (request.action) {
        case 'speak':
            handleSpeakRequest(request.text, request.options, sendResponse);
            return true; // Will respond asynchronously

        case 'pause':
            pauseSpeaking();
            sendResponse({ status: 'paused', state: ttsState });
            break;

        case 'resume':
            resumeSpeaking();
            sendResponse({ status: 'resumed', state: ttsState });
            break;

        case 'stop':
            stopSpeaking();
            sendResponse({ status: 'stopped' });
            break;

        case 'getState':
            sendResponse({ state: ttsState });
            break;

        case 'appendToQueue':
            appendToQueue(request.text);
            sendResponse({ status: 'appended', queue: ttsState.queue });
            break;

        case 'replaceQueue':
            replaceQueue(request.text);
            sendResponse({ status: 'replaced', queue: ttsState.queue });
            break;

        case 'getSettings':
            chrome.storage.sync.get(['settings'], (data) => {
                sendResponse(data.settings);
            });
            return true; // Will respond asynchronously

        default:
            sendResponse({ status: 'unknown action' });
    }
});

// Handle keyboard command
chrome.commands.onCommand.addListener((command) => {
    if (command === 'speak-selection') {
        // Send message to active tab's content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'speakSelection' });
            }
        });
    }
});

// Handle speak request with queue management
async function handleSpeakRequest(text, options = {}, sendResponse) {
    // If currently playing, ask user what to do
    if (ttsState.isPlaying || ttsState.isPaused) {
        sendResponse({
            status: 'queue_decision_needed',
            currentText: ttsState.currentText,
            newText: text
        });
        return;
    }

    // Otherwise, start speaking immediately
    ttsState.currentText = text;
    ttsState.queue = [];
    await speak(text, options);
    sendResponse({ status: 'speaking' });
}

// Append text to queue
function appendToQueue(text) {
    ttsState.queue.push(text);

    // If not currently playing anything, start speaking
    if (!ttsState.isPlaying && !ttsState.isPaused) {
        processQueue();
    }
}

// Replace queue with new text
function replaceQueue(text) {
    stopSpeaking();
    ttsState.currentText = text;
    ttsState.queue = [text];
    speak(text);
}

// Process queue
async function processQueue() {
    if (ttsState.queue.length === 0) {
        ttsState.isPlaying = false;
        return;
    }

    const nextText = ttsState.queue.shift();
    ttsState.currentText = nextText;
    await speak(nextText);
}

// Text-to-speech function
async function speak(text, options = {}) {
    // Get settings from storage
    const data = await chrome.storage.sync.get(['settings']);
    const settings = data.settings || {};

    // Stop any current speech
    chrome.tts.stop();

    // Update state
    ttsState.isPlaying = true;
    ttsState.isPaused = false;

    // Prepare TTS options
    const ttsOptions = {
        rate: options.rate || settings.rate || 1.0,
        pitch: options.pitch || settings.pitch || 1.0,
        volume: options.volume || settings.volume || 1.0,
        enqueue: false,

        onEvent: (event) => {
            handleTTSEvent(event);
        }
    };

    // If specific voice is set, use it
    if (settings.voice && settings.voice !== 'default') {
        ttsOptions.voiceName = settings.voice;
    }

    // Speak the text
    return new Promise((resolve) => {
        chrome.tts.speak(text, ttsOptions, () => {
            if (chrome.runtime.lastError) {
                console.error('TTS error:', chrome.runtime.lastError);
                ttsState.isPlaying = false;
            }
            resolve();
        });
    });
}

// Handle TTS events
function handleTTSEvent(event) {
    console.log('TTS Event:', event.type);

    switch (event.type) {
        case 'start':
            ttsState.isPlaying = true;
            ttsState.isPaused = false;
            break;

        case 'end':
            ttsState.isPlaying = false;
            ttsState.isPaused = false;
            // Process next item in queue
            processQueue();
            break;

        case 'word':
            // Track current position for resume functionality
            if (event.charIndex !== undefined) {
                ttsState.currentPosition = event.charIndex;
            }
            break;

        case 'error':
            console.error('TTS error:', event.errorMessage);
            ttsState.isPlaying = false;
            ttsState.isPaused = false;
            break;
    }

    // Notify popup of state changes
    chrome.runtime.sendMessage({
        action: 'stateUpdate',
        state: ttsState
    }).catch(() => {
        // Popup might not be open, ignore error
    });
}

// Pause speaking
function pauseSpeaking() {
    chrome.tts.pause();
    ttsState.isPaused = true;
    ttsState.isPlaying = false;
}

// Resume speaking
function resumeSpeaking() {
    chrome.tts.resume();
    ttsState.isPaused = false;
    ttsState.isPlaying = true;
}

// Stop speaking and clear queue
function stopSpeaking() {
    chrome.tts.stop();
    ttsState.isPlaying = false;
    ttsState.isPaused = false;
    ttsState.currentText = '';
    ttsState.queue = [];
    ttsState.currentPosition = 0;
}

// Listen for tab updates to inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Content script should auto-inject, but this is a fallback
    }
});