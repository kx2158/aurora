/**
 * Quest body tracking as a hint for Aurora's own body. Off by default (experimental).
 * The BodyXr helper reads the headset's OpenXR body tracking, AppApi.ReadBodyXr hands it over, and bodyXrCore.js turns
 * it into elbow hints for the estimator. If it does not work on a machine (the Quest runtime can refuse a second
 * OpenXR session while SteamVR runs), nothing changes: the estimator simply gets no hint.
 */
import { ref } from 'vue';

import configRepository from './config';
import { buildXrHint } from './bodyXrCore';

const KEY = 'Aurora_body_xr';

export const xrEnabled = ref(false);
/** { installed, running, state, note, ... } for the card. */
export const xrStatus = ref(null);

let latest = null;
let timer = null;
let loaded = false;

const api = (name) => (typeof AppApi !== 'undefined' && typeof AppApi[name] === 'function' ? AppApi[name].bind(AppApi) : null);

async function poll() {
    const read = api('ReadBodyXr');
    if (!read) return;
    try {
        latest = JSON.parse((await read()) || '{}');
    } catch {
        latest = null;
    }
    xrStatus.value = latest ? { installed: latest.installed, running: latest.running, state: latest.state, note: latest.note } : null;
    // the helper may have died or not started yet
    if (xrEnabled.value && latest && latest.installed && !latest.running) await api('StartBodyXr')?.();
}

function apply() {
    clearInterval(timer);
    timer = null;
    if (xrEnabled.value) {
        api('StartBodyXr')?.();
        timer = setInterval(poll, 33);
    } else {
        latest = null;
        xrStatus.value = null;
        api('StopBodyXr')?.();
    }
}

/** The hint for the estimator, lined up with this SteamVR head pose. Null when there is none. */
export function currentXrHint(head) {
    return xrEnabled.value ? buildXrHint(latest, head) : null;
}

export async function setXrEnabled(on) {
    xrEnabled.value = Boolean(on);
    configRepository.setBool(KEY, xrEnabled.value);
    // the helper only needs starting or stopping here; the overlay side picks the setting up and does the polling
    if (xrEnabled.value) api('StartBodyXr')?.();
    else api('StopBodyXr')?.();
}

export async function loadXrEnabled() {
    xrEnabled.value = await configRepository.getBool(KEY, false);
}

/**
 * Called by the VR overlay side, where the estimator runs. The switch lives in the main window's card, a different
 * browser, so the setting is re-read from the config every couple of seconds.
 */
export async function initBodyXr() {
    if (loaded) return;
    loaded = true;
    xrEnabled.value = await configRepository.getBool(KEY, false);
    apply();
    setInterval(async () => {
        const want = await configRepository.getBool(KEY, false);
        if (want !== xrEnabled.value) {
            xrEnabled.value = want;
            apply();
        }
    }, 2000);
}

/** For the card: refreshes xrStatus about once a second. Returns the function that stops it. */
export function watchXrStatus() {
    const read = api('ReadBodyXr');
    const tick = async () => {
        if (!read) return;
        try {
            const d = JSON.parse((await read()) || '{}');
            xrStatus.value = { installed: d.installed, running: d.running, state: d.state, note: d.note };
        } catch {
            xrStatus.value = null;
        }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
}
