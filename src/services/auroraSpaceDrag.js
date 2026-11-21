/**
 * Space drag: grab the air with a controller and pull the whole play space around you, like OpenVR Advanced
 * Settings does, but built into Aurora. The work happens in a small helper (SpaceDrag\Aurora.SpaceDrag.exe) that
 * runs next to Aurora, see Dotnet/AppApi/Common/SpaceDrag.cs. This file keeps the settings, starts and stops
 * the helper and polls its status for the card.
 */
import { ref, watch } from 'vue';

import configRepository from './config';
import { subscribePoses, wantPoses } from './auroraPoses';
import { armsCrossed, defaultDragSettings, dragState, enabledFromStatus, sanitizeDragSettings } from './spaceDragCore';

const KEY = 'Aurora_spacedrag';

export const dragSettings = ref(defaultDragSettings());
export const dragStatus = ref(null);
export const dragUiState = ref('off');

let loaded = false;
let timer = null;
let applying = false;
let lastLocalChange = 0;

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
    // the switch in the SteamVR dashboard may have flipped it
    const adopt = enabledFromStatus(dragStatus.value, dragSettings.value, Date.now() - lastLocalChange);
    if (adopt !== null) dragSettings.value = sanitizeDragSettings({ ...dragSettings.value, enabled: adopt });
    dragUiState.value = dragState(dragStatus.value, dragSettings.value);
    return dragUiState.value;
}

/** Saves the settings for the helper. The helper always runs (so the SteamVR switch can turn it back on); "enabled" only gates the grab. */
async function apply() {
    if (applying) return;
    applying = true;
    try {
        const set = api('SetSpaceDragSettings');
        if (set) await set(JSON.stringify(dragSettings.value));
        await api('StartSpaceDrag')?.();
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
    lastLocalChange = Date.now();
    dragSettings.value = sanitizeDragSettings({ ...dragSettings.value, ...patch });
}

/** Turns space drag on or off, from anywhere (the card, the overlays, the gesture). */
export function toggleSpaceDrag() {
    updateDragSettings({ enabled: !dragSettings.value.enabled });
    dragToast.value = { on: dragSettings.value.enabled, at: Date.now() };
}

// ---------- the crossed arms gesture ----------
// Cross your arms over your chest (each hand on the other side, close to the body) for about a second and space drag
// switches on or off. No menu needed, and it works with hand tracking. You have to uncross before it can switch again.

/** Shown on the VR wrist for a few seconds after the gesture or a button switched space drag: { on, at }. */
export const dragToast = ref(null);
/** The gesture can be switched off on the card. */
export const dragGesture = ref(true);
const GESTURE_KEY = 'Aurora_spaceDragGesture';
let crossTimer = 0;
let crossArmed = true;
let lastPoseAt = 0;
let unsubscribeGesture = null;

function onGesturePoses(poses, at) {
    const dt = lastPoseAt ? Math.min(0.2, (at - lastPoseAt) / 1000) : 0;
    lastPoseAt = at;
    const crossed = armsCrossed(poses?.head, poses?.leftHand, poses?.rightHand);
    if (!crossed) {
        crossTimer = Math.max(0, crossTimer - dt * 2);
        if (crossTimer === 0) crossArmed = true;
        return;
    }
    crossTimer += dt;
    if (crossArmed && crossTimer > 0.9) {
        crossArmed = false;
        toggleSpaceDrag();
    }
}

function applyGesture() {
    const on = dragGesture.value;
    wantPoses('spaceDragGesture', on);
    if (on && !unsubscribeGesture) unsubscribeGesture = subscribePoses(onGesturePoses);
    else if (!on && unsubscribeGesture) {
        unsubscribeGesture();
        unsubscribeGesture = null;
    }
}

export function setDragGesture(on) {
    dragGesture.value = Boolean(on);
    configRepository.setBool(GESTURE_KEY, dragGesture.value);
    applyGesture();
}

export async function initSpaceDrag() {
    if (loaded) return;
    loaded = true;
    dragGesture.value = await configRepository.getBool(GESTURE_KEY, true);
    applyGesture();
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
        if (dragUiState.value === 'starting') await api('StartSpaceDrag')?.();
    }, 2000);
}

export function stopSpaceDrag() {
    clearInterval(timer);
    timer = null;
    loaded = false;
}
