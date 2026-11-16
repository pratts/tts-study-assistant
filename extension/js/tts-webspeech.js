// chrome.tts-shaped wrapper around the Web Speech API (speechSynthesis), for
// browsers without chrome.tts (Firefox). TtsEngine drives either one through
// the same speak/stop/pause/resume calls and chrome.tts-style events.
//
// Firefox runs the background as an event page, which has a window and so
// speechSynthesis. Chrome's service worker has neither, but has chrome.tts.
//
// Differences from chrome.tts that this hides or that callers should know:
// - Voices load asynchronously: getVoices() can be empty until
//   "voiceschanged". A named voice waits for it (up to VOICES_TIMEOUT_MS),
//   then falls back to the default voice.
// - cancel() ends the old utterance with an "interrupted"/"canceled" error
//   (Chrome-style) or a plain "end" (Firefox). Both are reported as
//   "interrupted", never as "error" or "end", so a seek isn't a failure.
// - Word "boundary" events depend on the voice and OS. Without them
//   TtsEngine keeps its time-based estimate, as with chrome.tts voices
//   that don't send word events.
// - pause()/resume() are unreliable with some Linux speech-dispatcher voices;
//   that is checked in the release QA (#51).

export const VOICES_TIMEOUT_MS = 1000;

const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/**
 * @param {SpeechSynthesis} synth
 * @param {object} [deps]  injectable for tests
 * @param {typeof SpeechSynthesisUtterance} [deps.Utterance]
 * @param {number} [deps.voicesTimeoutMs]
 * @param {typeof setTimeout} [deps.setTimer]
 * @param {typeof clearTimeout} [deps.clearTimer]
 */
export function createWebSpeechTts(synth, {
    Utterance = globalThis.SpeechSynthesisUtterance,
    voicesTimeoutMs = VOICES_TIMEOUT_MS,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id),
} = {}) {
    let generation = 0; // bumped by stop() and every speak(); stale work is dropped

    /** Resolves once voices are listed, or after the timeout. */
    function voicesReady() {
        if (synth.getVoices().length) return Promise.resolve();
        return new Promise((resolve) => {
            const done = () => {
                clearTimer(timer);
                synth.removeEventListener?.('voiceschanged', done);
                resolve();
            };
            const timer = setTimer(done, voicesTimeoutMs);
            synth.addEventListener?.('voiceschanged', done);
        });
    }

    function cancel() {
        generation++;
        synth.cancel();
        // A paused synthesizer stays paused for the next utterance.
        if (synth.paused) synth.resume();
    }

    function utter(text, options, myGeneration) {
        const u = new Utterance(text);
        u.rate = clamp(options.rate, 0.1, 10, 1);
        u.pitch = clamp(options.pitch, 0, 2, 1);
        u.volume = clamp(options.volume, 0, 1, 1);
        if (options.voiceName) {
            const voice = synth.getVoices().find((v) => v.name === options.voiceName);
            if (voice) u.voice = voice;
        }

        const onEvent = options.onEvent || (() => {});
        // After stop() or a newer speak(), this utterance's events mean "interrupted".
        const current = () => myGeneration === generation;
        u.onstart = () => current() && onEvent({ type: 'start', charIndex: 0 });
        u.onboundary = (e) => {
            if (!current() || (e.name && e.name !== 'word')) return;
            onEvent({ type: 'word', charIndex: e.charIndex });
        };
        u.onend = () => onEvent(current() ? { type: 'end', charIndex: text.length } : { type: 'interrupted' });
        u.onerror = (e) => {
            if (!current() || e.error === 'interrupted' || e.error === 'canceled') {
                onEvent({ type: 'interrupted' });
                return;
            }
            onEvent({ type: 'error', errorMessage: e.error || 'speech synthesis failed' });
        };
        synth.speak(u);
    }

    return {
        /** Always replaces what is speaking; TtsEngine keeps its own queue (`enqueue` is ignored). */
        speak(text, options = {}) {
            cancel();
            const myGeneration = generation;
            if (!options.voiceName) {
                utter(text, options, myGeneration);
                return;
            }
            voicesReady().then(() => {
                if (myGeneration === generation) utter(text, options, myGeneration);
            });
        },
        stop: cancel,
        pause: () => synth.pause(),
        resume: () => synth.resume(),
    };
}

/**
 * chrome.tts where it exists (Chrome), else the Web Speech wrapper (Firefox),
 * else a stand-in that reports an error so the player doesn't hang.
 */
export function pickTts({ chromeTts, synth, Utterance } = {}) {
    if (chromeTts) return chromeTts;
    if (synth && Utterance) return createWebSpeechTts(synth, { Utterance });
    return {
        speak: (_text, { onEvent } = {}) => onEvent?.({ type: 'error', errorMessage: 'Text-to-speech is not available in this browser' }),
        stop() {},
        pause() {},
        resume() {},
    };
}
