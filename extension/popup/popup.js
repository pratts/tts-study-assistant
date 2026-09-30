import { ApiClient, ApiError, SUMMARY_UNAVAILABLE } from '../js/api-client.js';
import { DASHBOARD_URL } from '../js/config.js';
import { errorMessage } from '../js/errors.js';
import { icon } from '../js/icons.js';
import { displayDomain, formatTime, RATES, relativeDate, siteDomainFor, snapRate } from '../js/utils.js';

// All user and AI text is rendered with textContent; icons are trusted SVG
// nodes from js/icons.js. Nothing is ever assigned to innerHTML.

const api = new ApiClient();
const auth = api.authManager;
const $ = (id) => document.getElementById(id);

// How many notes the carousel loads; the last page links to the dashboard.
const CAROUSEL_LIMIT = 10;
const PASSWORD_MAX_BYTES = 72; // bcrypt's limit, enforced by the backend

const view = {
    user: null,
    notes: [],
    siteCount: 0,
    page: 0,
    showSummary: new Set(), // note ids currently showing their summary
    summarizing: new Set(),
    player: null, // last state from the background worker
    scrubbing: false,
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
    $('brand-mark').append(icon('bookOpen', { size: 16 }));
    $('menu-btn').append(icon('ellipsisVertical', { size: 18 }));
    $('prev-btn').append(icon('chevronLeft'));
    $('next-btn').append(icon('chevronRight'));
    $('stop-btn').append(icon('square', { size: 14 }));
    for (const item of document.querySelectorAll('#account-menu [data-icon]')) {
        item.prepend(icon(item.dataset.icon));
        if (item.dataset.path) item.append(externalHint());
    }

    setupSpeed();
    setupMenu();
    setupPlayer();
    setupCarousel();
    setupAuthForms();
    $('privacy-link').addEventListener('click', () => openDashboard('/privacy-policy'));
    $('retry-btn').addEventListener('click', loadSiteNotes);

    view.user = await auth.getUser();
    renderAuth();
    await loadSiteNotes();

    const { state } = await chrome.runtime.sendMessage({ action: 'getState' });
    view.player = state;
    renderPlayer();
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'stateUpdate') {
            view.player = msg.state;
            renderPlayer();
        }
    });
    // Elapsed time moves between word events; redraw while audio runs.
    setInterval(() => view.player?.isPlaying && renderPlayer(), 250);
}

function externalHint() {
    const hint = document.createElement('span');
    hint.className = 'external';
    hint.textContent = '↗';
    hint.setAttribute('aria-hidden', 'true');
    return hint;
}

function openDashboard(path) {
    chrome.tabs.create({ url: DASHBOARD_URL + path });
}

// ---------------------------------------------------------------- toasts

function toast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    $('toast-region').append(el);
    setTimeout(() => el.remove(), 3500);
}

// ---------------------------------------------------------------- 1. speed

function setupSpeed() {
    const slider = $('rate-slider');
    const ticks = $('rate-ticks');
    RATES.forEach((rate, i) => {
        const tick = document.createElement('button');
        tick.type = 'button';
        tick.className = 'tick';
        tick.style.setProperty('--i', i);
        tick.textContent = `${rate}x`;
        tick.setAttribute('aria-label', `Speed ${rate}x`);
        tick.addEventListener('click', () => setRateIndex(i));
        ticks.append(tick);
    });
    slider.addEventListener('input', () => setRateIndex(Number(slider.value)));

    chrome.storage.sync.get('settings').then(({ settings = {} }) => {
        const rate = snapRate(settings.rate ?? 1);
        renderRate(RATES.indexOf(rate));
        // Older versions allowed any value up to 3x; store the snapped one.
        if (settings.rate !== rate) saveRate(rate);
    });
}

async function setRateIndex(index) {
    renderRate(index);
    await saveRate(RATES[index]);
}

async function saveRate(rate) {
    const { settings = {} } = await chrome.storage.sync.get('settings');
    await chrome.storage.sync.set({ settings: { ...settings, rate } });
}

