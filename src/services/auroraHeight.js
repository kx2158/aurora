/**
 * Avatar height over OSC: VRChat's /avatar/eyeheight, in meters.
 * VRChat accepts 0.01 m (1 cm) to 10000 m (10 km). Between 0.1 m and 100 m is what VRChat officially
 * supports; outside that it shows a warning on your HUD. Worlds can limit or turn off scaling, and then
 * VRChat ignores the value or snaps it back.
 */
import { ref, watch } from 'vue';

import configRepository from './config';

export const MIN_HEIGHT = 0.01;
export const MAX_HEIGHT = 10000;
const KEY = 'Aurora_height';

/** the last height you picked, and your normal height to come back to */
export const height = ref(1.6);
export const normalHeight = ref(1.6);

/** 'idle', 'waiting' (listening to VRChat), 'found' or 'none' (nothing arrived) */
export const importState = ref('idle');

/**
 * Reads the eye height VRChat reports for your avatar and shows it here, without sending anything back.
 * VRChat sends it when an avatar loads and when the height changes, so change it once (or reload your avatar)
 * while this waits. Needs OSC switched on in VRChat (receive only: nothing else goes over OSC).
 */
export async function importHeightFromVrchat() {
    if (importState.value === 'waiting' || typeof AppApi === 'undefined' || !AppApi.ReadVrchatEyeHeight) return false;
    importState.value = 'waiting';
    try {
        const m = Number(await AppApi.ReadVrchatEyeHeight(10000));
        if (m > 0) {
            height.value = tidy(clamp(m));
            importState.value = 'found';
            return true;
        }
    } catch {
        // older Windows app
    }
    importState.value = 'none';
    return false;
}

export const HEIGHT_PRESETS = [
    { label: 'Ant', m: 0.01 },
    { label: 'Mouse', m: 0.1 },
    { label: 'Child', m: 1.1 },
    { label: 'Tall', m: 2.2 },
    { label: 'Giant', m: 10 },
    { label: 'Tower', m: 100 },
    { label: 'Kaiju', m: 500 },
    { label: 'Mountain', m: 2500 },
    { label: 'Sky', m: 10000 }
];

let loaded = false;
let sendTimer = null;
let lastSendAt = 0;

export async function initHeight() {
    if (loaded) {
        return;
    }
    loaded = true;
    try {
        const saved = JSON.parse(await configRepository.getString(KEY, '{}'));
        if (Number(saved.height) > 0) height.value = clamp(saved.height);
        if (Number(saved.normal) > 0) normalHeight.value = clamp(saved.normal);
    } catch {
        // defaults
    }
    watch([height, normalHeight], () =>
        configRepository.setString(KEY, JSON.stringify({ height: height.value, normal: normalHeight.value }))
    );
}

export function clamp(m) {
    const n = Number(m);
    if (!Number.isFinite(n)) {
        return 1.6;
    }
    return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, n));
}

/** Rounds to something readable for the size it is (1.23 cm, 1.62 m, 152 m, 2.4 km). */
function tidy(m) {
    const digits = m < 1 ? 4 : m < 100 ? 2 : m < 1000 ? 0 : -1;
    const f = 10 ** digits;
    return Math.round(m * f) / f;
}

export function formatHeight(m) {
    if (m < 1) return `${+(m * 100).toFixed(m < 0.1 ? 1 : 0)} cm`;
    if (m < 1000) return `${+m.toFixed(m < 10 ? 2 : m < 100 ? 1 : 0)} m`;
    return `${+(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

/** Is this outside what VRChat officially supports (it will show a HUD warning). */
export const isExtreme = (m) => m < 0.1 || m > 100;

function send() {
    lastSendAt = Date.now();
    try {
        AppApi.SendOscFloat('/avatar/eyeheight', height.value, 9000);
    } catch {
        // older Windows app without OSC floats
    }
}

/** Sets your height. Slider drags are sent at most about 12 times a second, the last value always arrives. */
export function setHeight(m) {
    height.value = tidy(clamp(m));
    clearTimeout(sendTimer);
    const wait = 80 - (Date.now() - lastSendAt);
    if (wait <= 0) {
        send();
    } else {
        sendTimer = setTimeout(send, wait);
    }
}

/** Grows or shrinks by a step (25 percent), for buttons. */
export function stepHeight(dir) {
    setHeight(height.value * (dir > 0 ? 1.25 : 0.8));
}

export function backToNormal() {
    setHeight(normalHeight.value);
}

export function setNormalHeight(m = height.value) {
    normalHeight.value = tidy(clamp(m));
}

/** The slider works in powers of ten so 1 cm and 10 km both fit: -2 .. 4. */
export const toSlider = (m) => Math.log10(clamp(m));
export const fromSlider = (v) => 10 ** Number(v);
