import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TtsEngine } from '../js/tts-engine.js';
import { createWebSpeechTts, pickTts } from '../js/tts-webspeech.js';

class FakeUtterance {
    constructor(text) {
        this.text = text;
    }
}

/**
 * A fake speechSynthesis. `cancelStyle` is how the browser ends a cancelled
 * utterance: 'end' (Firefox) or 'error' with "interrupted" (Chrome-style).
 */
function fakeSynth({ voices = [{ name: 'Alex' }, { name: 'Samantha' }], cancelStyle = 'end' } = {}) {
    const listeners = new Set();
    const synth = {
        spoken: [],
        calls: [],
        paused: false,
        voices,
        getVoices: () => synth.voices,
        addEventListener: (type, fn) => type === 'voiceschanged' && listeners.add(fn),
        removeEventListener: (type, fn) => listeners.delete(fn),
        speak: (u) => {
            synth.calls.push('speak');
            synth.spoken.push(u);
        },
        cancel: () => {
            synth.calls.push('cancel');
            for (const u of synth.spoken.splice(0)) {
                if (cancelStyle === 'end') u.onend?.({});
                else u.onerror?.({ error: 'interrupted' });
            }
        },
        pause: () => {
            synth.calls.push('pause');
            synth.paused = true;
        },
        resume: () => {
            synth.calls.push('resume');
            synth.paused = false;
        },
        loadVoices: (list) => {
            synth.voices = list;
            for (const fn of [...listeners]) fn();
        },
        listenerCount: () => listeners.size,
        last: () => synth.spoken.at(-1),
    };
    return synth;
}