function renderRate(index) {
    const slider = $('rate-slider');
    slider.value = String(index);
    slider.setAttribute('aria-valuetext', `${RATES[index]}x`);
    document.querySelectorAll('.tick').forEach((tick, i) => {
        tick.classList.toggle('active', i === index);
        tick.setAttribute('aria-pressed', String(i === index));
    });
}

// ---------------------------------------------------------------- 2. header menu

function setupMenu() {
    const button = $('menu-btn');
    const menu = $('account-menu');
    const items = () => [...menu.querySelectorAll('[role="menuitem"]')];

    const open = () => {
        menu.classList.remove('hidden');
        button.setAttribute('aria-expanded', 'true');
        items()[0].focus();
    };
    const close = (focusButton = true) => {
        if (menu.classList.contains('hidden')) return;
        menu.classList.add('hidden');
        button.setAttribute('aria-expanded', 'false');
        if (focusButton) button.focus();
    };

    button.addEventListener('click', () => (menu.classList.contains('hidden') ? open() : close()));
    button.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            open();
        }
    });
    menu.addEventListener('keydown', (e) => {
        const list = items();
        const i = list.indexOf(document.activeElement);
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const next = (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
            list[next].focus();
        } else if (e.key === 'Tab') {
            close(false);
        }
    });
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && !button.contains(e.target)) close(false);
    });

    for (const item of items()) {
        if (item.dataset.path) {
            item.addEventListener('click', () => {
                close(false);
                openDashboard(item.dataset.path);
            });
        }
    }
    $('logout-btn').addEventListener('click', async () => {
        close(false);
        await auth.logout();
        chrome.runtime.sendMessage({ action: 'clearBadge' });
        view.user = null;
        renderAuth();
        await loadSiteNotes();
        toast('Logged out');
    });
}

function renderAuth() {
    const loggedIn = Boolean(view.user);
    $('logged-out-actions').classList.toggle('hidden', loggedIn);
    $('account').classList.toggle('hidden', !loggedIn);
    $('footer').classList.toggle('hidden', loggedIn); // Privacy lives in the menu then
    if (loggedIn) {
        $('menu-name').textContent = view.user.name || view.user.email;
        $('menu-email').textContent = view.user.email;
    }
}

/** A request failed because the session is gone: show the logged-out popup. */
async function handleSessionEnded(error) {
    if (!(error instanceof ApiError) || error.code !== 'TOKEN_EXPIRED') return false;
    view.user = null;
    renderAuth();
    showStatus('Your session has ended.', { hint: false });
    $('notes-section').classList.add('hidden');
    toast(error.message, 'warning');
    return true;
}

// ---------------------------------------------------------------- notes (3, 4, 6)

function showStatus(text, { hint = true, retry = false } = {}) {
    $('status').classList.remove('hidden');
    $('status-text').textContent = text;
    $('status-hint').classList.toggle('hidden', !hint);
    $('retry-btn').classList.toggle('hidden', !retry);
}

async function currentHostname() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
        return new URL(tab?.url || '').hostname;
    } catch {
        return '';
    }
}

async function loadSiteNotes() {
    $('notes-section').classList.add('hidden');
    if (!view.user) {
        showStatus('Log in to see and listen to your notes.', { hint: false });
        return;
    }
    showStatus('Loading notes…', { hint: false });

    try {
        const host = await currentHostname();
        const site = siteDomainFor(host, await api.getNotesStats());
        if (!site) {
            view.notes = [];
            view.siteCount = 0;
            showStatus(host ? `No notes from ${displayDomain(host)} yet.` : 'No notes from this page yet.');
            return;
        }
        view.notes = await api.getNotes({ domain: site.domain, page_size: CAROUSEL_LIMIT });
        view.siteCount = site.count;
        view.page = Math.min(view.page, view.notes.length);
        if (view.notes.length === 0) {
            showStatus(`No notes from ${displayDomain(site.domain)} yet.`);
            return;
        }
        $('status').classList.add('hidden');
        $('notes-section').classList.remove('hidden');
        renderCarousel();
    } catch (error) {
        if (await handleSessionEnded(error)) return;
        showStatus(errorMessage(error), { hint: false, retry: true });
    }
}

