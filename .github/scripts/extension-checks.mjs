#!/usr/bin/env node
// Checks for the extension package, used by Extension CI and the release.
//
//   node .github/scripts/extension-checks.mjs package <unzipped-package-dir>
//   node .github/scripts/extension-checks.mjs lint <web-ext-lint.json> <allowlist.json>
//
// package: the zip has what both browsers need and nothing development-only.
// lint:    `web-ext lint --output json` has no errors, and every warning is
//          on the allowlist (each entry says why it is accepted). Allowlist
//          entries that no longer match are reported, so the list shrinks
//          when a warning is fixed.
//
// Problems are printed as GitHub annotations (::error / ::warning).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Paths (relative, "/"-separated) of every file under `dir`. */
export function listFiles(dir) {
    const out = [];
    const walk = (d) => {
        for (const name of readdirSync(d)) {
            const full = join(d, name);
            if (statSync(full).isDirectory()) walk(full);
            else out.push(relative(dir, full).split(sep).join('/'));
        }
    };
    walk(dir);
    return out.sort();
}

// Development-only files that must never ship.
const FORBIDDEN = [
    [/^tests\//, 'unit tests'],
    [/^node_modules\//, 'node_modules'],
    [/(^|\/)package(-lock)?\.json$/, 'npm metadata'],
    [/(^|\/)README\.md$/i, 'README'],
    [/(^|\/)\./, 'dotfile'],
];

// Static imports and import() of relative paths.
const IMPORT_RE = /(?:\bimport\s[^'"]*?from\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g;

/**
 * Checks an unzipped package directory.
 * @returns {string[]} problems; empty when the package is fine
 */
export function checkPackage(dir) {
    const problems = [];
    const files = listFiles(dir);
    const has = (path) => files.includes(posix.normalize(path));

    if (!has('manifest.json')) return ['manifest.json is not at the root of the zip'];
    let manifest;
    try {
        manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    } catch (error) {
        return [`manifest.json is not valid JSON: ${error.message}`];
    }

    if (manifest.manifest_version !== 3) problems.push(`manifest_version is ${manifest.manifest_version}, expected 3`);
    const bg = manifest.background ?? {};
    if (!bg.service_worker) problems.push('background.service_worker is missing (Chrome needs it)');
    if (!Array.isArray(bg.scripts) || !bg.scripts.length) problems.push('background.scripts is missing (Firefox needs it)');
    if (!manifest.browser_specific_settings?.gecko?.id) problems.push('browser_specific_settings.gecko.id is missing (addons.mozilla.org needs it)');

    for (const file of files) {
        const hit = FORBIDDEN.find(([re]) => re.test(file));
        if (hit) problems.push(`${file} is in the package (${hit[1]}; development only)`);
    }

    // Every file the manifest names, and every relative JS import, is packaged.
    const referenced = new Set([
        bg.service_worker,
        ...(bg.scripts ?? []),
        manifest.action?.default_popup,
        ...Object.values(manifest.action?.default_icon ?? {}),
        ...Object.values(manifest.icons ?? {}),
        ...(manifest.content_scripts ?? []).flatMap((s) => [...(s.js ?? []), ...(s.css ?? [])]),
    ].filter(Boolean));
    for (const path of referenced) {
        if (!has(path)) problems.push(`manifest.json refers to ${path}, which is not in the package`);
    }
    for (const file of files.filter((f) => f.endsWith('.js') || f.endsWith('.mjs'))) {
        const code = readFileSync(join(dir, file), 'utf8');
        for (const [, spec] of code.matchAll(IMPORT_RE)) {
            const target = posix.join(posix.dirname(file), spec);
            if (!has(target)) problems.push(`${file} imports ${spec}, which is not in the package`);
        }
    }
    // HTML pages' local scripts and stylesheets.
    for (const file of files.filter((f) => f.endsWith('.html'))) {
        const html = readFileSync(join(dir, file), 'utf8');
        for (const [, spec] of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"'#?]+)["']/g)) {
            if (/^[a-z]+:|^\/\//i.test(spec)) continue; // remote or data: URLs
            const target = posix.join(posix.dirname(file), spec);
            if (!has(target)) problems.push(`${file} refers to ${spec}, which is not in the package`);
        }
    }
    return problems;
}

/** True when allowlist `entry` accepts lint `message`. */
export function matches(entry, message) {
    if (entry.code !== message.code) return false;
    if (entry.file && entry.file !== message.file) return false;
    const text = `${message.message ?? ''}\n${message.description ?? ''}`;
    return !entry.contains || text.includes(entry.contains);
}

/**
 * Compares a `web-ext lint --output json` report with the allowlist.
 * @returns {{errors: object[], unexpected: object[], allowed: object[], unused: object[]}}
 */
export function checkLint(report, allowlist) {
    if (!report || !Array.isArray(report.errors) || !Array.isArray(report.warnings)) {
        throw new Error('not a web-ext lint JSON report (expected "errors" and "warnings" arrays)');
    }
    for (const entry of allowlist) {
        if (!entry.code || !entry.reason) throw new Error(`allowlist entry needs "code" and "reason": ${JSON.stringify(entry)}`);
    }
    const used = new Set();
    const allowed = [];
    const unexpected = [];
    for (const warning of report.warnings) {
        const entry = allowlist.find((e) => matches(e, warning));
        if (entry) {
            used.add(entry);
            allowed.push({ warning, reason: entry.reason });
        } else {
            unexpected.push(warning);
        }
    }
    return { errors: report.errors, unexpected, allowed, unused: allowlist.filter((e) => !used.has(e)) };
}

const describe = (m) => `${m.code}: ${m.message}${m.file ? ` (${m.file})` : ''}`;
// Annotation text must stay on one line.
const oneLine = (s) => String(s).replace(/\r?\n/g, ' ');

function main([command, ...args]) {
    if (command === 'package' && args.length === 1) {
        const problems = checkPackage(args[0]);
        for (const p of problems) console.log(`::error::Package: ${oneLine(p)}`);
        if (problems.length) return 1;
        console.log(`Package OK: ${listFiles(args[0]).length} files; manifest, background for both browsers, gecko ID, no development files.`);
        return 0;
    }
    if (command === 'lint' && args.length === 2) {
        const report = JSON.parse(readFileSync(args[0], 'utf8'));
        const allowlist = JSON.parse(readFileSync(args[1], 'utf8'));
        const { errors, unexpected, allowed, unused } = checkLint(report, allowlist);
        for (const e of errors) console.log(`::error::web-ext lint error ${oneLine(describe(e))}`);
        for (const w of unexpected) {
            console.log(`::error::web-ext lint warning not on the allowlist ${oneLine(describe(w))}. Fix it, or add it to ${args[1]} with a reason.`);
        }
        for (const { warning, reason } of allowed) console.log(`Allowed warning ${oneLine(describe(warning))}. Why: ${oneLine(reason)}`);
        for (const e of unused) {
            console.log(`::warning::Allowlist entry ${e.code}${e.contains ? ` ("${oneLine(e.contains)}")` : ''} no longer matches any warning; remove it from ${args[1]}.`);
        }
        for (const n of report.notices ?? []) console.log(`Notice ${oneLine(describe(n))}`);
        if (errors.length || unexpected.length) return 1;
        console.log(`web-ext lint OK: 0 errors, ${allowed.length} allowed warnings.`);
        return 0;
    }
    console.error('usage: extension-checks.mjs package <dir> | lint <report.json> <allowlist.json>');
    return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    process.exitCode = main(process.argv.slice(2));
}

export { main };
