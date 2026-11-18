import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    injectIntoOpenTabs,
    isPageTab,
    missingAccess,
    originPattern,
    pickSelection,
    readSelection,
    selectionErrorMessage,
    siteAccessText,
} from '../js/site-access.js';

test('pickSelection prefers the top frame, then the first frame with text', () => {
    assert.equal(pickSelection([{ frameId: 3, result: ' in frame ' }, { frameId: 0, result: 'top' }]), 'top');
    assert.equal(pickSelection([{ frameId: 0, result: '   ' }, { frameId: 5, result: 'iframe text' }]), 'iframe text');
    assert.equal(pickSelection([{ frameId: 0, result: null }, { frameId: 1 }]), '');
    assert.equal(pickSelection(undefined), '');
});

test('readSelection reads all frames with executeScript, without a content script', async () => {
    const calls = [];
    const scripting = {
        executeScript: async (details) => {
            calls.push(details);
            return [{ frameId: 0, result: 'selected words' }];
        },
    };
    assert.equal(await readSelection(scripting, 9), 'selected words');
    assert.deepEqual(calls[0].target, { tabId: 9, allFrames: true });
    assert.equal(typeof calls[0].func, 'function', 'injects a function, not a file');
});

test('readSelection retries the top frame alone when the all-frames call fails', async () => {
    const targets = [];
    const scripting = {
        executeScript: async ({ target }) => {
            targets.push(target);
            if (target.allFrames) throw new Error('Cannot access contents of a frame');
            return [{ frameId: 0, result: 'top only' }];
        },
    };
    assert.equal(await readSelection(scripting, 4), 'top only');
    assert.deepEqual(targets, [{ tabId: 4, allFrames: true }, { tabId: 4 }]);
});