function setupCarousel() {
    $('prev-btn').addEventListener('click', () => goTo(view.page - 1));
    $('next-btn').addEventListener('click', () => goTo(view.page + 1));
    $('carousel').addEventListener('keydown', (e) => {
        if (e.target.closest('.note-body')) return; // arrow keys scroll the note
        if (e.key === 'ArrowLeft') goTo(view.page - 1);
        if (e.key === 'ArrowRight') goTo(view.page + 1);
    });
}

/** Pages: one per loaded note, then a final "view all notes" page. */
function pageCount() {
    return view.notes.length + 1;
}

function goTo(page) {
    const next = Math.max(0, Math.min(page, pageCount() - 1));
    if (next === view.page) return;
    view.page = next;
    renderCarousel();
}

function renderCarousel() {
    const count = view.siteCount;
    const badge = $('notes-count');
    badge.textContent = String(count);
    badge.setAttribute('aria-label', `${count} ${count === 1 ? 'note' : 'notes'} from this site`);

    $('prev-btn').disabled = view.page === 0;
    $('next-btn').disabled = view.page === pageCount() - 1;

    const slide = $('slide');
    slide.replaceChildren(view.page < view.notes.length ? noteCard(view.notes[view.page]) : viewAllCard());

    const dots = $('dots');
    dots.replaceChildren();
    for (let i = 0; i < pageCount(); i++) {
        const dot = document.createElement('button');
        dot.type = 'button';
        const isViewAll = i === view.notes.length;
        dot.className = isViewAll ? 'dot view-all' : 'dot';
        dot.setAttribute('aria-label', isViewAll ? 'View all notes' : `Note ${i + 1} of ${view.notes.length}`);
        if (i === view.page) dot.setAttribute('aria-current', 'true');
        dot.addEventListener('click', () => goTo(i));
        dots.append(dot);
    }
}

function hasSummary(note) {
    return Boolean(note.summary) && note.summary !== SUMMARY_UNAVAILABLE;
}

function noteCard(note) {
    const showingSummary = view.showSummary.has(note.id) && hasSummary(note);
    const card = document.createElement('article');
    card.className = 'note-card';
    card.setAttribute('aria-label', `Note ${view.page + 1} of ${view.notes.length}`);

    const meta = document.createElement('div');
    meta.className = 'note-meta';
    const date = document.createElement('span');
    date.textContent = relativeDate(note.created_at);
    const label = document.createElement('span');
    label.className = showingSummary ? 'view-label summary' : 'view-label';
    label.textContent = showingSummary ? 'Summary' : 'Note';
    meta.append(date, label);

    // Fixed-height card; the body scrolls (keyboard-focusable) for long text.
    const body = document.createElement('div');
    body.className = showingSummary ? 'note-body is-summary' : 'note-body';
    body.tabIndex = 0;
    body.setAttribute('aria-label', showingSummary ? 'Summary text' : 'Note text');
    body.textContent = showingSummary ? note.summary : note.content;

    const actions = document.createElement('div');
    actions.className = 'note-actions';
    actions.append(playButton(note, showingSummary), summaryToggle(note, showingSummary), deleteButton(note));

    card.append(meta, body, actions);
    return card;
}

function playButton(note, showingSummary) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-play';
    button.append(icon('play', { size: 14 }), document.createTextNode(showingSummary ? 'Play summary' : 'Play'));
    button.addEventListener('click', () =>
        chrome.runtime.sendMessage({ action: 'speak', text: showingSummary ? note.summary : note.content }),
    );
    return button;
}

