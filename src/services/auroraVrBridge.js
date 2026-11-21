/**
 * Carries the SteamVR dashboard and the desktop overlay buttons to the app, and the app's state back to them.
 * VR:      dashboard click -> AppApiVr.NeonCommand -> window.$bridge.neonCommand(command)
 * Desktop: overlay click   -> DeskApi.Command      -> window.$bridge.deskCommand(command, value)
 */
import { watch } from 'vue';

import { accent } from './auroraAccent';
import { sysInfo } from './auroraChatbox';
import {
    audioApps,
    mm,
    nextMusicSource,
    nudgeMusicVolume,
    refreshAudioLists,
    setMm,
    toggleMicMute,
    toggleMusicMic,
    VOICE_EFFECTS
} from './auroraMusicMic';
import { addTimer, alarms, removeAlarm, stopRinging } from './auroraAlarms';
import configRepository from './config';
import { chatboxEnabled, chatboxPreview, sendChatboxNow, setChatboxEnabled } from './auroraChatbox';
import { setEnabled, state } from './auroraIntegrations';
import { herePeople, instanceWatch, openProfile, toggleWatched, watchAlert } from './auroraWatch';
import { backToNormal, height, initHeight, normalHeight, setHeight, setNormalHeight, stepHeight } from './auroraHeight';
import { initCalibration, sitMode, toggleTracker, trackerOn } from './auroraBodyCalibration';
import { bodyUnlocked, initBodyLock } from './auroraBodyLock';
import { initBodyOutput, oscOut, setOscOut } from './auroraBodyOutput';
import { applyMeasure, measure, measureFloor, measurePoint, setMeasureHand } from './auroraMeasure';
import { autoDisable, initStandable, standableState } from './auroraStandable';
import { useLocationStore } from '../stores/location';

/** The instance you are in, for the overlays: name, people and the latest flagged join. */
function hereState() {
    let place = '';
    try {
        const loc = useLocationStore().lastLocation;
        place = loc.name || '';
    } catch {
        // not in VRChat
    }
    const people = herePeople();
    const alert = watchAlert.value && Date.now() - watchAlert.value.at < 120000 ? watchAlert.value : null;
    return { place, people, alert };
}

let vrSounds = true;
let deskTimer = null;
let deskHotkey = '';
const MM_KEYS = ['micVol', 'musicVol', 'micNoise', 'micBass', 'musicBass', 'voiceAmount', 'voicePitch'];
let started = false;

/** Everything the desktop overlay shows. */
function pushDesk() {
    clearTimeout(deskTimer);
    deskTimer = setTimeout(() => {
        const root = document.documentElement;
        const m = mm.value;
        try {
            AppApi.DeskOverlayState(
                JSON.stringify({
                    theme: root.getAttribute('data-theme') || 'xraydark',
                    dark: root.classList.contains('dark'),
                    axh: root.style.getPropertyValue('--axh'),
                    axk: root.style.getPropertyValue('--axk'),
                    accent: accent.value,
                    hotkey: deskHotkey,
                    here: hereState(),
                    height: { m: height.value, normal: normalHeight.value },
                    chatbox: { enabled: chatboxEnabled.value, preview: String(chatboxPreview.value || '').slice(0, 144) },
                    alarms: alarms.value.map((a) => ({
                        id: a.id,
                        time: a.time,
                        label: a.label,
                        daily: a.daily,
                        enabled: a.enabled
                    })),
                    mm: {
                        running: m.running,
                        micMuted: m.micMuted,
                        app: m.app,
                        apps: audioApps.value.slice(0, 20),
                        micVol: m.micVol,
                        musicVol: m.musicVol,
                        micNoise: m.micNoise,
                        micBass: m.micBass,
                        musicBass: m.musicBass,
                        voiceFx: m.voiceFx || 'none',
                        voiceAmount: m.voiceAmount ?? 0.5,
                        voicePitch: m.voicePitch || 0,
                        micPeak: m.micPeak || 0,
                        outPeak: m.outPeak || 0,
                        error: m.error || ''
                    }
                })
            );
        } catch {
            // only the Windows app has the desktop overlay
        }
    }, 60);
}

/** Closes VRChat straight away (ends the game process). Used by the overlays' quit buttons. */
function quitVrchat() {
    try {
        AppApi.QuitGame();
    } catch {
        // only the Windows app can close the game
    }
}

/** A button or slider in the desktop overlay. */
export function deskCommand(command, value) {
    const cmd = String(command);
    const v = value === undefined || value === null ? '' : String(value);
    switch (cmd) {
        case 'timer': {
            const minutes = Math.round(Number(v));
            if (minutes >= 1 && minutes <= 24 * 60) {
                addTimer(minutes);
            }
            break;
        }
        case 'alarmRemove':
            removeAlarm(Number(v));
            break;
        case 'alarmToggle': {
            const a = alarms.value.find((x) => x.id === Number(v));
            if (a) {
                a.enabled = !a.enabled;
            }
            break;
        }
        case 'stopAlarm':
            stopRinging();
            break;
        case 'chatboxToggle':
            setChatboxEnabled(!chatboxEnabled.value);
            break;
        case 'chatboxSend':
            if (v.trim()) {
                sendChatboxNow(v.slice(0, 144));
            }
            break;
        case 'brb':
            sendChatboxNow('Be right back');
            break;
        case 'clear':
            sendChatboxNow(' ');
            break;
        case 'mmToggle':
            toggleMusicMic();
            break;
        case 'mmMute':
            toggleMicMute();
            break;
        case 'mmSet': {
            try {
                const { key, value: num } = JSON.parse(v);
                if (MM_KEYS.includes(key) && Number.isFinite(Number(num))) {
                    setMm(key, Number(num));
                }
            } catch {
                // ignore a broken message
            }
            break;
        }
        case 'mmFx':
            if (VOICE_EFFECTS.includes(v)) {
                setMm('voiceFx', v);
            }
            break;
        case 'mmApp':
            setMm('app', v);
            break;
        case 'mmRefresh':
            refreshAudioLists();
            break;
        case 'quitGame':
            quitVrchat();
            break;
        case 'profile':
            openProfile(v);
            break;
        case 'watchToggle': {
            const p = herePeople().find((x) => x.id === v);
            toggleWatched(v, p?.name);
            break;
        }
        case 'dismissAlert':
            watchAlert.value = null;
            break;
        case 'height':
            setHeight(Number(v));
            break;
        case 'heightStep':
            stepHeight(Number(v) || 1);
            break;
        case 'heightNormal':
            backToNormal();
            break;
        case 'heightSetNormal':
            setNormalHeight();
            break;
        case 'open':
            try {
                AppApi.FocusWindow();
            } catch {
                // ignore
            }
            break;
        default:
            break;
    }
    pushState();
}

