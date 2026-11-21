/**
 * Sends Aurora's body trackers out: to VRChat over OSC, and/or to Aurora's SteamVR driver (see auroraTrackerDriver.js).
 * OSC part: sends them to VRChat (hips, chest, feet, knees, elbows and the head).
 * VRChat reads them as its own OSC trackers on port 9000, so SteamVR does not see them and no driver is needed.
 * In VRChat: Options > OSC > Enabled, then in the action menu press "Auto-center OSC Trackers" once and calibrate.
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
import { buildTrackerMessages, encodeOscBundle } from './vrchatTrackers';

const KEY = 'Aurora_body_osc';
const DRIVER_KEY = 'Aurora_body_driver';
export const oscOut = ref(false);
/** Send the trackers to Aurora's SteamVR driver, so SteamVR lists them as trackers. */
export const driverOut = ref(false);
export const oscPort = 9000;

let started = false;
let estimator = null;
let unsubscribe = null;
let lastAt = 0;
let sentAt = 0;
let driverSentAt = 0;

const toBase64 = (bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
};

function onPoses(poses, at) {
    if (!poses?.head || !poses.leftHand || !poses.rightHand) return;
    if (!estimator) estimator = createBodyEstimator(estimatorOptions.value);
    const dt = lastAt ? Math.min(0.1, Math.max(0.001, (at - lastAt) / 1000)) : 1 / 30;
    lastAt = at;
    const body = estimator.update(
        { head: poses.head, leftHand: poses.leftHand, rightHand: poses.rightHand, sitting: sittingInput() },
        dt
    );
    if (driverOut.value && at - driverSentAt >= 15) {
        driverSentAt = at;
        try {
            // standing space, the app converts it for the driver
            AppApi.SendTrackerPoses(JSON.stringify(enabledBody(body)));
        } catch {
            // not available in this build
        }
    }
    // about 60 packets a second is plenty
    if (!oscOut.value || at - sentAt < 15) return;
    sentAt = at;
    const bytes = encodeOscBundle(buildTrackerMessages(enabledBody(body), poses.head));
    try {
        AppApi.SendOsc(toBase64(bytes), oscPort);
    } catch {
        // not available in this build
    }
}

function apply() {
    const on = (oscOut.value || driverOut.value) && bodyUnlocked.value;
    wantPoses('osc', on);
    if (on && !unsubscribe) {
        estimator = null;
        lastAt = 0;
        unsubscribe = subscribePoses(onPoses);
    } else if (!on && unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
}

export function setOscOut(on) {
    oscOut.value = Boolean(on);
    configRepository.setBool(KEY, oscOut.value);
}

export async function setDriverOut(on) {
    driverOut.value = Boolean(on);
    configRepository.setBool(DRIVER_KEY, driverOut.value);
    if (driverOut.value) await ensureTrackerDriver();
}

export async function initBodyOutput() {
    if (started) return;
    started = true;
    oscOut.value = await configRepository.getBool(KEY, false);
    driverOut.value = await configRepository.getBool(DRIVER_KEY, false);
    if (driverOut.value && bodyUnlocked.value) ensureTrackerDriver();
    // a new calibration means a new estimator
    watch(estimatorOptions, () => (estimator = null), { deep: true });
    watch([oscOut, driverOut, bodyUnlocked], apply, { immediate: true });
}
