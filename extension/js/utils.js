// Small pure helpers shared by the popup and covered by tests/.

/** The four playback speeds. chrome.tts accepts 0.1–10, so all are valid. */
export const RATES = [0.5, 1, 1.5, 2];
export const DEFAULT_RATE = 1;

/** Nearest supported speed (older versions allowed any value up to 3x). */
export function snapRate(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_RATE;
    return RATES.reduce((best, r) => (Math.abs(r - n) < Math.abs(best - n) ? r : best), RATES[0]);
}

/**
 * The backend stores each note's registrable domain (public suffix list:
 * news.bbc.co.uk → bbc.co.uk). Instead of re-implementing that list, match the
 * tab's hostname against the domains the user actually has notes for
 * (GET /notes/stats): the longest one equal to the hostname or a
 * dot-separated suffix of it.
 */
export function siteDomainFor(hostname, stats) {
    if (!hostname) return null;
    const host = hostname.toLowerCase();
    let best = null;
    for (const s of stats) {
        const domain = (s.domain || '').toLowerCase();
        if (!domain) continue;
        if ((host === domain || host.endsWith('.' + domain)) && (!best || domain.length > best.domain.length)) best = s;
    }
    return best;
}

/** m:ss (or h:mm:ss) for a duration in milliseconds. */
export function formatTime(ms) {
    const total = Math.max(0, Math.round((ms || 0) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Truncates by characters (code points), never splitting an emoji. */
export function truncate(text, max) {
    const chars = [...(text || '')];
    return chars.length <= max ? text : chars.slice(0, max).join('') + '…';
}

/** Longest notification message we send; Firefox cuts longer ones off. */
export const NOTIFICATION_MAX = 200;

/**
 * Text shortened for a notification: whitespace collapsed, at most `max`
 * characters including the "…", cut at a word boundary when one is near.
 * Counts graphemes, so emoji and accented letters are never split.
 */
export function truncateForNotification(text, max = NOTIFICATION_MAX) {
    const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
    const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(clean)].map((s) => s.segment);
    if (graphemes.length <= max) return clean;
    const cut = graphemes.slice(0, max - 1).join('');
    const space = cut.lastIndexOf(' ');
    // Back up to the last word only if that keeps most of the text.
    const head = space >= cut.length * 0.7 ? cut.slice(0, space) : cut;
    return `${head.replace(/[\s.,;:!?-]+$/, '')}…`;
}

const FULL_SUMMARY_HINT = ' Open the extension for the full summary.';

/** A summary short enough for a notification (Firefox cuts long ones off). */
export function summaryNotification(summary) {
    if (!summary) return 'Summary generated successfully.';
    const short = truncateForNotification(summary);
    if (short === summary.replace(/\s+/g, ' ').trim()) return short;
    return truncateForNotification(summary, NOTIFICATION_MAX - FULL_SUMMARY_HINT.length) + FULL_SUMMARY_HINT;
}

export function relativeDate(iso, now = Date.now()) {
    const date = new Date(iso);
    const mins = Math.floor((now - date.getTime()) / 60000);
    if (Number.isNaN(mins)) return '';
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
    return date.toLocaleDateString();
}

// Notes saved from Chrome's PDF viewer or local files have no web domain.
const LOCAL_SOURCES = new Set(['mhjfbmdgcfjbbpaeojofohoefgiehjai', 'local-file']);

export function displayDomain(domain) {
    if (!domain) return 'this page';
    return LOCAL_SOURCES.has(domain) ? 'Downloaded/Local file' : domain;
}
