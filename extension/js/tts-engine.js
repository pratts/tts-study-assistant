// Text-to-speech playback with progress, pause/resume, stop and seek, on top
// of chrome.tts (injected, so it can be tested without Chrome).
//
// chrome.tts never reports a duration. The total starts as an estimate from
// text length and rate (CHARS_PER_SECOND), then, once word-boundary events
// arrive, is re-derived from the measured speed. So it is approximate for the
// first second or two, and stays an estimate for voices without word events.

export const CHARS_PER_SECOND = 14; // ~165 words/minute at 1x
const REFINE_AFTER_MS = 1500;

export function estimateDurationMs(length, rate) {
    return (length / (CHARS_PER_SECOND * (rate || 1))) * 1000;
}

/** Start of the word containing (or just before) `index`, so seeking never cuts a word. */
export function wordStartAt(text, index) {
    let i = Math.max(0, Math.min(Math.round(index), text.length));
    while (i > 0 && !/\s/.test(text[i - 1])) i--;
    return i;
}

export class TtsEngine {
    /**
     * @param {object} deps
     * @param {{speak: Function, stop: Function, pause: Function, resume: Function}} deps.tts
     * @param {() => Promise<object>} deps.getSettings  rate, pitch, volume, voice
     * @param {(state: object) => void} deps.onChange
     * @param {() => number} [deps.now]
     */
    constructor({ tts, getSettings, onChange, now = () => Date.now() }) {
        this.tts = tts;
        this.getSettings = getSettings;
        this.onChange = onChange;
        this.now = now;
        this.text = '';
        this.queue = [];
        this.isPlaying = false;
        this.isPaused = false;
        this.rate = 1;
        this.charIndex = 0; // absolute position in `text`
        this.elapsedMs = 0; // speaking time before `speakingSince`
        this.speakingSince = null; // timestamp while audio is running
        this.totalMs = 0;
        this.utteranceId = 0; // events from older utterances are ignored
        this.offset = 0; // where the current utterance starts in `text`
        this.base = { char: 0, elapsed: 0 }; // where speed measurement starts
    }

    /** Plain snapshot for the popup; elapsed is live while playing. */
    snapshot() {
        return {
            currentText: this.text,
            textLength: this.text.length,
            isPlaying: this.isPlaying,
            isPaused: this.isPaused,
            rate: this.rate,
            charIndex: this.charIndex,
            elapsedMs: this.elapsedMs,
            speakingSince: this.speakingSince,
            totalMs: this.totalMs,
            queueLength: this.queue.length,
        };
    }

    /** Plays `text` from the start, replacing whatever is playing. */
    async play(text) {
        this.text = text;
        this.elapsedMs = 0;
        await this._speakFrom(0);
    }

    enqueue(text) {
        if (!this.isPlaying && !this.isPaused) return this.play(text);
        this.queue.push(text);
        this._emit();
    }

    pause() {
        if (!this.isPlaying) return;
        this._tick();
        this.speakingSince = null;
        this.tts.pause();
        this.isPlaying = false;
        this.isPaused = true;
        this._emit();
    }

    /** Resumes a pause; after a stop or the end, plays again from the start. */
    async resume() {
        if (this.isPaused) {
            this.tts.resume();
            this.speakingSince = this.now();
            this.isPlaying = true;
            this.isPaused = false;
            this._emit();
            return;
        }
        if (!this.isPlaying && this.text) await this.play(this.text);
    }

    /** Stops and rewinds to 0, keeping the text so Play starts it again. */
    async stop() {
        this.utteranceId++;
        this.tts.stop();
        this.queue = [];
        this.isPlaying = false;
        this.isPaused = false;
        this.charIndex = 0;
        this.elapsedMs = 0;
        this.speakingSince = null;
        const { rate } = await this._settings();
        this.rate = rate;
        this.totalMs = estimateDurationMs(this.text.length, rate);
        this._emit();
    }

    /** Jumps to `fraction` (0..1) of the text and plays from the word there. */
    async seek(fraction) {
        if (!this.text) return;
        this._tick();
        const f = Math.max(0, Math.min(1, fraction));
        const char = wordStartAt(this.text, f * this.text.length);
        this.elapsedMs = this.text.length ? (char / this.text.length) * this.totalMs : 0;
        await this._speakFrom(char);
    }

    /** Applies a new rate immediately by re-speaking from the current word. */
    async applyRate() {
        if (!this.isPlaying) {
            const { rate } = await this._settings();
            if (!this.isPaused) this.totalMs = this.elapsedMs + estimateDurationMs(this.text.length - this.charIndex, rate);
            this.rate = rate;
            this._emit();
            return;
        }
        this._tick();
        await this._speakFrom(wordStartAt(this.text, this.charIndex));
    }

    async _speakFrom(char) {
        const settings = await this._settings();
        const id = ++this.utteranceId;
        this.offset = char;
        this.charIndex = char;
        this.rate = settings.rate;
        this.base = { char, elapsed: this.elapsedMs };
        this.totalMs = this.elapsedMs + estimateDurationMs(this.text.length - char, settings.rate);
        this.isPlaying = true;
        this.isPaused = false;
        this.speakingSince = this.now();

        const options = {
            rate: settings.rate,
            pitch: settings.pitch,
            volume: settings.volume,
            enqueue: false,
            onEvent: (event) => this._onEvent(id, event),
        };
        if (settings.voice && settings.voice !== 'default') options.voiceName = settings.voice;
        this.tts.stop();
        this.tts.speak(this.text.slice(char), options);
        this._emit();
    }

    _onEvent(id, event) {
        if (id !== this.utteranceId) return; // stale utterance (stopped or sought)
        switch (event.type) {
            case 'word':
                this._tick();
                if (typeof event.charIndex === 'number') this.charIndex = this.offset + event.charIndex;
                this._refineTotal();
                break;
            case 'end':
                this._tick();
                this.speakingSince = null;
                this.charIndex = this.text.length;
                this.totalMs = this.elapsedMs;
                this.isPlaying = false;
                this.isPaused = false;
                if (this.queue.length) {
                    this.play(this.queue.shift());
                    return;
                }
                break;
            case 'error':
                this._tick();
                this.speakingSince = null;
                this.isPlaying = false;
                this.isPaused = false;
                break;
            default:
                return; // start, interrupted, cancelled, sentence, marker
        }
        this._emit();
    }

    /** Re-derives the total from the speed measured since the last base point. */
    _refineTotal() {
        const spentMs = this.elapsedMs - this.base.elapsed;
        const spokenChars = this.charIndex - this.base.char;
        if (spentMs < REFINE_AFTER_MS || spokenChars <= 0) return;
        const charsPerMs = spokenChars / spentMs;
        this.totalMs = this.elapsedMs + (this.text.length - this.charIndex) / charsPerMs;
    }

    _tick() {
        if (this.speakingSince === null) return;
        const now = this.now();
        this.elapsedMs += now - this.speakingSince;
        this.speakingSince = now;
    }

    async _settings() {
        const s = (await this.getSettings()) || {};
        return { rate: s.rate || 1, pitch: s.pitch || 1, volume: s.volume || 1, voice: s.voice };
    }

    _emit() {
        this.onChange(this.snapshot());
    }
}
