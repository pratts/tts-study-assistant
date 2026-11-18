// Website access: whether the extension may run on pages, getting the
// selection without a content script, and adding the content script to tabs
// that don't have it. Shared by the background and the popup; browser APIs
// are passed in so this can be tested without a browser.
//
// Why: the content script (selection button) is missing from a tab when
//  - the user revoked or never granted website access (Firefox lets users
//    revoke <all_urls> at any time; Chrome has "Site access: On click"), or
//  - in Chrome, the tab was open before the extension was installed,
//    updated or reloaded (Firefox injects into open tabs on install).

const PAGE_URLS = ['http://*/*', 'https://*/*'];

/** The match pattern for a page's origin ("https://a.com/x" → "https://a.com/*"), or null for non-web pages. */
export function originPattern(url) {
    try {
        const { protocol, origin } = new URL(url);
        return protocol === 'http:' || protocol === 'https:' ? `${origin}/*` : null;
    } catch {
        return null;
    }
}

async function has(permissions, origins) {
    try {
        return await permissions.contains({ origins });
    } catch {
        return false;
    }
}

/**
 * Which host access the popup should ask for:
 *  - `server`: the API host, for login and notes. Chrome withholds it with
 *    "Site access: On click / On specific sites"; Firefox lets users turn it
 *    off. Without it, requests fall under CORS, which the backend's
 *    allowlist doesn't pass for extension origins.
 *  - `site`: the current tab's site, for the selection button. Only that site
 *    is asked for, so a user who limited access keeps their setting.
 * `origins` is what to pass to permissions.request (empty: nothing missing).
 */
export async function missingAccess(permissions, { apiUrl, tabUrl }) {
    const wanted = [originPattern(apiUrl), originPattern(tabUrl)];
    const [server, site] = await Promise.all(wanted.map(async (o) => Boolean(o) && !(await has(permissions, [o]))));
    const origins = [...new Set(wanted.filter((o, i) => [server, site][i]))];
    return { server, site, origins };
}

/**
 * The selected text from `scripting.executeScript` results (one per frame):
 * the top frame's when it has one, else the first frame with a selection.
 */
export function pickSelection(results) {
    const texts = (results ?? [])
        .map((r) => ({ frameId: r?.frameId, text: typeof r?.result === 'string' ? r.result.trim() : '' }))
        .filter((r) => r.text);
    return (texts.find((r) => r.frameId === 0) ?? texts[0])?.text ?? '';
}

// Runs in the page, so it must not use anything from this module.
function readPageSelection() {
    return globalThis.getSelection?.()?.toString() ?? '';
}

/**
 * The tab's selected text, read with scripting.executeScript, so it works
 * without a content script. Keyboard shortcuts and context menus grant
 * activeTab, so this works even without website access.
 * Throws (with the browser's message) on pages extensions can't script.
 */
export async function readSelection(scripting, tabId) {
    let results;
    try {
        results = await scripting.executeScript({ target: { tabId, allFrames: true }, func: readPageSelection });
    } catch {
        // Some frames (e.g. cross-origin without host access) can fail the
        // all-frames call; the top frame alone may still work.
        results = await scripting.executeScript({ target: { tabId }, func: readPageSelection });
    }
    return pickSelection(results);
}

/** What to tell the user when the selection can't be read. */
export function selectionErrorMessage(error) {
    const text = String(error?.message ?? error ?? '');
    if (/permission/i.test(text)) {
        return 'The extension has no access to this site. Open the extension and allow access to this site.';
    }
    return "Extensions can't read this page (browser pages and add-on stores are protected). Try on a regular web page.";
}

/** What the access banner says for each combination of missing access. */
export function siteAccessText({ server, site }) {
    if (server && site) return 'Allow access to this site and the TTS Study Assistant server to save notes and use the Save & Play button.';
    if (server) return 'Allow access to the TTS Study Assistant server to log in and save notes.';
    return 'Allow access to this site to use the Save & Play button here.';
}

/** True for tabs a content script can be added to. */
export function isPageTab(tab) {
    return typeof tab?.id === 'number' && tab.id >= 0 && /^https?:\/\//.test(tab.url ?? '');
}

/**
 * Adds the content script and its CSS to open web page tabs, so the
 * selection button works without reloading them. content.js skips a tab
 * where a live copy already runs. Errors (protected pages, no access) are
 * per tab and never stop the others.
 * @returns {Promise<{injected: number, failed: number}>}
 */
export async function injectIntoOpenTabs({ tabs, scripting }, { js, css }) {
    let open;
    try {
        open = await tabs.query({ url: PAGE_URLS });
    } catch {
        return { injected: 0, failed: 0 };
    }
    const outcomes = await Promise.all(open.filter(isPageTab).map(async (tab) => {
        const target = { tabId: tab.id, allFrames: true };
        try {
            if (css?.length) await scripting.insertCSS({ target, files: css });
            await scripting.executeScript({ target, files: js });
            return true;
        } catch {
            return false;
        }
    }));
    const injected = outcomes.filter(Boolean).length;
    return { injected, failed: outcomes.length - injected };
}
