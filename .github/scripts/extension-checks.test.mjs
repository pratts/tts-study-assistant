import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { checkLint, checkPackage, listFiles, matches } from './extension-checks.mjs';

const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const MANIFEST = {
    manifest_version: 3,
    background: { service_worker: 'background.js', scripts: ['background.js'], type: 'module' },
    action: { default_popup: 'popup/popup.html', default_icon: { 16: 'icons/icon-16.png' } },
    icons: { 16: 'icons/icon-16.png' },
    content_scripts: [{ js: ['content.js'], css: ['styles/content.css'] }],
    browser_specific_settings: { gecko: { id: 'x@example.com' } },
};

/** A temporary package directory; `files` maps path → contents (objects become JSON). */
function pkg(files = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'ext-pkg-'));
    dirs.push(dir);
    const all = {
        'manifest.json': MANIFEST,
        'background.js': "import { a } from './js/a.js';\n",
        'js/a.js': "export const a = 1; import('./b.js');\n",
        'js/b.js': '',
        'content.js': '',
        'styles/content.css': '',
        'icons/icon-16.png': '',
        'popup/popup.html': '<link rel="stylesheet" href="popup.css"><script type="module" src="popup.js"></script><a href="https://example.com">x</a>',
        'popup/popup.css': '',
        'popup/popup.js': "import { a } from '../js/a.js';\n",
        ...files,
    };
    for (const [path, content] of Object.entries(all)) {
        if (content === null) continue; // left out
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        writeFileSync(join(dir, path), typeof content === 'string' ? content : JSON.stringify(content));
    }
    return dir;
}

test('a complete package passes', () => {
    assert.deepEqual(checkPackage(pkg()), []);
});

test('the real extension, packaged the release way, passes', () => {
    // Mirrors extension-package.sh's exclusions, without needing zip.
    const source = new URL('../../extension/', import.meta.url);
    const files = listFiles(source.pathname).filter((f) => !/^tests\/|^package(-lock)?\.json$|^README\.md$|(^|\/)\./.test(f));
    const contents = Object.fromEntries(files.map((f) => [f, readFileSync(new URL(f, source), 'latin1')]));
    assert.deepEqual(checkPackage(pkg(contents)), []);
});

test('manifest.json must be at the root and valid', () => {
    assert.match(checkPackage(pkg({ 'manifest.json': null, 'extension/manifest.json': MANIFEST })).join(), /not at the root/);
    assert.match(checkPackage(pkg({ 'manifest.json': '{ nope' })).join(), /not valid JSON/);
});

test('both browsers\' background keys and the gecko ID are required', () => {
    const problems = checkPackage(pkg({
        'manifest.json': { ...MANIFEST, manifest_version: 2, background: {}, browser_specific_settings: undefined },
    })).join('\n');
    assert.match(problems, /manifest_version is 2/);
    assert.match(problems, /service_worker is missing/);
    assert.match(problems, /background\.scripts is missing/);
    assert.match(problems, /gecko\.id is missing/);
});

test('development files are rejected', () => {
    const problems = checkPackage(pkg({
        'tests/a.test.mjs': '',
        'package.json': '{}',
        'README.md': '',
        '.DS_Store': '',
        'icons/.hidden': '',
        'node_modules/x/index.js': '',
    })).join('\n');
    for (const file of ['tests/a.test.mjs', 'package.json', 'README.md', '.DS_Store', 'icons/.hidden', 'node_modules/x/index.js']) {
        assert.ok(problems.includes(`${file} is in the package`), `${file} should be rejected:\n${problems}`);
    }
});

test('files named by the manifest, JS imports and HTML pages must be packaged', () => {
    const problems = checkPackage(pkg({
        'icons/icon-16.png': null,
        'js/b.js': null,
        'popup/popup.css': null,
    })).join('\n');
    assert.match(problems, /refers to icons\/icon-16\.png/);
    assert.match(problems, /js\/a\.js imports \.\/b\.js/);
    assert.match(problems, /popup\/popup\.html refers to popup\.css/);
    assert.doesNotMatch(problems, /example\.com/, 'remote URLs are not package files');
});

const REPORT = {
    errors: [],
    notices: [],
    warnings: [
        { code: 'MANIFEST_PERMISSIONS', message: '/permissions: Invalid permissions "tts" at 1.', file: 'manifest.json' },
        { code: 'BACKGROUND_SERVICE_WORKER_IGNORED', message: 'ignored', file: 'manifest.json' },
    ],
};
const ALLOW = [
    { code: 'MANIFEST_PERMISSIONS', file: 'manifest.json', contains: '"tts"', reason: 'Chrome needs it' },
    { code: 'BACKGROUND_SERVICE_WORKER_IGNORED', reason: 'Chrome needs it' },
];

test('allowlisted warnings pass', () => {
    const result = checkLint(REPORT, ALLOW);
    assert.equal(result.unexpected.length, 0);
    assert.equal(result.allowed.length, 2);
    assert.equal(result.unused.length, 0);
});

test('lint errors and new warnings fail; stale allowlist entries are reported', () => {
    const report = {
        ...REPORT,
        errors: [{ code: 'JSON_INVALID', message: 'bad', file: 'manifest.json' }],
        warnings: [
            REPORT.warnings[1],
            { code: 'MANIFEST_PERMISSIONS', message: 'Invalid permissions "bogus" at 2.', file: 'manifest.json' },
            { code: 'UNSAFE_VAR_ASSIGNMENT', message: 'Unsafe assignment to innerHTML', file: 'content.js' },
        ],
    };
    const result = checkLint(report, ALLOW);
    assert.equal(result.errors.length, 1);
    assert.deepEqual(result.unexpected.map((w) => w.code), ['MANIFEST_PERMISSIONS', 'UNSAFE_VAR_ASSIGNMENT'], 'a different permission is not covered by the tts entry');
    assert.deepEqual(result.unused.map((e) => e.contains), ['"tts"']);
});

test('matching uses code, file and text in the message or description', () => {
    const w = { code: 'X', message: 'short', description: 'needs data_collection_permissions', file: 'manifest.json' };
    assert.ok(matches({ code: 'X' }, w));
    assert.ok(matches({ code: 'X', contains: 'data_collection_permissions' }, w));
    assert.ok(!matches({ code: 'Y' }, w));
    assert.ok(!matches({ code: 'X', file: 'other.json' }, w));
    assert.ok(!matches({ code: 'X', contains: 'missing' }, w));
});

test('a malformed report or allowlist entry is an error, not a pass', () => {
    assert.throws(() => checkLint({ summary: {} }, ALLOW), /not a web-ext lint JSON report/);
    assert.throws(() => checkLint(REPORT, [{ code: 'X' }]), /needs "code" and "reason"/);
});

test('the checked-in allowlist is well formed', () => {
    const allowlist = JSON.parse(readFileSync(new URL('./extension-lint-allowlist.json', import.meta.url), 'utf8'));
    assert.ok(allowlist.length > 0);
    for (const entry of allowlist) {
        assert.equal(typeof entry.code, 'string');
        assert.ok(entry.reason?.length > 20, `${entry.code} needs a real reason`);
    }
});
