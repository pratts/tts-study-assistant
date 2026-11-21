// Background service worker - handles extension logic
console.log('TTS Study Assistant - Background service worker loaded');

import { ApiClient, SUMMARY_UNAVAILABLE } from './js/api-client.js';
import { errorMessage } from './js/errors.js';
import { TtsEngine } from './js/tts-engine.js';
import { pickTts } from './js/tts-webspeech.js';
import { promptLogin } from './js/login-prompt.js';
import { injectIntoOpenTabs, readSelection, selectionErrorMessage } from './js/site-access.js';

const apiClient = new ApiClient();

// Only a pointer, not the summary: macOS and others cut long notification text
// off, and the full summary is in the popup.
const SUMMARY_READY_MESSAGE = 'Your summary is ready. Open the extension to read it.';

const engine = new TtsEngine({
    // chrome.tts in Chrome; Firefox has no chrome.tts, so the Web Speech API.
    tts: pickTts({
        chromeTts: chrome.tts,
        synth: globalThis.speechSynthesis,
        Utterance: globalThis.SpeechSynthesisUtterance,
    }),
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

// Keyboard command declared in manifest.json ("save-selection", Alt+Shift+Y).
chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'save-selection') return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || typeof tab.id !== 'number') return;
    let text;
    try {
        // Read with scripting, not the content script: the shortcut grants
        // activeTab, so this also works in tabs without the content script.
        text = await readSelection(chrome.scripting, tab.id);
    } catch (error) {
        console.error('Failed to read the selection:', error);
        notify('Could not read the selection', selectionErrorMessage(error));
        return;
    }
    if (!text) return;
    try {
        if (!(await ApiClient.isAuthenticated())) {
            await askToLogIn();
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

// The selection button needs the content script in every tab. Chrome only
// adds it to pages loaded after install or update, and neither browser adds
// it when website access is granted later, so add it to open tabs then.
async function addContentScriptToOpenTabs() {
    const [{ js = [], css = [] } = {}] = chrome.runtime.getManifest().content_scripts ?? [];
    const { injected, failed } = await injectIntoOpenTabs(chrome, { js, css });
    console.log(`Content script added to ${injected} open tabs (${failed} could not be scripted)`);
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install' || reason === 'update') addContentScriptToOpenTabs();
});

chrome.permissions.onAdded.addListener(({ origins = [] }) => {
    if (origins.length) addContentScriptToOpenTabs();
});

function notify(title, message) {
    chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon-48.png', title, message });
}

/** Opens the popup to log in, or says how to when the browser won't open it. */
function askToLogIn() {
    return promptLogin({ action: chrome.action, notify });
}

// A speed change while playing takes effect at the current word.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.settings) return;
    if (changes.settings.oldValue?.rate !== changes.settings.newValue?.rate) engine.applyRate();
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
            try {
                const noteData = {
                    content: info.selectionText,
                    source_url: tab?.url,
                    source_title: tab?.title
                };
                const isAuthenticated = await ApiClient.isAuthenticated();
                if (!isAuthenticated) {
                    await askToLogIn();
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
                notify('Could not save the note', errorMessage(error));
            }
            break;

        case 'play-text':
            // Play here, not through the tab's content script: that round trip
            // fails silently where no content script runs (tabs open before the
            // extension was installed or reloaded in Chrome, browser pages, PDFs).
            engine.play(info.selectionText);
            // Auto-save when playing
            try {
                if (await ApiClient.isAuthenticated()) {
                    await apiClient.createNote({
                        content: info.selectionText,
                        source_url: tab?.url,
                        source_title: tab?.title
                    });
                    updateNoteBadge();
                }
            } catch (error) {
                console.error('Failed to save note:', error);
            }
            break;

        case 'summarize-text':
            try {
                const isAuthenticated = await ApiClient.isAuthenticated();
                if (!isAuthenticated) {
                    await askToLogIn();
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
                    notify('Summary Ready!', SUMMARY_READY_MESSAGE);
                }
            } catch (error) {
                console.error('Failed to summarize:', error);
                notify('Could not summarize', errorMessage(error));
            }
            break;
    }
});