/** Manual timers, so the voice timeout can be fired on demand. */
function fakeTimers() {
    const timers = new Map();
    let next = 1;
    return {
        setTimer: (fn) => {
            timers.set(next, fn);
            return next++;
        },
        clearTimer: (id) => timers.delete(id),
        fireAll: () => {
            for (const [id, fn] of [...timers]) {
                timers.delete(id);
                fn();
            }
        },
        pending: () => timers.size,
    };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(synthOptions) {
    const synth = fakeSynth(synthOptions);
    const timers = fakeTimers();
    const tts = createWebSpeechTts(synth, { Utterance: FakeUtterance, ...timers });
    const events = [];
    const onEvent = (e) => events.push(e);
    return { synth, timers, tts, events, onEvent };
}

test('speak passes text, rate, pitch and volume to an utterance', () => {
    const { synth, tts, onEvent } = setup();
    tts.speak('hello world', { rate: 1.5, pitch: 0.8, volume: 0.5, onEvent });
    const u = synth.last();
    assert.equal(u.text, 'hello world');
    assert.equal(u.rate, 1.5);
    assert.equal(u.pitch, 0.8);
    assert.equal(u.volume, 0.5);
    assert.equal(u.voice, undefined, 'no voice name → browser default');
});

test('rate, pitch and volume are clamped to what Web Speech accepts', () => {
    const { synth, tts } = setup();
    tts.speak('a', { rate: 20, pitch: 5, volume: 3 });
    assert.deepEqual([synth.last().rate, synth.last().pitch, synth.last().volume], [10, 2, 1]);
    tts.speak('b', { rate: 0, pitch: -1, volume: -1 });
    assert.deepEqual([synth.last().rate, synth.last().pitch, synth.last().volume], [0.1, 0, 0]);
    tts.speak('c', { rate: 'fast' });
    assert.deepEqual([synth.last().rate, synth.last().pitch, synth.last().volume], [1, 1, 1]);
});

test('a voice is chosen by name; an unknown name falls back to the default', async () => {
    const { synth, tts } = setup();
    tts.speak('a', { voiceName: 'Samantha' });
    await tick();
    assert.equal(synth.last().voice.name, 'Samantha');
    tts.speak('b', { voiceName: 'Nobody' });
    await tick();
    assert.equal(synth.last().text, 'b');
    assert.equal(synth.last().voice, undefined);
});

test('a named voice waits for voiceschanged when voices are not loaded yet', async () => {
    const { synth, timers, tts } = setup({ voices: [] });
    tts.speak('hello', { voiceName: 'Samantha' });
    await tick();
    assert.equal(synth.spoken.length, 0, 'waits for voices');
    synth.loadVoices([{ name: 'Samantha' }]);
    await tick();
    assert.equal(synth.last().voice.name, 'Samantha');
    assert.equal(timers.pending(), 0, 'timeout cleared');
    assert.equal(synth.listenerCount(), 0, 'listener removed');
});

test('a named voice speaks with the default voice if voices never load', async () => {
    const { synth, timers, tts } = setup({ voices: [] });
    tts.speak('hello', { voiceName: 'Samantha' });
    timers.fireAll();
    await tick();
    assert.equal(synth.last().text, 'hello');
    assert.equal(synth.last().voice, undefined);
});

test('stop while waiting for voices drops the pending utterance', async () => {
    const { synth, tts } = setup({ voices: [] });
    tts.speak('hello', { voiceName: 'Samantha' });
    tts.stop();
    synth.loadVoices([{ name: 'Samantha' }]);
    await tick();
    assert.equal(synth.spoken.length, 0);
});

test('boundary, end and real errors map to chrome.tts events', () => {
    const { synth, tts, events, onEvent } = setup();
    tts.speak('hello world', { onEvent });
    const u = synth.last();
    u.onstart({});
    u.onboundary({ name: 'word', charIndex: 6 });
    u.onboundary({ name: 'sentence', charIndex: 0 }); // not a word
    u.onboundary({ charIndex: 8 }); // no name: treated as a word
    u.onend({});
    assert.deepEqual(events, [
        { type: 'start', charIndex: 0 },
        { type: 'word', charIndex: 6 },
        { type: 'word', charIndex: 8 },
        { type: 'end', charIndex: 11 },
    ]);

    events.length = 0;
    synth.spoken.length = 0; // a finished utterance leaves the synthesizer's queue
    tts.speak('again', { onEvent });
    synth.last().onerror({ error: 'synthesis-failed' });
    assert.deepEqual(events, [{ type: 'error', errorMessage: 'synthesis-failed' }]);
});

for (const cancelStyle of ['end', 'error']) {
    test(`a cancelled utterance reports "interrupted", not end or error (${cancelStyle === 'end' ? 'Firefox' : 'Chrome'}-style cancel)`, () => {
        const { synth, tts, events, onEvent } = setup({ cancelStyle });
        tts.speak('first', { onEvent });
        tts.stop();
        assert.deepEqual(events, [{ type: 'interrupted' }]);

        events.length = 0;
        tts.speak('second', { onEvent });
        const old = synth.last();
        tts.speak('third', { onEvent }); // replaces "second"
        assert.deepEqual(events, [{ type: 'interrupted' }]);
        old.onboundary?.({ name: 'word', charIndex: 2 }); // late event from the old one
        assert.equal(events.length, 1, 'late events from a replaced utterance are dropped');
        assert.equal(synth.last().text, 'third');
    });
}

test('stop cancels, and un-pauses so the next utterance is heard', () => {
    const { synth, tts } = setup();
    tts.speak('a', {});
    tts.pause();
    assert.equal(synth.paused, true);
    tts.stop();
    assert.equal(synth.paused, false);
    tts.speak('b', {});
    assert.deepEqual(synth.calls, ['cancel', 'speak', 'pause', 'cancel', 'resume', 'cancel', 'speak']);
});

test('pause and resume pass through', () => {
    const { synth, tts } = setup();
    tts.pause();
    tts.resume();
    assert.deepEqual(synth.calls, ['pause', 'resume']);
});

test('pickTts prefers chrome.tts, then Web Speech, then an error stand-in', () => {
    const chromeTts = { speak() {}, stop() {}, pause() {}, resume() {} };
    const synth = fakeSynth();
    assert.equal(pickTts({ chromeTts, synth, Utterance: FakeUtterance }), chromeTts, 'Chrome keeps chrome.tts');

    const firefox = pickTts({ chromeTts: undefined, synth, Utterance: FakeUtterance });
    firefox.speak('hi', {});
    assert.equal(synth.last().text, 'hi', 'Firefox uses speechSynthesis');

    const events = [];
    const none = pickTts({});
    none.speak('hi', { onEvent: (e) => events.push(e) });
    assert.equal(events[0].type, 'error');
    none.stop();
    none.pause();
    none.resume();
});

// TtsEngine on top of the Web Speech wrapper: the Firefox path end to end.

function engineSetup(settings = { rate: 1 }, synthOptions) {
    let now = 1_000;
    const synth = fakeSynth(synthOptions);
    const tts = createWebSpeechTts(synth, { Utterance: FakeUtterance, ...fakeTimers() });
    const engine = new TtsEngine({ tts, getSettings: async () => settings, onChange: () => {}, now: () => now });
    return { engine, synth, advance: (ms) => (now += ms) };
}

const TEXT = 'The quick brown fox jumps over the lazy dog. '.repeat(10);

for (const cancelStyle of ['end', 'error']) {
    test(`engine: seek and stop never leave the player in an error or finished state (${cancelStyle}-style cancel)`, async () => {
        const { engine, synth, advance } = engineSetup({ rate: 1 }, { cancelStyle });
        await engine.play(TEXT);
        advance(1000);
        synth.last().onboundary({ name: 'word', charIndex: 10 });
        assert.equal(engine.charIndex, 10);

        await engine.seek(0.5);
        assert.equal(engine.isPlaying, true, 'cancelling the old utterance is not an error or an end');
        const offset = engine.offset;
        synth.last().onboundary({ name: 'word', charIndex: 4 });
        assert.equal(engine.charIndex, offset + 4, 'word events are relative to the new utterance');

        await engine.stop();
        assert.equal(engine.isPlaying, false);
        assert.equal(engine.charIndex, 0);
        assert.equal(synth.spoken.length, 0);
    });
}

test('engine: word events move progress and end plays the queue', async () => {
    const { engine, synth, advance } = engineSetup();
    await engine.play('first text');
    engine.enqueue('second text');
    advance(500);
    synth.last().onboundary({ name: 'word', charIndex: 6 });
    assert.equal(engine.charIndex, 6);
    synth.last().onend({});
    await tick(); // play() reads settings asynchronously
    assert.equal(synth.last().text, 'second text');
    assert.equal(engine.isPlaying, true);
});

test('engine: pause then seek is heard (the synthesizer is un-paused)', async () => {
    const { engine, synth } = engineSetup();
    await engine.play(TEXT);
    engine.pause();
    assert.equal(synth.paused, true);
    await engine.seek(0.25);
    assert.equal(synth.paused, false);
    assert.equal(engine.isPlaying, true);
});

test('engine: a rate change re-speaks at the new rate', async () => {
    const settings = { rate: 1 };
    const { engine, synth } = engineSetup(settings);
    await engine.play(TEXT);
    settings.rate = 2;
    await engine.applyRate();
    assert.equal(synth.last().rate, 2);
});
