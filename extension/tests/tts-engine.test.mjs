import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateDurationMs, TtsEngine, wordStartAt } from '../js/tts-engine.js';

/** A fake chrome.tts plus a controllable clock. */
function setup(settings = { rate: 1 }) {
    let now = 1_000;
    const calls = [];
    let current = null; // { text, onEvent }
    const tts = {
        speak: (text, options) => {
            current = { text, onEvent: options.onEvent, options };
            calls.push(['speak', text, options.rate]);
        },
        stop: () => calls.push(['stop']),
        pause: () => calls.push(['pause']),
        resume: () => calls.push(['resume']),
    };
    const states = [];
    const engine = new TtsEngine({ tts, getSettings: async () => settings, onChange: (s) => states.push(s), now: () => now });
    return {
        engine,
        calls,
        settings,
        states,
        advance: (ms) => (now += ms),
        event: (e) => current.onEvent(e),
        current: () => current,
        elapsed: () => engine.elapsedMs + (engine.speakingSince === null ? 0 : now - engine.speakingSince),
    };
}

const TEXT = 'The quick brown fox jumps over the lazy dog. '.repeat(10); // 450 chars

test('estimates the total up front from length and rate', async () => {
    const t = setup({ rate: 2 });
    await t.engine.play(TEXT);
    assert.equal(t.engine.totalMs, estimateDurationMs(TEXT.length, 2));
    assert.ok(t.engine.isPlaying);
});

test('refines the total from word events once enough speech is measured', async () => {
    const t = setup();
    await t.engine.play(TEXT);
    const estimate = t.engine.totalMs;
    // Real speech is faster than the estimate: 90 chars in 3s = 30 chars/s.
    t.advance(3000);
    t.event({ type: 'word', charIndex: 90 });
    assert.ok(Math.abs(t.engine.totalMs - 15_000) < 1, `total ${t.engine.totalMs}`); // 450 chars / 30 per s
    assert.notEqual(t.engine.totalMs, estimate);
});

test('pause stops the clock; resume continues it', async () => {
    const t = setup();
    await t.engine.play(TEXT);
    t.advance(2000);
    t.engine.pause();
    t.advance(10_000);
    assert.equal(t.elapsed(), 2000);
    await t.engine.resume();
    t.advance(500);
    assert.equal(t.elapsed(), 2500);
    assert.deepEqual(t.calls.filter((c) => c[0] !== 'speak' && c[0] !== 'stop'), [['pause'], ['resume']]);
});

test('stop rewinds to 0 and Play starts again from the beginning', async () => {
    const t = setup();
    await t.engine.play(TEXT);
    t.advance(2000);
    t.event({ type: 'word', charIndex: 40 });
    await t.engine.stop();
    assert.equal(t.engine.charIndex, 0);
    assert.equal(t.elapsed(), 0);
    assert.equal(t.engine.isPlaying, false);
    assert.equal(t.engine.snapshot().currentText, TEXT, 'the text is kept');
    await t.engine.resume();
    assert.equal(t.current().text, TEXT);
});

test('seek speaks from the start of the word at that position', async () => {
    const t = setup();
    await t.engine.play(TEXT);
    await t.engine.seek(0.5);
    const char = wordStartAt(TEXT, TEXT.length / 2);
    assert.equal(t.current().text, TEXT.slice(char));
    assert.ok(/^\S/.test(t.current().text));
    assert.equal(t.engine.charIndex, char);
    // Word events are relative to the new utterance.
    t.event({ type: 'word', charIndex: 4 });
    assert.equal(t.engine.charIndex, char + 4);
});

test('ignores events from an utterance that was replaced', async () => {
    const t = setup();
    await t.engine.play(TEXT);
    const stale = t.current().onEvent;
    await t.engine.seek(0.5);
    stale({ type: 'end' });
    assert.equal(t.engine.isPlaying, true);
});

test('end marks the track finished with elapsed = total', async () => {
    const t = setup();
    await t.engine.play('short text');
    t.advance(1200);
    t.event({ type: 'end' });
    assert.equal(t.engine.isPlaying, false);
    assert.equal(t.engine.totalMs, 1200);
    assert.equal(t.engine.charIndex, 'short text'.length);
});

test('a rate change while playing re-speaks from the current word at the new rate', async () => {
    const t = setup({ rate: 1 });
    await t.engine.play(TEXT);
    t.advance(1000);
    t.event({ type: 'word', charIndex: 22 });
    t.settings.rate = 2;
    await t.engine.applyRate();
    assert.equal(t.current().options.rate, 2);
    assert.equal(t.current().text, TEXT.slice(wordStartAt(TEXT, 22)));
});

test('queued text plays after the current one ends', async () => {
    const t = setup();
    await t.engine.play('first');
    t.engine.enqueue('second');
    t.event({ type: 'end' });
    await new Promise((r) => setTimeout(r, 0)); // play() reads settings asynchronously
    assert.equal(t.current().text, 'second');
});

test('wordStartAt never cuts a word', () => {
    assert.equal(wordStartAt('hello world', 8), 6);
    assert.equal(wordStartAt('hello world', 0), 0);
    assert.equal(wordStartAt('hello world', 99), 6);
});
