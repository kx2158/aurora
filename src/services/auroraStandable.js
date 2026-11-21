/**
 * Keeps Standable out of the way of Aurora's own full body estimation. Two trackers fighting over the
 * same feet is worse than either one alone, so with "turn Standable off" switched on Aurora switches its
 * SteamVR driver off whenever it finds it enabled (see Dotnet/AppApi/Common/Standable.cs).
 *
 * SteamVR only reads driver settings when it starts, so if SteamVR is already running the change waits
 * for the next SteamVR start, and the UI says so.
 */
import { ref, watch } from 'vue';

import configRepository from './config';

const KEY = 'Aurora_standable_autodisable';

export const autoDisable = ref(true);
/** 'unknown' | 'absent' | 'off' | 'on' | 'restart' | 'error' */
export const standableState = ref('unknown');
export const standableError = ref('');

let loaded = false;
let timer = null;

const call = async (name) => {
    if (typeof AppApi === 'undefined' || typeof AppApi[name] !== 'function') return null;
    try {
        return JSON.parse((await AppApi[name]()) || '{}');
    } catch {
        return null;
    }
};

/** Looks at Standable and, if the setting is on and it is enabled, switches it off. */
export async function checkStandable() {
    const status = await call('GetStandableStatus');
    if (!status) return standableState.value;
    if (status.error) {
        standableError.value = status.error;
        return (standableState.value = 'error');
    }
    if (!status.installed) return (standableState.value = 'absent');
    if (!status.enabled) return (standableState.value = 'off');
    if (!autoDisable.value) return (standableState.value = 'on');

    const result = await call('DisableStandable');
    if (!result || !result.ok) {
        standableError.value = result?.error || '';
        return (standableState.value = 'error');
    }
    return (standableState.value = result.needsSteamVrRestart ? 'restart' : 'off');
}

export async function initStandable() {
    if (loaded) return;
    loaded = true;
    autoDisable.value = (await configRepository.getString(KEY, 'true')) !== 'false';
    watch(autoDisable, (v) => {
        configRepository.setString(KEY, v ? 'true' : 'false');
        checkStandable();
    });
    await checkStandable();
    // SteamVR can start later, and Standable can be turned back on from its own app
    timer = setInterval(checkStandable, 30000);
}

export function stopStandable() {
    clearInterval(timer);
    timer = null;
    loaded = false;
}
