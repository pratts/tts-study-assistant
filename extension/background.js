// Background service worker - handles extension logic
console.log('TTS Study Assistant - Background service worker loaded');

// Initialize default settings
chrome.runtime.onInstalled.addListener(async () => {
    chrome.storage.sync.set({
        settings: {
            voice: 'default',
            rate: 1.0,
            pitch: 1.0,
            volume: 1.0,
            enabled: true
        }
    });

    for (const cs of chrome.runtime.getManifest().content_scripts) {
        for (const tab of await chrome.tabs.query({ url: cs.matches })) {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: cs.js,
            });
        }
    }
    console.log('Default settings initialized');
});

// Message listener for communication with content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received:', request.action);

    switch (request.action) {
        case 'speak':
            handleSpeak(request.text, request.options);
            sendResponse({ status: 'speaking' });
            break;

        case 'stop':
            chrome.tts.stop();
            sendResponse({ status: 'stopped' });
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

// Text-to-speech function
async function handleSpeak(text, options = {}) {
    // Get settings from storage
    const data = await chrome.storage.sync.get(['settings']);
    const settings = data.settings || {};

    // Prepare TTS options
    const ttsOptions = {
        rate: options.rate || settings.rate || 1.0,
        pitch: options.pitch || settings.pitch || 1.0,
        volume: options.volume || settings.volume || 1.0,
        enqueue: options.enqueue || false,

        onEvent: (event) => {
            if (event.type === 'error') {
                console.error('TTS error:', event.errorMessage);
            }
        }
    };

    // If specific voice is set, use it
    if (settings.voice && settings.voice !== 'default') {
        ttsOptions.voiceName = settings.voice;
    }

    // Speak the text
    chrome.tts.speak(text, ttsOptions);
}

// Listen for tab updates to inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Content script should auto-inject, but this is a fallback
        // Can be used for dynamic injection if needed
    }
});

// chrome.runtime.onInstalled.addListener(async () => {
//     // Re-inject the content script into all active tabs
//     for (const cs of chrome.runtime.getManifest().content_scripts) {
//         for (const tab of await chrome.tabs.query({ url: cs.matches })) {
//             chrome.scripting.executeScript({
//                 target: { tabId: tab.id },
//                 files: cs.js,
//             });
//         }
//     }
// });