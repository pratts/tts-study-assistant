// Background service worker - handles extension logic
console.log('TTS Study Assistant - Background service worker loaded');

import { ApiClient, SUMMARY_UNAVAILABLE } from './js/api-client.js';
import { errorMessage } from './js/errors.js';
import { TtsEngine } from './js/tts-engine.js';

const apiClient = new ApiClient();

const engine = new TtsEngine({
    tts: chrome.tts,
    getSettings: async () => (await chrome.storage.sync.get('settings')).settings || {},
    onChange: (state) => {
        // The popup may be closed; nobody is listening then.
        chrome.runtime.sendMessage({ action: 'stateUpdate', state }).catch(() => {});
    },
});

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

    // Create parent menu
    chrome.contextMenus.create({
        id: 'study-assistant',
        title: 'Study Assistant',
        contexts: ['selection']
    });

    // Create sub-menu items
    chrome.contextMenus.create({
        id: 'save-note',
        parentId: 'study-assistant',
        title: '📝 Save as Note',
        contexts: ['selection']
    });

    chrome.contextMenus.create({
        id: 'play-text',
        parentId: 'study-assistant',
        title: '🔊 Play Text',
        contexts: ['selection']
    });

    chrome.contextMenus.create({
        id: 'summarize-text',
        parentId: 'study-assistant',
        title: '📝 Summarize Text',
        contexts: ['selection']
    });

    console.log('Default settings and context menu initialized');
});

// Message listener for communication with content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received:', request.action);

    switch (request.action) {
        case 'saveNote':
            handleSaveNote(request.noteData, sendResponse);
            return true; // Will respond asynchronously

        case 'openPopup':
            chrome.action.openPopup();
            break;

        case 'speak':
            // An explicit play replaces what is playing (the old "queue decision"
            // response was never handled by any caller, so it silently did nothing).
            engine.play(request.text).then(() => sendResponse({ status: 'speaking' }));
            return true;

        case 'pause':
            engine.pause();
            sendResponse({ state: engine.snapshot() });
            break;

        case 'resume':
            engine.resume().then(() => sendResponse({ state: engine.snapshot() }));
            return true;

        case 'stop':
            engine.stop().then(() => sendResponse({ state: engine.snapshot() }));
            return true;

        case 'seek':
            engine.seek(request.fraction).then(() => sendResponse({ state: engine.snapshot() }));
            return true;

        case 'getState':
            sendResponse({ state: engine.snapshot() });
            break;

        case 'appendToQueue':
            engine.enqueue(request.text);
            sendResponse({ state: engine.snapshot() });
            break;

        case 'replaceQueue':
            engine.play(request.text).then(() => sendResponse({ state: engine.snapshot() }));
            return true;

        case 'refreshBadge':
            updateNoteBadge();
            break;

        case 'clearBadge':
            chrome.action.setBadgeText({ text: '' });
            break;

        case 'getSettings':
            chrome.storage.sync.get(['settings'], (data) => {
                sendResponse(data.settings);
            });
            return true; // Will respond asynchronously

        case 'triggerSummarize':
            handleMessageSummarize(request, sendResponse);
            return true; // Will respond asynchronously
        default:
            sendResponse({ status: 'unknown action' });
    }
});

// Summarize a page selection: the selection is not a note yet, so it is saved
// first and then summarized (one note per request, never a duplicate of an
// existing note).
async function handleMessageSummarize(request, sendResponse) {
    try {
        const isAuthenticated = await ApiClient.isAuthenticated();
        if (!isAuthenticated) {
            sendResponse({ success: false, error: 'Please log in from the extension popup first.' });
            return;
        }
        const note = await apiClient.createNote({
            content: request.text,
            source_url: request.url,
            source_title: request.title
        });
        updateNoteBadge();
        const { summary } = await apiClient.summarize(note.id);
        sendResponse({ success: true, summary });
    } catch (error) {
        console.error('Failed to summarize:', error);
        sendResponse({ success: false, error: errorMessage(error) });
    }
}

// Keyboard command declared in manifest.json ("save-selection", Alt+S).
chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'save-selection') return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || typeof tab.id !== 'number') return;
    try {
        const { text } = await chrome.tabs.sendMessage(tab.id, { action: 'getSelection' });
        if (!text) return;
        if (!(await ApiClient.isAuthenticated())) {
            notify('Login Required', 'Please login to save notes. Click the extension icon.');
            return;
        }
        await apiClient.createNote({ content: text, source_url: tab.url, source_title: tab.title });
        notify('Note Saved!', 'Your note has been saved successfully.');
        updateNoteBadge();
    } catch (error) {
        console.error('Failed to save selection:', error);
        notify('Could not save the note', errorMessage(error));
    }
});

