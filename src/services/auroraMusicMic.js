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
    const { app, mic, out, musicVol, micVol } = mm.value;
    configRepository.setString('Neon_musicMic', JSON.stringify({ app, mic, out, musicVol, micVol }));
}

export async function refreshAudioLists() {
    try {
        audioDevices.value = JSON.parse((await AppApi.GetNeonAudioDevices()) || '{}');
        audioApps.value = JSON.parse((await AppApi.GetNeonAudioApps()) || '[]');
    } catch {
        // not available on this platform
    }
}

export function setMm(key, value) {
    mm.value[key] = value;
    save();
    if (mm.value.running && (key === 'musicVol' || key === 'micVol')) {
        AppApi.NeonMusicMicVolume(mm.value.musicVol, mm.value.micVol);
    } else if (mm.value.running && (key === 'app' || key === 'mic' || key === 'out')) {
        // changing what is shared restarts the mix, an empty app means microphone only
        startMusicMic();
    }
}

export async function startMusicMic() {
    mm.value.error = '';
    const ok = await AppApi.NeonMusicMicStart(
        JSON.stringify({ app: mm.value.app, mic: mm.value.mic, out: mm.value.out, musicVol: mm.value.musicVol, micVol: mm.value.micVol })
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
    setMm('musicVol', Math.min(1.5, Math.max(0, Math.round((mm.value.musicVol + delta) * 100) / 100)));
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
