/**
 * Sends Aurora's body trackers to SteamVR through Aurora's own driver (see auroraTrackerDriver.js): hips, chest,
 * feet, knees and elbows show up in SteamVR as real trackers, so every game and app sees them, VRChat included.
 * This is the main output and it is on by default.
 *
 * There is no OSC output for the trackers any more: SteamVR trackers only.
 *
 * It uses the poses from auroraPoses.js and the estimator with your calibration. Thumbstick walking is not
 * known here, so feet follow your head movement only (no walking in place yet).
 */
import { ref, watch } from 'vue';

import { createBodyEstimator } from './bodyEstimator';
import { enabledBody, estimatorOptions, sittingInput } from './auroraBodyCalibration';
import { bodyUnlocked } from './auroraBodyLock';
import { subscribePoses, wantPoses } from './auroraPoses';
import { ensureTrackerDriver } from './auroraTrackerDriver';
import configRepository from './config';

const DRIVER_KEY = 'Aurora_body_driver';
/** Send the trackers to Aurora's SteamVR driver, so SteamVR lists them as trackers. On unless switched off. */
export const driverOut = ref(true);

let started = false;
let estimator = null;
let unsubscribe = null;
let lastAt = 0;
let driverSentAt = 0;

function onPoses(poses, at) {
    if (!poses?.head || !poses.leftHand || !poses.rightHand) return;
    if (!estimator) estimator = createBodyEstimator(estimatorOptions.value);
    const dt = lastAt ? Math.min(0.1, Math.max(0.001, (at - lastAt) / 1000)) : 1 / 30;
    lastAt = at;
    const body = estimator.update(
        { head: poses.head, leftHand: poses.leftHand, rightHand: poses.rightHand, sitting: sittingInput() },
        dt
    );
    if (driverOut.value && at - driverSentAt >= 7) {
        driverSentAt = at;
        try {
            // standing space, the app converts it for the driver
            AppApi.SendTrackerPoses(JSON.stringify(enabledBody(body)));
        } catch {
            // not available in this build
        }
    }
}

function apply() {
    const on = driverOut.value && bodyUnlocked.value;
    wantPoses('body', on);
    if (on && !unsubscribe) {
        estimator = null;
        lastAt = 0;
        unsubscribe = subscribePoses(onPoses);
    } else if (!on && unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
}

export async function setDriverOut(on) {
    driverOut.value = Boolean(on);
    configRepository.setBool(DRIVER_KEY, driverOut.value);
    if (driverOut.value) await ensureTrackerDriver();
}

export async function initBodyOutput() {
    if (started) return;
    started = true;
    driverOut.value = await configRepository.getBool(DRIVER_KEY, true);
    if (driverOut.value && bodyUnlocked.value) ensureTrackerDriver();
    // a new calibration means a new estimator
    watch(estimatorOptions, () => (estimator = null), { deep: true });
    watch([driverOut, bodyUnlocked], apply, { immediate: true });
}
