/**
 * Runs the Kokoro voice model off the main thread, so the app never freezes while Neon talks.
 * Receives { id, text, voice, speed, fx }, replies { id, samples, rate } or { id, error }.
 */
import { KokoroTTS } from 'kokoro-js';

import { applyVoiceFx } from '../services/auroraVoiceFx.js';

let ttsPromise = null;

function loadModel() {
    if (!ttsPromise) {
        ttsPromise = KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
            dtype: 'q8', // small and CPU friendly
            device: 'wasm' // CPU only, keeps the GPU free for VRChat
        });
        ttsPromise.catch(() => {
            ttsPromise = null; // allow a retry after a failed download
        });
    }
    return ttsPromise;
}

self.addEventListener('message', async (event) => {
    const { id, text, voice, speed, fx } = event.data;
    try {
        const tts = await loadModel();
        const raw = await tts.generate(text, { voice, speed });
        const samples = applyVoiceFx(raw.audio, raw.sampling_rate, fx);
        self.postMessage({ id, samples, rate: raw.sampling_rate }, [samples.buffer]);
    } catch (e) {
        self.postMessage({ id, error: String(e?.message || e) });
    }
});