test('readSelection throws when the page cannot be scripted at all', async () => {
    const scripting = { executeScript: async () => { throw new Error('Cannot access a chrome:// URL'); } };
    await assert.rejects(readSelection(scripting, 1), /chrome:\/\//);
});

test('the injected function reads the page selection', async () => {
    let func;
    await readSelection({ executeScript: async (d) => ((func = d.func), []) }, 1);
    const saved = globalThis.getSelection;
    try {
        globalThis.getSelection = () => ({ toString: () => 'from the page' });
        assert.equal(func(), 'from the page');
        delete globalThis.getSelection;
        assert.equal(func(), '');
    } finally {
        if (saved) globalThis.getSelection = saved;
    }
});

test('selectionErrorMessage separates missing access from protected pages', () => {
    assert.match(selectionErrorMessage(new Error('Missing host permission for the tab')), /allow access to this site/);
    assert.match(selectionErrorMessage(new Error('Cannot access a chrome:// URL')), /browser pages and add-on stores/);
    assert.match(selectionErrorMessage(new Error('The extensions gallery cannot be scripted.')), /protected/);
    assert.match(selectionErrorMessage(undefined), /protected/);
});

test('isPageTab accepts only http(s) tabs with an id', () => {
    assert.ok(isPageTab({ id: 1, url: 'https://example.com/' }));
    assert.ok(isPageTab({ id: 2, url: 'http://localhost:5173/' }));
    for (const tab of [{ id: 3, url: 'chrome://extensions/' }, { id: 4, url: 'about:addons' }, { id: 5 }, { url: 'https://x.com' }, { id: -1, url: 'https://x.com' }, null]) {
        assert.ok(!isPageTab(tab), JSON.stringify(tab));
    }
});

test('injectIntoOpenTabs adds CSS and JS to web page tabs in all frames', async () => {
    const calls = [];
    const api = {
        tabs: {
            query: async (filter) => {
                calls.push(['query', filter]);
                return [{ id: 1, url: 'https://a.com/' }, { id: 2, url: 'chrome://newtab/' }, { id: 3, url: 'http://b.com/' }];
            },
        },
        scripting: {
            insertCSS: async ({ target, files }) => calls.push(['css', target, files]),
            executeScript: async ({ target, files }) => calls.push(['js', target, files]),
        },
    };
    const result = await injectIntoOpenTabs(api, { js: ['content.js'], css: ['styles/content.css'] });
    assert.deepEqual(result, { injected: 2, failed: 0 });
    assert.deepEqual(calls[0], ['query', { url: ['http://*/*', 'https://*/*'] }]);
    assert.deepEqual(calls.slice(1).filter((c) => c[1].tabId === 1), [
        ['css', { tabId: 1, allFrames: true }, ['styles/content.css']],
        ['js', { tabId: 1, allFrames: true }, ['content.js']],
    ]);
    assert.ok(!calls.some((c) => c[1]?.tabId === 2), 'browser pages are skipped');
});

test('injectIntoOpenTabs counts per-tab failures and never throws', async () => {
    const api = {
        tabs: { query: async () => [{ id: 1, url: 'https://ok.com/' }, { id: 2, url: 'https://chromewebstore.google.com/' }] },
        scripting: {
            insertCSS: async () => {},
            executeScript: async ({ target }) => {
                if (target.tabId === 2) throw new Error('The extensions gallery cannot be scripted.');
            },
        },
    };
    assert.deepEqual(await injectIntoOpenTabs(api, { js: ['content.js'] }), { injected: 1, failed: 1 });

    const broken = { tabs: { query: async () => { throw new Error('no access'); } }, scripting: {} };
    assert.deepEqual(await injectIntoOpenTabs(broken, { js: ['content.js'] }), { injected: 0, failed: 0 });
});

test('originPattern gives the origin match pattern of web pages only', () => {
    assert.equal(originPattern('https://mail.google.com/mail/u/0/#inbox'), 'https://mail.google.com/*');
    assert.equal(originPattern('http://localhost:3000/api/v1'), 'http://localhost:3000/*');
    for (const url of ['chrome://extensions/', 'about:addons', 'moz-extension://x/popup.html', '', undefined]) {
        assert.equal(originPattern(url), null, String(url));
    }
});

/** permissions.contains for a set of granted origins ('<all_urls>' covers every web origin). */
function grants(...granted) {
    const asked = [];
    return {
        asked,
        contains: async ({ origins }) => {
            asked.push(origins);
            return origins.every((o) => granted.includes(o) || (granted.includes('<all_urls>') && /^https?:/.test(o)));
        },
    };
}

const API = 'https://api.example.com/api/v1';

test('missingAccess asks only for this site and the server, never all websites', async () => {
    // Chrome "On specific sites: mail.google.com" withholds the API host too.
    const result = await missingAccess(grants('https://mail.google.com/*'), { apiUrl: API, tabUrl: 'https://news.site/a' });
    assert.deepEqual(result, { server: true, site: true, origins: ['https://api.example.com/*', 'https://news.site/*'] });
    assert.ok(!result.origins.includes('<all_urls>'));
});

test('missingAccess is empty when the site and server are granted', async () => {
    const tabUrl = 'https://mail.google.com/mail/u/0/#inbox';
    assert.deepEqual(await missingAccess(grants('https://mail.google.com/*', 'https://api.example.com/*'), { apiUrl: API, tabUrl }), { server: false, site: false, origins: [] });
    assert.deepEqual(await missingAccess(grants('<all_urls>'), { apiUrl: API, tabUrl }), { server: false, site: false, origins: [] });
});

test('missingAccess ignores browser pages and treats errors as missing', async () => {
    assert.deepEqual(await missingAccess(grants(), { apiUrl: API, tabUrl: 'about:addons' }), { server: true, site: false, origins: ['https://api.example.com/*'] });
    const broken = { contains: async () => { throw new Error('no'); } };
    assert.equal((await missingAccess(broken, { apiUrl: API, tabUrl: 'https://a.com/' })).origins.length, 2);
});

test('missingAccess asks once when the tab is on the server itself', async () => {
    const result = await missingAccess(grants(), { apiUrl: API, tabUrl: 'https://api.example.com/health' });
    assert.deepEqual(result.origins, ['https://api.example.com/*']);
});

test('siteAccessText names what is missing', () => {
    assert.match(siteAccessText({ server: true, site: true }), /this site and the TTS Study Assistant server/);
    assert.match(siteAccessText({ server: true, site: false }), /server to log in/);
    assert.match(siteAccessText({ server: false, site: true }), /this site to use the Save & Play button/);
});
