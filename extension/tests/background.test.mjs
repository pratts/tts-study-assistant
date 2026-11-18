// Loads background.js against a fake `chrome` global, shaped like Chrome
// (chrome.tts) or Firefox (no chrome.tts, speechSynthesis on the page).
import assert from 'node:assert/strict';
import { test } from 'node:test';

function event() {
    const listeners = [];
    return {
        addListener: (fn) => listeners.push(fn),
        fire: (...args) => listeners.map((fn) => fn(...args)),
        count: () => listeners.length,
    };
}

const ACTIVE_TAB = { id: 7, url: 'https://example.com/', title: 'Example' };
const OPEN_TABS = [ACTIVE_TAB, { id: 8, url: 'chrome://extensions/' }, { id: 9, url: 'http://other.test/' }];

function fakeChrome({ withTts }) {
    const calls = { speak: [], tabMessages: [], scripts: [], css: [], notifications: [], popups: 0 };
    const chrome = {
        runtime: {
            onInstalled: event(),
            onMessage: event(),
            sendMessage: async () => {},
            getManifest: () => ({ content_scripts: [{ js: ['content.js'], css: ['styles/content.css'] }] }),
        },
        commands: { onCommand: event() },
        contextMenus: { onClicked: event(), create() {} },
        permissions: { onAdded: event(), onRemoved: event() },
        tabs: {
            onUpdated: event(),
            // Active-tab queries get the active tab; URL-filtered ones all open pages.
            query: async (filter) => (filter.url ? OPEN_TABS : [ACTIVE_TAB]),
            sendMessage: async (...args) => {
                calls.tabMessages.push(args);
                throw new Error('Could not establish connection. Receiving end does not exist.');
            },
        },
        scripting: {
            // The page's selection, or an Error for pages that can't be scripted.
            selection: 'selected on the page',
            executeScript: async (details) => {
                calls.scripts.push(details);
                const { selection } = chrome.scripting;
                if (selection instanceof Error) throw selection;
                return details.func ? [{ frameId: 0, result: selection }] : [];
            },
            insertCSS: async (details) => calls.css.push(details),
        },
        storage: {
            onChanged: event(),
            sync: { get: async () => ({ settings: { rate: 1 } }), set: async () => {} },
            local: { get: async () => ({}), set: async () => {}, remove: async () => {} }, // logged out
        },
        action: {
            setBadgeText() {},
            setBadgeBackgroundColor() {},
            // Chrome opens the popup; Firefox refuses once the user action has
            // passed (every caller awaits first).
            openPopup: withTts
                ? async () => void calls.popups++
                : async () => { throw new Error('openPopup requires a user gesture'); },
        },
        notifications: { create: (options) => calls.notifications.push(options) },
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

    test(`${browser}: context menu "Save as Note" says when saving fails`, async () => {
        const { chrome, calls } = await loadBackground(`${browser}-save-fails`, { withTts });
        chrome.storage.local.get = async () => ({ access_token: 'token' }); // logged in
        const fetched = [];
        const realFetch = globalThis.fetch;
        globalThis.fetch = async (url) => {
            fetched.push(String(url));
            throw new TypeError('Failed to fetch'); // what a CORS block looks like
        };
        try {
            await Promise.all(chrome.contextMenus.onClicked.fire(
                { menuItemId: 'save-note', selectionText: 'a note' },
                { id: 7, url: 'https://github.com/', title: 'GitHub' },
            ));
        } finally {
            globalThis.fetch = realFetch;
        }
        assert.ok(fetched.some((u) => u.endsWith('/notes')), 'the API was called');
        assert.equal(calls.notifications.at(-1).title, 'Could not save the note');
    });

    test(`${browser}: the popup's "speak" message plays`, async () => {
        const { chrome, calls } = await loadBackground(`${browser}-speak`, { withTts });
        let response;
        chrome.runtime.onMessage.fire({ action: 'speak', text: 'a saved note' }, {}, (r) => (response = r));
        await settle();
        assert.deepEqual(calls.speak, ['a saved note']);
        assert.deepEqual(response, { status: 'speaking' });
    });

    test(`${browser}: the save shortcut reads the selection with scripting, not the content script`, async () => {
        const { chrome, calls } = await loadBackground(`${browser}-shortcut`, { withTts });
        await Promise.all(chrome.commands.onCommand.fire('save-selection'));
        assert.deepEqual(calls.tabMessages, [], 'no message to the tab');
        assert.deepEqual(calls.scripts[0].target, { tabId: 7, allFrames: true });
        // Logged out in this fake, so the selection was read and then login asked
        // for: Chrome opens the popup, Firefox falls back to a notification.
        if (withTts) {
            assert.equal(calls.popups, 1);
            assert.deepEqual(calls.notifications, []);
        } else {
            assert.equal(calls.popups, 0);
            assert.equal(calls.notifications.at(-1).title, 'Login Required');
        }
    });

    test(`${browser}: a long summary from the context menu is shortened for the notification`, async () => {
        const { chrome, calls } = await loadBackground(`${browser}-long-summary`, { withTts });
        chrome.storage.local.get = async () => ({ access_token: 'token' }); // logged in
        const summary = 'This summary is far longer than a notification can show. '.repeat(20);
        const realFetch = globalThis.fetch;
        globalThis.fetch = async (url) => {
            const data = String(url).endsWith('/summarize') ? { summary } : { id: 'note-1' };
            return new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        };
        try {
            await Promise.all(chrome.contextMenus.onClicked.fire(
                { menuItemId: 'summarize-text', selectionText: 'some long article text' },
                ACTIVE_TAB,
            ));
        } finally {
            globalThis.fetch = realFetch;
        }
        const last = calls.notifications.at(-1);
        assert.equal(last.title, 'Summary Ready!');
        assert.ok([...last.message].length <= 200, `${[...last.message].length} characters`);
        assert.match(last.message, /Open the extension for the full summary\.$/);
    });

    test(`${browser}: no tab update listener and no openPopup message`, async () => {
        const { chrome, calls } = await loadBackground(`${browser}-cleanup`, { withTts });
        assert.equal(chrome.tabs.onUpdated.count(), 0, 'the empty tabs.onUpdated listener is gone');
        const handled = chrome.runtime.onMessage.fire({ action: 'openPopup' }, {}, () => {});
        assert.deepEqual(handled.filter(Boolean), [], 'not answered asynchronously');
        assert.equal(calls.popups, 0, 'nothing sends it, so nothing opens the popup');
    });

    test(`${browser}: the shortcut explains when the page can't be scripted`, async () => {
        const { chrome, calls } = await loadBackground(`${browser}-shortcut-blocked`, { withTts });
        chrome.scripting.selection = new Error('Cannot access a chrome:// URL');
        await Promise.all(chrome.commands.onCommand.fire('save-selection'));
        assert.equal(calls.notifications.at(-1).title, 'Could not read the selection');
        assert.match(calls.notifications.at(-1).message, /protected/);
    });

    test(`${browser}: the shortcut does nothing without a selection`, async () => {
        const { chrome, calls } = await loadBackground(`${browser}-shortcut-empty`, { withTts });
        chrome.scripting.selection = '   ';
        await Promise.all(chrome.commands.onCommand.fire('save-selection'));
        assert.deepEqual(calls.notifications, []);
    });

    for (const reason of ['install', 'update']) {
        test(`${browser}: on ${reason}, the content script is added to open web pages`, async () => {
            const { chrome, calls } = await loadBackground(`${browser}-${reason}`, { withTts });
            chrome.runtime.onInstalled.fire({ reason });
            await settle();
            assert.deepEqual(calls.scripts.map((d) => [d.target.tabId, d.files]), [[7, ['content.js']], [9, ['content.js']]]);
            assert.deepEqual(calls.css.map((d) => d.target.tabId), [7, 9]);
        });
    }

    test(`${browser}: a browser update does not re-add the content script`, async () => {
        const { chrome, calls } = await loadBackground(`${browser}-browser-update`, { withTts });
        chrome.runtime.onInstalled.fire({ reason: 'chrome_update' });
        await settle();
        assert.deepEqual(calls.scripts, []);
    });

    test(`${browser}: granting website access adds the content script to open pages`, async () => {
        const { chrome, calls } = await loadBackground(`${browser}-granted`, { withTts });
        chrome.permissions.onAdded.fire({ permissions: [], origins: ['<all_urls>'] });
        await settle();
        assert.equal(calls.scripts.length, 2);
        chrome.permissions.onAdded.fire({ permissions: ['notifications'], origins: [] });
        await settle();
        assert.equal(calls.scripts.length, 2, 'a non-site permission adds nothing');
    });
}
