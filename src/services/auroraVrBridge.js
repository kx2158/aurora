/**
 * Carries Neon's SteamVR dashboard buttons to the app and the app's state back to the dashboard.
 * Dashboard click -> AppApiVr.NeonCommand -> window.$bridge.neonCommand(command) here.
 */
import { watch } from 'vue';

import { accent } from './auroraAccent';
import { sysInfo } from './auroraChatbox';
import { mm, nextMusicSource, nudgeMusicVolume, toggleMicMute, toggleMusicMic } from './auroraMusicMic';
import { addTimer, alarms, stopRinging } from './auroraAlarms';
import configRepository from './config';
import { chatboxEnabled, chatboxPreview, sendChatboxNow, setChatboxEnabled } from './auroraChatbox';
import { setEnabled, state } from './auroraIntegrations';
import { useAuroraSettingsStore } from '../stores';

let vrSounds = true;
let started = false;

function pushState() {
    const settings = useAuroraSettingsStore();
    const next = alarms.value.filter((a) => a.enabled).map((a) => a.time).sort()[0] || '';
    try {
        AppApi.ExecuteVrOverlayFunction(
            'neonState',
            JSON.stringify({
                chatbox: chatboxEnabled.value,
                voice: settings.mascotVoiceEnabled,
                sounds: vrSounds,
                afk: !!state.afk?.enabled,
                music: !!state.medialink?.enabled,
                preview: String(chatboxPreview.value || '').slice(0, 144),
                nextAlarm: next,
                accent: accent.value,
                song: sysInfo.value.song || '',
                artist: sysInfo.value.artist || '',
                playing: !!sysInfo.value.musicPlaying,
                mm: mm.value.running,
                mmApp: mm.value.app,
                mmMuted: mm.value.micMuted,
                mmVol: Math.round(mm.value.musicVol * 100)
            })
        );
    } catch {
        // VR is not running
    }
}

export function neonCommand(command) {
    const settings = useAuroraSettingsStore();
    switch (String(command)) {
        case 'chatbox':
            setChatboxEnabled(!chatboxEnabled.value);
            break;
        case 'timer5':
            addTimer(5);
            break;
        case 'timer15':
            addTimer(15);
            break;
        case 'timer30':
            addTimer(30);
            break;
        case 'timer60':
            addTimer(60);
            break;
        case 'stopAlarm':
            stopRinging();
            break;
        case 'voice':
            settings.setMascotVoiceEnabled(!settings.mascotVoiceEnabled);
            break;
        case 'sounds':
            vrSounds = !vrSounds;
            configRepository.setBool('Neon_vrSounds', vrSounds);
            break;
        case 'afk':
            setEnabled('afk', !state.afk?.enabled);
            break;
        case 'music':
            setEnabled('medialink', !state.medialink?.enabled);
            break;
        case 'mPrev':
        case 'mPlay':
        case 'mNext':
            try {
                AppApi.NeonMediaControl(String(command));
            } catch (e) {
                console.error(e);
            }
            break;
        case 'mmToggle':
            toggleMusicMic();
            break;
        case 'mmMute':
            toggleMicMute();
            break;
        case 'mmSource':
            nextMusicSource();
            break;
        case 'mmUp':
            nudgeMusicVolume(0.1);
            break;
        case 'mmDown':
            nudgeMusicVolume(-0.1);
            break;
        case 'brb':
            sendChatboxNow('Be right back');
            break;
        case 'clear':
            sendChatboxNow(' ');
            break;
        default:
            break;
    }
    pushState();
}

export async function initVrBridge() {
    if (started) {
        return;
    }
    started = true;
    vrSounds = await configRepository.getBool('Neon_vrSounds', true);
    const settings = useAuroraSettingsStore();
    watch([accent, mm, chatboxEnabled, chatboxPreview, () => settings.mascotVoiceEnabled, alarms], pushState, { deep: true });
    setInterval(pushState, 5000);
    pushState();
}
