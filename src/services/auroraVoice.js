/**
 * Aurora mascot voice. Runs Kokoro-82M (Apache 2.0) fully locally through kokoro-js (ONNX).
 * Nothing is sent anywhere. The model downloads once on first use and is cached by the browser.
 * It loads lazily, so nothing is paid for until voice is enabled and used.
 */
import { applyVoiceFx, FX_PRESETS } from './auroraVoiceFx';

let ttsPromise = null;

async function loadModel() {
    if (!ttsPromise) {
        ttsPromise = import('kokoro-js').then(({ KokoroTTS }) =>
            KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
                dtype: 'q8', // small and CPU friendly
                device: 'wasm' // CPU only, keeps the GPU free for VRChat
            })
        );
        ttsPromise.catch(() => {
            ttsPromise = null; // allow a retry after a failed download
        });
    }
    return ttsPromise;
}

let audioCtx = null;
let currentSource = null;

export async function speak(text, { voice = 'af_heart', speed = 1, volume = 0.8, fx = FX_PRESETS.robot } = {}) {
    const line = String(text || '').trim();
    if (!line) {
        return;
    }
    const tts = await loadModel();
    const raw = await tts.generate(line, { voice, speed });
    const samples = applyVoiceFx(raw.audio, raw.sampling_rate, fx);

    audioCtx = audioCtx || new AudioContext();
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }
    const buffer = audioCtx.createBuffer(1, samples.length, raw.sampling_rate);
    buffer.copyToChannel(samples, 0);
    stopSpeaking();
    const gain = audioCtx.createGain();
    gain.gain.value = Math.min(1, Math.max(0, volume));
    currentSource = audioCtx.createBufferSource();
    currentSource.buffer = buffer;
    currentSource.connect(gain).connect(audioCtx.destination);
    currentSource.start();
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
}

export const VOICES = [
    { id: 'af_heart', label: 'Heart (warm)' },
    { id: 'af_bella', label: 'Bella (bright)' },
    { id: 'af_nicole', label: 'Nicole (soft, low)' },
    { id: 'af_sky', label: 'Sky (light)' },
    { id: 'am_michael', label: 'Michael (calm)' },
    { id: 'bf_emma', label: 'Emma (British)' }
];
