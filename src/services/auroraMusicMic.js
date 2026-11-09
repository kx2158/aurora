/**
 * Music to mic: shares the sound of one app (Spotify, Apple Music, a browser...) with the people in VRChat
 * by mixing it with your microphone into a virtual cable. The heavy lifting is in the Windows app.
 */
import { ref } from 'vue';

import configRepository from './config';

export const mm = ref({
    running: false,
    app: '',
    mic: '',
    out: '',
    musicVol: 0.8,
    micVol: 1,
    musicBass: 0,
    micBass: 0,
    // noise suppression on your microphone, 0 = off, 1 = strongest
    micNoise: 0,
    // voice effects: none, robot, radio, echo, reverb, ghost; amount 0-1; pitch in semitones
    voiceFx: 'none',
    voiceAmount: 0.5,
    voicePitch: 0,
    micMuted: false,
    autoStart: true,
    latency: 30,
    error: '',
    micPeak: 0,
    musicPeak: 0,
    outPeak: 0,
    info: ''
});
export const audioApps = ref([]);
export const audioDevices = ref({ render: [], capture: [] });
let loaded = false;

export async function initMusicMic() {
    if (loaded) {
        return;
    }
    loaded = true;
    try {
        const saved = JSON.parse(await configRepository.getString('Neon_musicMic', '{}'));
        Object.assign(mm.value, saved, { running: false, error: '' });
    } catch {
        // keep defaults
    }
    refreshAudioLists();
}

function save() {
    const { app, mic, out, musicVol, micVol, musicBass, micBass, micNoise, voiceFx, voiceAmount, voicePitch, latency, autoStart } = mm.value;
    configRepository.setString(
        'Neon_musicMic',
        JSON.stringify({ app, mic, out, musicVol, micVol, musicBass, micBass, micNoise, voiceFx, voiceAmount, voicePitch, latency, autoStart })
    );
}

export async function refreshAudioLists() {
    try {
        audioDevices.value = JSON.parse((await AppApi.GetNeonAudioDevices()) || '{}');
        audioApps.value = JSON.parse((await AppApi.GetNeonAudioApps()) || '[]');
    } catch {
        // not available on this platform
    }
}

function sendVolumes() {
    AppApi.NeonMusicMicVolume(mm.value.musicVol, mm.value.micMuted ? 0 : mm.value.micVol);
}

function sendBass() {
    AppApi.NeonMusicMicBass(mm.value.musicBass, mm.value.micBass);
}

function sendNoise() {
    AppApi.NeonMusicMicNoise(mm.value.micNoise);
}

function sendFx() {
    try {
        AppApi.NeonMusicMicFx(mm.value.voiceFx, mm.value.voiceAmount, mm.value.voicePitch);
    } catch {
        // older Windows app without voice effects
    }
}

/** The built-in voice effects, with a short name for the buttons. */
export const VOICE_EFFECTS = ['none', 'ghost', 'reverb', 'echo', 'robot', 'radio'];

/** Mutes your microphone in the mix, the music keeps playing. */
export function toggleMicMute() {
    mm.value.micMuted = !mm.value.micMuted;
    if (mm.value.running) {
        sendVolumes();
    }
}

export function setMm(key, value) {
    mm.value[key] = value;
    save();
    if (mm.value.running && key === 'micNoise') {
        sendNoise();
    } else if (mm.value.running && (key === 'voiceFx' || key === 'voiceAmount' || key === 'voicePitch')) {
        sendFx();
    } else if (mm.value.running && (key === 'musicBass' || key === 'micBass')) {
        sendBass();
    } else if (mm.value.running && (key === 'musicVol' || key === 'micVol')) {
        sendVolumes();
    } else if (mm.value.running && (key === 'app' || key === 'mic' || key === 'out' || key === 'latency')) {
        // changing what is shared restarts the mix, an empty app means microphone only
        startMusicMic();
    }
}

export async function startMusicMic() {
    mm.value.error = '';
    const m = mm.value;
    const ok = await AppApi.NeonMusicMicStart(
        JSON.stringify({
            app: m.app,
            mic: m.mic,
            out: m.out,
            musicVol: m.musicVol,
            micVol: m.micMuted ? 0 : m.micVol,
            musicBass: m.musicBass,
            micBass: m.micBass,
            micNoise: m.micNoise,
            voiceFx: m.voiceFx,
            voiceAmount: m.voiceAmount,
            voicePitch: m.voicePitch,
            latency: m.latency
        })
    );
    mm.value.running = !!ok;
    if (!ok) {
        try {
            mm.value.error = JSON.parse(await AppApi.NeonMusicMicStatus()).error || 'Could not start.';
        } catch {
            mm.value.error = 'Could not start.';
        }
    }
}

export function stopMusicMic() {
    AppApi.NeonMusicMicStop();
    mm.value.running = false;
}

export function toggleMusicMic() {
    return mm.value.running ? stopMusicMic() : startMusicMic();
}

/** For the VR button: switch to the next app that is making sound. */
export async function nextMusicSource() {
    await refreshAudioLists();
    const apps = audioApps.value;
    if (!apps.length) {
        return;
    }
    const i = apps.indexOf(mm.value.app);
    setMm('app', apps[(i + 1) % apps.length]);
    if (mm.value.running) {
        await startMusicMic();
    }
}

export function nudgeMusicVolume(delta) {
    setMm('musicVol', Math.min(10, Math.max(0, Math.round((mm.value.musicVol + delta) * 100) / 100)));
}

// while the mix runs, show what is actually coming in so problems are easy to find
setInterval(async () => {
    if (!mm.value.running) {
        return;
    }
    try {
        const st = JSON.parse(await AppApi.NeonMusicMicStatus());
        mm.value.micPeak = st.micPeak || 0;
        mm.value.musicPeak = st.musicPeak || 0;
        mm.value.outPeak = st.outPeak || 0;
        mm.value.info = st.info || '';
    } catch {
        // ignore
    }
}, 400);

/** Starts the mic mix when VRChat opens (if "auto start" is on) and stops it when VRChat closes. */
export function watchGameForMic(isRunning) {
    let was = isRunning();
    setInterval(() => {
        const now = isRunning();
        if (now === was) return;
        was = now;
        if (now && mm.value.autoStart && !mm.value.running) {
            // give VRChat a few seconds to open its audio devices first
            setTimeout(() => {
                if (!mm.value.running) startMusicMic();
            }, 6000);
        } else if (!now && mm.value.autoStart && mm.value.running) {
            stopMusicMic();
        }
    }, 2000);
    // VRChat was already running when Aurora opened
    if (was) {
        setTimeout(() => {
            if (mm.value.autoStart && !mm.value.running) startMusicMic();
        }, 8000);
    }
}
