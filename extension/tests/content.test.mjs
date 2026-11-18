// Runs content.js in a vm context with a small fake DOM and `chrome`, to
// check it behaves when injected more than once into the same page.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../content.js', import.meta.url), 'utf8');

class FakeElement {
    constructor(tag) {
        this.tagName = tag.toUpperCase();
        this.children = [];
        this.parent = null;
        this.style = {};
        this.className = '';
        this.textContent = '';
        this.listeners = {};
        const names = () => this.className.split(' ').filter(Boolean);
        this.classList = {
            add: (c) => (this.className = [...new Set([...names(), c])].join(' ')),
            remove: (c) => (this.className = names().filter((n) => n !== c).join(' ')),
            contains: (c) => names().includes(c),
        };
    }
    set innerHTML(_html) {
        throw new Error('content.js must build elements with DOM methods, not innerHTML');
    }
    append(...nodes) {
        for (const n of nodes) this.appendChild(n);
    }
    appendChild(node) {
        node.parent = this;
        this.children.push(node);
        return node;
    }
    remove() {
        if (!this.parent) return;
        this.parent.children = this.parent.children.filter((c) => c !== this);
        this.parent = null;
    }
    contains(node) {
        for (let n = node; n; n = n.parent) if (n === this) return true;
        return false;
    }
    addEventListener(type, fn) {
        (this.listeners[type] ??= []).push(fn);
    }
}

function fakeEvent() {
    const listeners = new Set();
    return {
        addListener: (fn) => listeners.add(fn),
        removeListener: (fn) => listeners.delete(fn),
        size: () => listeners.size,
    };
}

/** A page: one global scope (an extension's isolated world) shared by every injection. */
function fakePage() {
    const docListeners = {};
    const body = new FakeElement('body');
    const document = {
        body,
        title: 'Page',
        referrer: '',
        createElement: (tag) => new FakeElement(tag),
        querySelector: () => null,
        addEventListener: (type, fn) => (docListeners[type] ??= new Set()).add(fn),
        removeEventListener: (type, fn) => docListeners[type]?.delete(fn),
    };
    let selection = '';
    const window = {
        innerWidth: 1000,
        scrollY: 0,
        location: { href: 'https://example.com/' },
        getSelection: () => ({
            toString: () => selection,
            getRangeAt: () => ({ getBoundingClientRect: () => ({ left: 100, top: 200, width: 50 }) }),
            removeAllRanges: () => (selection = ''),
        }),
    };
    window.self = window.top = window;
    const context = vm.createContext({
        document,
        window,
        console: { log() {}, error() {} },
        setTimeout: (fn) => fn(), // run the mouseup delay immediately
    });
    context.globalThis = context;
    return {
        context,
        body,
        buttons: () => body.children.filter((c) => c.id === 'tts-action-button'),
        listenerCount: (type) => docListeners[type]?.size ?? 0,
        select: (text) => (selection = text),
        fire: (type, event = { target: body }) => [...(docListeners[type] ?? [])].forEach((fn) => fn(event)),
    };
}

/** A fresh extension context (what each injection's `chrome` would be). */
function fakeChrome() {
    return {
        runtime: { id: 'ext-id', sendMessage: async () => ({ enabled: true }) },
        storage: { onChanged: fakeEvent() },
    };
}

async function inject(page, chrome) {
    page.context.chrome = chrome;
    vm.runInContext(SOURCE, page.context);
    await new Promise((resolve) => setImmediate(resolve)); // init() awaits getSettings
}

test('builds the selection button with two buttons and no innerHTML', async () => {
    const page = fakePage();
    await inject(page, fakeChrome());
    const [button] = page.buttons();
    assert.ok(button, 'button added to the page');
    assert.deepEqual(button.children.map((b) => [b.className, b.textContent]), [
        ['tts-btn tts-save-play', 'Save & Play'],
        ['tts-btn tts-summarize', 'Summarize'],
    ]);
});

test('a second injection into a page with a live copy changes nothing (Firefox already injected)', async () => {
    const page = fakePage();
    const chrome = fakeChrome();
    await inject(page, chrome);
    await inject(page, chrome);
    assert.equal(page.buttons().length, 1);
    assert.equal(page.listenerCount('mouseup'), 1);
    assert.equal(chrome.storage.onChanged.size(), 1);
});

test('an injection after a reload replaces the orphaned copy (Chrome)', async () => {
    const page = fakePage();
    const oldChrome = fakeChrome();
    await inject(page, oldChrome);
    const [oldButton] = page.buttons();
    delete oldChrome.runtime.id; // the extension was reloaded: the old context is dead

    await inject(page, fakeChrome());
    const buttons = page.buttons();
    assert.equal(buttons.length, 1);
    assert.notEqual(buttons[0], oldButton, 'the old button is removed, a new one added');
    assert.equal(page.listenerCount('mouseup'), 1, "the old copy's listeners are removed");
    assert.equal(oldChrome.storage.onChanged.size(), 0);
});

test('an orphaned copy removes itself on the next mouseup instead of showing a dead button', async () => {
    const page = fakePage();
    const chrome = fakeChrome();
    await inject(page, chrome);
    delete chrome.runtime.id;
    page.select('some text');
    page.fire('mouseup');
    assert.equal(page.buttons().length, 0);
    assert.equal(page.listenerCount('mouseup'), 0);
});

test('a live copy shows the button for a selection', async () => {
    const page = fakePage();
    await inject(page, fakeChrome());
    page.select('some text');
    page.fire('mouseup');
    const [button] = page.buttons();
    assert.ok(!button.classList.contains('hidden'));
    assert.equal(button.style.left, '135px');
});
