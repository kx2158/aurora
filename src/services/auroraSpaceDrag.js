/**
 * Space drag: grab the air with a controller and pull the whole play space around you, like OpenVR Advanced
 * Settings does, but built into Aurora. The work happens in a small helper (SpaceDrag\Aurora.SpaceDrag.exe) that
 * runs next to Aurora, see Dotnet/AppApi/Common/SpaceDrag.cs. This file keeps the settings, starts and stops
 * the helper and polls its status for the card.
 */
import { ref, watch } from 'vue';

import configRepository from './config';
import { defaultDragSettings, dragState, sanitizeDragSettings } from './spaceDragCore';

const KEY = 'Aurora_spacedrag';

export const dragSettings = ref(defaultDragSettings());
export const dragStatus = ref(null);
export const dragUiState = ref('off');

let loaded = false;
let timer = null;
let applying = false;

const api = (name) => (typeof AppApi !== 'undefined' && typeof AppApi[name] === 'function' ? AppApi[name].bind(AppApi) : null);

const parse = (text) => {
    try {
        return JSON.parse(text || '{}');
    } catch {
        return null;
    }
};

export async function refreshDragStatus() {
    const get = api('GetSpaceDragStatus');
    if (!get) return dragUiState.value;
    dragStatus.value = parse(await get());
    dragUiState.value = dragState(dragStatus.value, dragSettings.value);
    return dragUiState.value;
}

/** Saves the settings for the helper and starts or stops it to match "enabled". */
async function apply() {
    if (applying) return;
    applying = true;
    try {
        const set = api('SetSpaceDragSettings');
        if (set) await set(JSON.stringify(dragSettings.value));
        if (dragSettings.value.enabled) await api('StartSpaceDrag')?.();
        else await api('StopSpaceDrag')?.();
    } finally {
        applying = false;
    }
    await refreshDragStatus();
}

export async function resetDragSpace() {
    await api('ResetSpaceDrag')?.();
}

export async function openSteamVrBindings() {
    await api('OpenSteamVrBindings')?.();
}

export function updateDragSettings(patch) {
    dragSettings.value = sanitizeDragSettings({ ...dragSettings.value, ...patch });
}

export async function initSpaceDrag() {
    if (loaded) return;
    loaded = true;
    try {
        dragSettings.value = sanitizeDragSettings(JSON.parse(await configRepository.getString(KEY, '{}')));
    } catch {
        dragSettings.value = defaultDragSettings();
    }
    watch(
        dragSettings,
        (v) => {
            configRepository.setString(KEY, JSON.stringify(v));
            apply();
        },
        { deep: true }
    );
    // the helper dies with SteamVR's shutdown, so bring it back if it should be running
    await apply();
    timer = setInterval(async () => {
        await refreshDragStatus();
        if (dragSettings.value.enabled && dragUiState.value === 'starting') await api('StartSpaceDrag')?.();
    }, 2000);
}

export function stopSpaceDrag() {
    clearInterval(timer);
    timer = null;
    loaded = false;
}