/**
 * One button, three states:
 *   generate  (neutral sparkle)   no usable summary yet → generate one
 *   available (green sparkle)     summary exists, showing the note → show summary
 *   viewing   (document icon)     showing the summary → back to the note
 * Always summarizes the existing note (POST /notes/{id}/summarize); it never
 * creates a new note.
 */
function summaryToggle(note, showingSummary) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-btn summary-toggle';

    if (view.summarizing.has(note.id)) {
        button.dataset.state = 'generate';
        button.disabled = true;
        button.setAttribute('aria-label', 'Generating summary');
        button.title = 'Generating summary…';
        button.append(icon('loaderCircle', { className: 'spin' }));
        return button;
    }

    const state = !hasSummary(note) ? 'generate' : showingSummary ? 'viewing' : 'available';
    const text = {
        generate: note.summary === SUMMARY_UNAVAILABLE ? 'Summary unavailable for this text; try again' : 'Generate summary',
        available: 'Show summary',
        viewing: 'Show original note',
    }[state];
    button.dataset.state = state;
    button.setAttribute('aria-label', text);
    button.title = text;
    if (state !== 'generate') button.setAttribute('aria-pressed', String(state === 'viewing'));
    button.append(icon(state === 'viewing' ? 'fileText' : 'sparkles'));

    button.addEventListener('click', async () => {
        if (state === 'available') view.showSummary.add(note.id);
        if (state === 'viewing') view.showSummary.delete(note.id);
        if (state === 'generate') await generateSummary(note);
        renderCarousel();
        document.querySelector('.summary-toggle')?.focus();
    });
    return button;
}

async function generateSummary(note) {
    view.summarizing.add(note.id);
    renderCarousel();
    try {
        const { summary } = await api.summarize(note.id);
        note.summary = summary;
        if (summary === SUMMARY_UNAVAILABLE) {
            toast('Summary unavailable: the text may be too short or incomplete.', 'warning');
        } else {
            view.showSummary.add(note.id);
            toast('Summary ready');
        }
    } catch (error) {
        if (!(await handleSessionEnded(error))) toast(errorMessage(error), 'error');
    } finally {
        view.summarizing.delete(note.id);
    }
}

function deleteButton(note) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-btn delete';
    button.setAttribute('aria-label', 'Delete note');
    button.title = 'Delete note';
    button.append(icon('trash'));
    button.addEventListener('click', async () => {
        if (!confirm('Delete this note?')) return;
        button.disabled = true;
        try {
            await api.deleteNote(note.id);
            view.showSummary.delete(note.id);
            toast('Note deleted');
            chrome.runtime.sendMessage({ action: 'refreshBadge' });
            await loadSiteNotes();
        } catch (error) {
            button.disabled = false;
            if (!(await handleSessionEnded(error))) toast(errorMessage(error), 'error');
        }
    });
    return button;
}

function viewAllCard() {
    const card = document.createElement('div');
    card.className = 'view-all-card';
    const title = document.createElement('strong');
    const shown = view.notes.length;
    title.textContent = view.siteCount > shown ? `${view.siteCount - shown} more from this site` : 'That’s all from this site';
    const text = document.createElement('span');
    text.textContent = 'See, search and edit all your notes on the dashboard.';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-secondary';
    button.textContent = 'View all notes ↗';
    button.addEventListener('click', () => openDashboard('/notes'));
    card.append(title, text, button);
    return card;
}

// ---------------------------------------------------------------- 5. player

function setupPlayer() {
    const scrubber = $('scrubber');
    scrubber.addEventListener('input', () => {
        view.scrubbing = true;
        const total = view.player?.totalMs || 0;
        $('elapsed').textContent = formatTime((Number(scrubber.value) / 1000) * total);
    });
    scrubber.addEventListener('change', async () => {
        const fraction = Number(scrubber.value) / 1000;
        view.scrubbing = false;
        const { state } = await chrome.runtime.sendMessage({ action: 'seek', fraction });
        view.player = state;
        renderPlayer();
    });

    $('play-pause-btn').addEventListener('click', async () => {
        const action = view.player?.isPlaying ? 'pause' : 'resume';
        const { state } = await chrome.runtime.sendMessage({ action });
        view.player = state;
        renderPlayer();
    });
    $('stop-btn').addEventListener('click', async () => {
        const { state } = await chrome.runtime.sendMessage({ action: 'stop' });
        view.player = state;
        renderPlayer();
    });
}

