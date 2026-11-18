// One manifest.json serves Chrome and Firefox. These checks keep both
// browsers' required keys in place and every referenced file present.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const manifest = readJson('manifest.json');
const pkg = readJson('package.json');

/** Major version of a dotted version string ("140.0" → 140). */
const major = (version) => Number(String(version).split('.')[0]);

// Categories Firefox accepts in data_collection_permissions.
// https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
const FIREFOX_DATA_CATEGORIES = new Set([
    'none', 'authenticationInfo', 'bookmarksInfo', 'browsingActivity', 'financialAndPaymentInfo',
    'healthInfo', 'locationInfo', 'personalCommunications', 'personallyIdentifyingInfo',
    'searchTerms', 'websiteActivity', 'websiteContent', 'technicalAndInteraction',
]);

test('background runs as a Chrome service worker and a Firefox event page from the same file', () => {
    const { background } = manifest;
    assert.equal(manifest.manifest_version, 3);
    assert.equal(typeof background.service_worker, 'string', 'Chrome needs background.service_worker');
    assert.deepEqual(background.scripts, [background.service_worker], 'Firefox needs background.scripts with the same file');
    assert.equal(background.type, 'module', 'background.js uses import');
});

test('Chrome minimum version ignores background.scripts', () => {
    // Chrome before 121 rejects background.scripts in Manifest V3.
    assert.ok(major(manifest.minimum_chrome_version) >= 121, 'minimum_chrome_version must be at least 121');
});

test('Firefox add-on ID, minimum version and data collection are declared', () => {
    const gecko = manifest.browser_specific_settings?.gecko;
    assert.ok(gecko, 'browser_specific_settings.gecko is required by addons.mozilla.org');
    assert.match(gecko.id, /^[a-z0-9._-]+@[a-z0-9.-]+$/i, 'gecko.id must be an email-style ID');
    // data_collection_permissions is supported from Firefox 140 (desktop).
    assert.ok(major(gecko.strict_min_version) >= 140, 'strict_min_version must be at least 140.0');

    const { required, optional = [] } = gecko.data_collection_permissions ?? {};
    assert.ok(Array.isArray(required) && required.length > 0, 'data_collection_permissions.required must list the data sent to the backend');
    for (const category of [...required, ...optional]) {
        assert.ok(FIREFOX_DATA_CATEGORIES.has(category), `unknown data collection category: ${category}`);
    }
    assert.ok(!required.includes('none') || required.length === 1, '"none" cannot be combined with other categories');
    // What the extension really sends: selected text, page URL, login and account details.
    for (const category of ['websiteContent', 'browsingActivity', 'authenticationInfo', 'personallyIdentifyingInfo']) {
        assert.ok(required.includes(category), `${category} must be declared`);
    }
});

test('every file the manifest refers to exists', () => {
    const files = [
        manifest.background.service_worker,
        ...manifest.background.scripts,
        manifest.action.default_popup,
        ...Object.values(manifest.action.default_icon),
        ...Object.values(manifest.icons),
        ...manifest.content_scripts.flatMap((script) => [...(script.js ?? []), ...(script.css ?? [])]),
    ];
    for (const file of files) {
        assert.ok(existsSync(new URL(file, root)), `missing file: ${file}`);
    }
});

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file) {
    const bytes = readFileSync(new URL(file, root));
    assert.equal(bytes.toString('latin1', 1, 4), 'PNG', `${file} is not a PNG`);
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

test('every icon has the pixel size its manifest key declares', () => {
    // Firefox's linter flags mismatches, and oversized icons bloat the package.
    for (const icons of [manifest.icons, manifest.action.default_icon]) {
        for (const [size, file] of Object.entries(icons)) {
            assert.deepEqual(pngSize(file), [Number(size), Number(size)], `${file} should be ${size}×${size}`);
        }
    }
});

test('permissions are the minimum the extension uses', () => {
    // Every permission must be justified in the AMO reviewer notes (#52).
    assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'contextMenus', 'notifications', 'scripting', 'storage', 'tts']);
    // tab.url/title come from activeTab (popup, shortcut, context menu) or host access.
    assert.ok(!manifest.permissions.includes('tabs'), 'tabs is not needed');
});

test('the backend host is a host permission of its own', () => {
    // With access to the API host, requests skip CORS, and the popup can ask
    // for it alone (with Chrome "On specific sites" it is withheld too).
    const config = readFileSync(new URL('js/config.js', root), 'utf8');
    const apiUrl = config.match(/^export const API_URL = '([^']+)'/m)?.[1];
    assert.ok(apiUrl, 'API_URL not found in js/config.js');
    assert.ok(manifest.host_permissions.includes(`${new URL(apiUrl).origin}/*`), `host_permissions must include ${new URL(apiUrl).origin}/*`);
    assert.ok(manifest.host_permissions.includes('<all_urls>'), 'the selection button needs <all_urls>');
});

test('manifest and package.json versions match', () => {
    assert.equal(manifest.version, pkg.version);
});