function pushState() {
    pushDesk();
    const next = alarms.value.filter((a) => a.enabled).map((a) => a.time).sort()[0] || '';
    try {
        AppApi.ExecuteVrOverlayFunction(
            'neonState',
            JSON.stringify({
                chatbox: chatboxEnabled.value,
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
                mmVol: Math.round(mm.value.musicVol * 100),
                watchAlert: hereState().alert,
                height: height.value,
                bodyUnlocked: bodyUnlocked.value,
                bodySit: sitMode.value,
                bodyStandableOff: autoDisable.value,
                bodyStandable: standableState.value,
                bodyTrackers: trackerOn.value,
                bodyOsc: oscOut.value,
                bodyMeasure: { hand: measure.hand, status: measure.status, step: measure.step, floor: measure.floorY !== null, meters: measure.meters, message: measure.message }
            })
        );
    } catch {
        // VR is not running
    }
}

export function neonCommand(command) {
    // the dashboard height slider sends "height:<meters>"
    if (typeof command === 'string' && command.startsWith('height:')) {
        setHeight(Number(command.slice(7)));
        return;
    }
    // body estimation buttons only work once it is unlocked with the password
    if (typeof command === 'string' && command.startsWith('body') && bodyUnlocked.value) {
        if (command.startsWith('bodySit:')) {
            const mode = command.slice(8);
            if (mode === 'auto' || mode === 'sit' || mode === 'stand') sitMode.value = mode;
        } else if (command.startsWith('bodyTracker:')) {
            toggleTracker(command.slice(12));
        } else if (command === 'bodyMeasureFloor') {
            measureFloor();
        } else if (command === 'bodyMeasurePoint') {
            measurePoint();
        } else if (command.startsWith('bodyMeasureHand:')) {
            setMeasureHand(command.slice(16));
        } else if (command === 'bodyApplySeat' || command === 'bodyApplyEye') {
            applyMeasure(command === 'bodyApplyEye' ? 'eye' : 'seat');
        } else if (command === 'bodyOsc') {
            setOscOut(!oscOut.value);
        } else if (command === 'bodyStandable') {
            autoDisable.value = !autoDisable.value;
        }
        pushState();
        return;
    }
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
        case 'quitGame':
            quitVrchat();
            break;
        case 'heightUp':
            stepHeight(1);
            break;
        case 'heightDown':
            stepHeight(-1);
            break;
        case 'heightNormal':
            backToNormal();
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
    initHeight();
    initBodyLock();
    initBodyOutput();
    watch([bodyUnlocked, sitMode, autoDisable, standableState, trackerOn, measure, oscOut], pushState, { deep: true });
    // once unlocked, the body settings and the Standable check run in the background too
    watch(
        bodyUnlocked,
        (on) => {
            if (on) {
                initCalibration();
                initStandable();
            }
        },
        { immediate: true }
    );
    watch([accent, mm, chatboxEnabled, chatboxPreview, alarms, audioApps, instanceWatch, watchAlert, height, normalHeight], pushState, { deep: true });
    // people coming and going
    watch(() => useLocationStore().lastLocation.playerList.size, pushDesk);
    // the overlay follows the theme too
    new MutationObserver(pushDesk).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'data-theme', 'style']
    });
    initDeskHotkey();
    setInterval(pushState, 5000);
    pushState();
}

/** The desktop overlay hotkey, saved as text like "Ctrl+Shift+A". */
/** Opens or closes the desktop overlay, like the hotkey. */
export function toggleDeskOverlay() {
    try {
        AppApi.ToggleDeskOverlay();
    } catch {
        // not available here
    }
}
export const DEFAULT_DESK_HOTKEY = 'Ctrl+Shift+A';
export async function getDeskHotkey() {
    return configRepository.getString('Aurora_deskHotkey', DEFAULT_DESK_HOTKEY);
}
export async function setDeskHotkey(combo) {
    let ok = false;
    try {
        ok = await AppApi.SetDeskOverlayHotkey(combo || '');
    } catch {
        ok = false;
    }
    if (ok) {
        await configRepository.setString('Aurora_deskHotkey', combo || '');
        deskHotkey = combo || '';
        pushDesk();
    }
    return ok;
}
async function initDeskHotkey() {
    try {
        deskHotkey = await getDeskHotkey();
        await AppApi.SetDeskOverlayHotkey(deskHotkey);
    } catch {
        // Electron or an older Windows build: no overlay
    }
}
