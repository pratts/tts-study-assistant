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