function notify(title, message) {
    chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon-48.png', title, message });
}

// A speed change while playing takes effect at the current word.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.settings) return;
    if (changes.settings.oldValue?.rate !== changes.settings.newValue?.rate) engine.applyRate();
});

// Listen for tab updates to inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Content script should auto-inject, but this is a fallback
    }
});

// Handle note saving
async function handleSaveNote(noteData, sendResponse) {
    try {
        // Check if user is authenticated
        const isAuthenticated = await ApiClient.isAuthenticated();
        if (!isAuthenticated) {
            sendResponse({ success: false, error: 'NOT_AUTHENTICATED' });
            return;
        }
        // Save the note
        const response = await apiClient.createNote(noteData);
        // Update badge with note count
        updateNoteBadge();
        sendResponse({ success: true, note: response });
    } catch (error) {
        console.error('Failed to save note:', error);
        sendResponse({ success: false, error: errorMessage(error) });
    }
}

// Update badge to show the total note count (sum of per-domain stats; a page
// of GET /notes would cap the count at its page size).
async function updateNoteBadge() {
    try {
        const isAuthenticated = await ApiClient.isAuthenticated();
        if (!isAuthenticated) return;
        const stats = await apiClient.getNotesStats();
        const count = stats.reduce((sum, s) => sum + s.count, 0);
        chrome.action.setBadgeText({
            text: count > 0 ? count.toString() : ''
        });
        chrome.action.setBadgeBackgroundColor({
            color: '#4688F1'
        });
    } catch (error) {
        console.error('Failed to update badge:', error);
    }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!info.selectionText) return;

    switch (info.menuItemId) {
        case 'save-note':
            const noteData = {
                content: info.selectionText,
                source_url: tab.url,
                source_title: tab.title
            };

            try {
                const isAuthenticated = await ApiClient.isAuthenticated();
                if (!isAuthenticated) {
                    chrome.notifications.create({
                        type: 'basic',
                        iconUrl: 'icons/icon-48.png',
                        title: 'Login Required',
                        message: 'Please login to save notes. Click the extension icon.'
                    });
                    return;
                }

                await apiClient.createNote(noteData);

                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon-48.png',
                    title: 'Note Saved!',
                    message: 'Your note has been saved successfully.'
                });

                updateNoteBadge();
            } catch (error) {
                console.error('Failed to save note:', error);
            }
            break;

        case 'play-text':
            // Auto-save when playing
            try {
                const isAuthenticated = await ApiClient.isAuthenticated();
                if (isAuthenticated) {
                    await apiClient.createNote({
                        content: info.selectionText,
                        source_url: tab.url,
                        source_title: tab.title
                    });
                    updateNoteBadge();
                }
            } catch (error) {
                console.error('Failed to save note:', error);
            }

            if (typeof tab.id === 'number' && tab.id >= 0) {
                // Send text to content script to play
                chrome.tabs.sendMessage(tab.id, {
                    action: 'playText',
                    text: info.selectionText
                });
            } else {
                console.warn('Cannot send message: invalid tab id', tab);
                // Optionally, show a notification or fallback here
            }
            break;

        case 'summarize-text':
            try {
                const isAuthenticated = await ApiClient.isAuthenticated();
                if (!isAuthenticated) {
                    chrome.notifications.create({
                        type: 'basic',
                        iconUrl: 'icons/icon-48.png',
                        title: 'Login Required',
                        message: 'Please login to save notes. Click the extension icon.'
                    });
                    return;
                }

                // This is perfect - you're using info.selectionText
                const note = await apiClient.createNote({
                    content: info.selectionText,
                    source_url: tab.url,
                    source_title: tab.title
                });

                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon-48.png',
                    title: 'Note Saved!',
                    message: 'Your note has been saved successfully. Please wait for summary.'
                });

                updateNoteBadge();
                const summary = await apiClient.summarize(note.id);

                // Check if summary is unavailable
                if (summary.summary === SUMMARY_UNAVAILABLE) {
                    chrome.notifications.create({
                        type: 'basic',
                        iconUrl: 'icons/icon-48.png',
                        title: 'Summary Unavailable',
                        message: 'Text may be too short or incomplete for summarization.'
                    });
                } else {
                    // Show summary notification
                    chrome.notifications.create({
                        type: 'basic',
                        iconUrl: 'icons/icon-48.png',
                        title: 'Summary Ready!',
                        message: summary.summary || 'Summary generated successfully.'
                    });
                }
            } catch (error) {
                console.error('Failed to summarize:', error);
                notify('Could not summarize', errorMessage(error));
            }
            break;
    }
});
