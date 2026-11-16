// Loads background.js against a fake `chrome` global, shaped like Chrome
// (chrome.tts) or Firefox (no chrome.tts, speechSynthesis on the page).
import assert from 'node:assert/strict';
import { test } from 'node:test';

function event() {
    const listeners = [];
    return { addListener: (fn) => listeners.push(fn), fire: (...args) => listeners.map((fn) => fn(...args)) };
}

function fakeChrome({ withTts }) {
    const calls = { speak: [], tabMessages: [] };
    const chrome = {
        runtime: { onInstalled: event(), onMessage: event(), sendMessage: async () => {} },
        commands: { onCommand: event() },
        contextMenus: { onClicked: event(), create() {} },
        tabs: {
            onUpdated: event(),
            query: async () => [],
            sendMessage: async (...args) => {
                calls.tabMessages.push(args);
                throw new Error('Could not establish connection. Receiving end does not exist.');
            },
        },
        storage: {
            onChanged: event(),
            sync: { get: async () => ({ settings: { rate: 1 } }), set: async () => {} },
            local: { get: async () => ({}), set: async () => {}, remove: async () => {} }, // logged out
        },
        action: { setBadgeText() {}, setBadgeBackgroundColor() {}, openPopup() {} },
        notifications: { create() {} },
    };
    if (withTts) {
        chrome.tts = { speak: (text) => calls.speak.push(text), stop() {}, pause() {}, resume() {} };
    }
    return { chrome, calls };
}

/** Imports a fresh copy of background.js with the given globals. */
async function loadBackground(name, { withTts }) {
    const { chrome, calls } = fakeChrome({ withTts });
    globalThis.chrome = chrome;
    if (withTts) {
        delete globalThis.speechSynthesis;
        delete globalThis.SpeechSynthesisUtterance;
    } else {
        globalThis.SpeechSynthesisUtterance = class {
            constructor(text) {
                this.text = text;
            }
        };
        globalThis.speechSynthesis = {
            paused: false,
            getVoices: () => [],
            speak: (u) => calls.speak.push(u.text),
            cancel() {},
            pause() {},
            resume() {},
        };
    }
    const log = console.log;
    console.log = () => {}; // background.js logs on load
    try {
        await import(`../background.js?${name}`);
    } finally {
        console.log = log;
    }
    return { chrome, calls };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

for (const [browser, withTts] of [['chrome', true], ['firefox', false]]) {
    test(`${browser}: context menu "Play Text" plays without the tab's content script`, async () => {
        const { chrome, calls } = await loadBackground(browser, { withTts });
        chrome.contextMenus.onClicked.fire(
            { menuItemId: 'play-text', selectionText: 'hello from the page' },
            { id: 7, url: 'https://example.com/', title: 'Example' },
        );
        await settle();
        assert.deepEqual(calls.speak, ['hello from the page']);
        assert.deepEqual(calls.tabMessages, [], 'no round trip through the content script');
    });

    test(`${browser}: the popup's "speak" message plays`, async () => {
        const { chrome, calls } = await loadBackground(`${browser}-speak`, { withTts });
        let response;
        chrome.runtime.onMessage.fire({ action: 'speak', text: 'a saved note' }, {}, (r) => (response = r));
        await settle();
        assert.deepEqual(calls.speak, ['a saved note']);
        assert.deepEqual(response, { status: 'speaking' });
    });
}
