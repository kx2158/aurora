/**
 * Aurora mascot voice. Runs Kokoro-82M (Apache 2.0) fully locally through kokoro-js (ONNX).
 * Nothing is sent anywhere. The model downloads once on first use and is cached by the browser.
 * It loads lazily, so nothing is paid for until voice is enabled and used.
 */
import { ref } from 'vue';

import { FX_PRESETS } from './auroraVoiceFx';

/** True while the mascot is talking. The mascot component listens to this. */
export const speaking = ref(false);
/** Loudness of the voice right now, 0 to 1. Drives the mouth sprites. */
export const mouthLevel = ref(0);
/** Current emotion: neutral, smug, joy, surprised, angry, sad, sleepy, error. */
export const emotion = ref('neutral');

let moodTimer = null;
/** Show an emotion for a while, then fall back to neutral. */
export function setMood(name, ms = 4000) {
    emotion.value = name;
    clearTimeout(moodTimer);
    if (name !== 'neutral') {
        moodTimer = setTimeout(() => {
            if (!speaking.value) {
                emotion.value = 'neutral';
            }
        }, ms);
    }
}

/** Cheap guess of the emotion from the words, so she reacts without any extra model. */
export function guessEmotion(text) {
    const t = String(text || '').toLowerCase();
    if (/(error|failed|broke|cannot|can't|crash)/.test(t)) return 'error';
    if (/(wow|whoa|new friend|just joined|came online|!\?|\?!)/.test(t)) return 'surprised';
    if (/(sorry|miss|left|offline|sad|lonely)/.test(t)) return 'sad';
    if (/(sleep|late|tired|night)/.test(t)) return 'sleepy';
    if (/(angry|blocked|warning|danger|unsafe)/.test(t)) return 'angry';
    if (/(love|great|nice|yay|welcome|hello|hey|hi )/.test(t) || t.includes('!')) return 'joy';
    return 'smug';
}

let analyser = null;
let levelBuf = null;
let levelRaf = 0;
function trackLevel() {
    cancelAnimationFrame(levelRaf);
    const tick = () => {
        if (!analyser || !speaking.value) {
            mouthLevel.value = 0;
            return;
        }
        analyser.getByteTimeDomainData(levelBuf);
        let peak = 0;
        for (let i = 0; i < levelBuf.length; i++) {
            peak = Math.max(peak, Math.abs(levelBuf[i] - 128));
        }
        // smooth so the mouth does not flicker
        mouthLevel.value = mouthLevel.value * 0.55 + Math.min(1, peak / 70) * 0.45;
        levelRaf = requestAnimationFrame(tick);
    };
    levelRaf = requestAnimationFrame(tick);
}

let worker = null;
let seq = 0;
const pending = new Map();

/** The model lives in a worker so generating speech never blocks the interface. */
async function getWorker() {
    if (!worker) {
        const { default: TtsWorker } = await import('../workers/auroraTtsWorker.js?worker');
        worker = new TtsWorker();
        worker.onmessage = (event) => {
            const { id, samples, rate, error } = event.data;
            const job = pending.get(id);
            if (!job) {
                return;
            }
            pending.delete(id);
            if (error) {
                job.reject(new Error(error));
            } else {
                job.resolve({ samples, rate });
            }
        };
        worker.onerror = () => {
            worker = null; // recreate on the next line
            pending.forEach((job) => job.reject(new Error('voice worker crashed')));
            pending.clear();
        };
    }
    return worker;
}

async function generate(text, voice, speed, fx) {
    const w = await getWorker();
    return new Promise((resolve, reject) => {
        const id = ++seq;
        pending.set(id, { resolve, reject });
        w.postMessage({ id, text, voice, speed, fx: JSON.parse(JSON.stringify(fx)) });
    });
}

// ---------- pregenerated voice: every line is generated once and remembered ----------
const memory = new Map(); // key -> { samples, rate }
const inflight = new Map(); // key -> promise
const MAX_STORED = 300;

function cacheKey(text, voice, speed, fx) {
    return [voice, speed, JSON.stringify(fx), text].join('|');
}

function openDb() {
    return new Promise((resolve) => {
        try {
            const req = indexedDB.open('neon-voice', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('lines');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}
async function dbGet(key) {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve) => {
        const r = db.transaction('lines').objectStore('lines').get(key);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => resolve(null);
    });
}
async function dbPut(key, value) {
    const db = await openDb();
    if (!db) return;
    try {
        const store = db.transaction('lines', 'readwrite').objectStore('lines');
        store.put(value, key);
        const count = store.count();
        count.onsuccess = () => {
            if (count.result > MAX_STORED) {
                store.openCursor().onsuccess = (e) => e.target.result?.delete(); // drop the oldest
            }
        };
    } catch {
        // storage is only a speed up
    }
}

/** Makes sure the audio for this line exists (memory, then disk, then the model). */
export function prepare(text, { voice = 'af_heart', speed = 1, fx = FX_PRESETS.robot } = {}) {
    const line = String(text || '').trim();
    if (!line) {
        return Promise.resolve(null);
    }
    const key = cacheKey(line, voice, speed, fx);
    if (memory.has(key)) {
        return Promise.resolve(memory.get(key));
    }
    if (!inflight.has(key)) {
        const job = (async () => {
            const stored = await dbGet(key);
            if (stored) {
                memory.set(key, stored);
                return stored;
            }
            const made = await generate(line, voice, speed, fx);
            const entry = { samples: made.samples, rate: made.rate };
            memory.set(key, entry);
            dbPut(key, entry);
            return entry;
        })();
        inflight.set(key, job);
        job.finally(() => inflight.delete(key));
    }
    return inflight.get(key);
}

/** Generates these lines quietly in the background, one at a time, so they play instantly later. */
export async function pregenerate(lines, opts = {}) {
    for (const line of lines) {
        try {
            await prepare(line, opts);
        } catch {
            return; // model not available, try again later
        }
    }
}

let audioCtx = null;
let currentSource = null;

let playChain = Promise.resolve();
let epoch = 0; // bumps on interrupt so older queued lines are dropped

/**
 * Speaks a line. Lines wait their turn (they never talk over each other).
 * onStart runs the moment the sound actually begins, so the text can appear exactly then.
 * interrupt: true cuts off whatever is playing and skips the queue.
 */
export function speak(text, { voice = 'af_heart', speed = 1, volume = 0.8, fx = FX_PRESETS.robot, mood = null, onStart = null, interrupt = false } = {}) {
    const line = String(text || '').trim();
    if (!line) {
        return Promise.resolve();
    }
    const ready = prepare(line, { voice, speed, fx }); // starts generating right away, in parallel with the queue
    if (interrupt) {
        epoch++;
        stopSpeaking();
        playChain = Promise.resolve();
    }
    const myEpoch = epoch;
    let started;
    const startedPromise = new Promise((resolve) => (started = resolve));
    playChain = playChain
        .then(async () => {
            const entry = await ready;
            if (myEpoch !== epoch) {
                return started(); // interrupted while waiting
            }
            await play(entry, line, volume, mood, onStart);
            started();
        })
        .catch((e) => {
            started();
            console.error('Neon voice failed', e);
        });
    return startedPromise;
}

async function play(entry, line, volume, mood, onStart) {
    audioCtx = audioCtx || new AudioContext();
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }
    const buffer = audioCtx.createBuffer(1, entry.samples.length, entry.rate);
    buffer.copyToChannel(entry.samples, 0);
    const gain = audioCtx.createGain();
    gain.gain.value = Math.min(1, Math.max(0, volume));
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    levelBuf = new Uint8Array(analyser.fftSize);
    source.connect(analyser);
    analyser.connect(gain).connect(audioCtx.destination);
    currentSource = source;
    emotion.value = mood || guessEmotion(line);
    speaking.value = true;
    if (onStart) {
        onStart();
    }
    source.start();
    trackLevel();
    // resolves when this line has finished, so the next one can start
    await new Promise((resolve) => {
        source.onended = () => {
            if (currentSource === source) {
                speaking.value = false;
                mouthLevel.value = 0;
                setMood('neutral');
            }
            resolve();
        };
    });
}

export function stopSpeaking() {
    if (currentSource) {
        try {
            currentSource.stop();
        } catch {
            // already stopped
        }
        currentSource = null;
    }
    speaking.value = false;
    mouthLevel.value = 0;
}

export const VOICES = [
    { id: 'af_heart', label: 'Heart (warm)' },
    { id: 'af_bella', label: 'Bella (bright)' },
    { id: 'af_nicole', label: 'Nicole (soft, low)' },
    { id: 'af_sky', label: 'Sky (light)' },
    { id: 'am_michael', label: 'Michael (calm)' },
    { id: 'bf_emma', label: 'Emma (British)' }
];