function renderPlayer() {
    const s = view.player;
    $('player').classList.toggle('hidden', !s?.currentText);
    if (!s?.currentText) return;

    const live = s.elapsedMs + (s.speakingSince ? Date.now() - s.speakingSince : 0);
    const total = s.totalMs || 0;
    const elapsed = Math.min(live, total);

    $('now-playing').textContent = s.currentText;
    $('total').textContent = formatTime(total);
    if (!view.scrubbing) {
        $('elapsed').textContent = formatTime(elapsed);
        const scrubber = $('scrubber');
        scrubber.value = String(total ? Math.round((elapsed / total) * 1000) : 0);
        scrubber.setAttribute('aria-valuetext', `${formatTime(elapsed)} of ${formatTime(total)}`);
    }

    const playPause = $('play-pause-btn');
    const label = s.isPlaying ? 'Pause' : s.isPaused ? 'Resume' : 'Play';
    playPause.setAttribute('aria-label', label);
    playPause.title = label;
    playPause.replaceChildren(icon(s.isPlaying ? 'pause' : 'play', { size: 18 }));

    $('stop-btn').disabled = !s.isPlaying && !s.isPaused && s.charIndex === 0 && elapsed === 0;
}

// ---------------------------------------------------------------- auth forms

function setupAuthForms() {
    $('login-btn').addEventListener('click', () => openModal('login-modal'));
    $('signup-btn').addEventListener('click', () => openModal('signup-modal'));

    for (const modal of document.querySelectorAll('.modal-overlay')) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.closest('[data-close]')) closeModal(modal.id);
        });
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal(modal.id);
            if (e.key === 'Tab') trapFocus(modal, e);
        });
    }

    $('login-form').addEventListener('submit', (e) =>
        submitAuth(e, 'login-modal', () => auth.login($('login-email').value.trim(), $('login-password').value)),
    );
    $('signup-form').addEventListener('submit', (e) =>
        submitAuth(e, 'signup-modal', () => {
            const name = $('signup-name').value.trim();
            const email = $('signup-email').value.trim();
            const password = $('signup-password').value;
            if (!name || !email || !password) throw new ApiError(400, 'Name, email and password are required.');
            if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
                throw new ApiError(400, 'Password is too long. Up to 72 characters; accented letters and emoji count as more than one.');
            }
            return auth.register(name, email, password);
        }),
    );
}

let lastFocus = null;

function openModal(id) {
    lastFocus = document.activeElement;
    const modal = $(id);
    modal.hidden = false;
    modal.querySelector('.form-error').classList.add('hidden');
    modal.querySelector('input').focus();
}

function closeModal(id) {
    $(id).hidden = true;
    lastFocus?.focus();
}

function trapFocus(modal, e) {
    const focusable = [...modal.querySelectorAll('button, input')].filter((el) => !el.disabled);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
}

async function submitAuth(event, modalId, action) {
    event.preventDefault();
    const form = event.target;
    const error = form.querySelector('.form-error');
    const submit = form.querySelector('[type="submit"]');
    error.classList.add('hidden');
    submit.disabled = true;
    try {
        view.user = await action();
        form.reset();
        closeModal(modalId);
        renderAuth();
        chrome.runtime.sendMessage({ action: 'refreshBadge' });
        await loadSiteNotes();
        toast(`Welcome, ${view.user.name || view.user.email}!`);
    } catch (err) {
        error.textContent = errorMessage(err);
        error.classList.remove('hidden');
    } finally {
        submit.disabled = false;
    }
}
