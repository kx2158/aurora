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

let audioCtx = null;
let currentSource = null;

export async function speak(text, { voice = 'af_heart', speed = 1, volume = 0.8, fx = FX_PRESETS.robot, mood = null } = {}) {
    const line = String(text || '').trim();
    if (!line) {
        return;
    }
    const { samples, rate } = await generate(line, voice, speed, fx);

    audioCtx = audioCtx || new AudioContext();
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }
    const buffer = audioCtx.createBuffer(1, samples.length, rate);
    buffer.copyToChannel(samples, 0);
    stopSpeaking();
    const gain = audioCtx.createGain();
    gain.gain.value = Math.min(1, Math.max(0, volume));
    currentSource = audioCtx.createBufferSource();
    currentSource.buffer = buffer;
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    levelBuf = new Uint8Array(analyser.fftSize);
    currentSource.connect(analyser);
    analyser.connect(gain).connect(audioCtx.destination);
    currentSource.onended = () => {
        speaking.value = false;
        mouthLevel.value = 0;
        setMood('neutral');
    };
    emotion.value = mood || guessEmotion(line);
    speaking.value = true;
    currentSource.start();
    trackLevel();
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
