/**
 * Headset and controller positions from SteamVR. The overlay process reads them with OpenVR
 * (SendPoses in VRCXVRCef.cs) and sends them to the app about 30 times a second.
 * The overlay only runs when SteamVR is up and the overlay is on, so anything that needs poses
 * calls wantPoses(reason, true), which makes Aurora switch the overlay on by itself.
 */
import { ref } from 'vue';

import { setPoseSource } from './auroraBodyCalibration';

let latest = null;
let latestAt = 0;
const listeners = new Set();
const reasons = new Set();

/** True while something needs poses. The VR store reads this to turn the overlay on. */
export const posesWanted = ref(false);

/** The overlay calls this (through window.$bridge.vrPoses) with { head, leftHand, rightHand }. */
export function onVrPoses(json) {
    try {
        latest = typeof json === 'string' ? JSON.parse(json) : json;
        latestAt = Date.now();
    } catch {
        return;
    }
    for (const fn of listeners) {
        try {
            fn(latest, latestAt);
        } catch {
            // one bad listener must not stop the others
        }
    }
}

export const freshPoses = () => (latest && Date.now() - latestAt < 1000 ? latest : null);

export function subscribePoses(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function wantPoses(reason, on) {
    if (on) reasons.add(reason);
    else reasons.delete(reason);
    posesWanted.value = reasons.size > 0;
}

/** Waits for the first poses after the overlay was switched on (it can take a few seconds to start). */
export async function waitForPoses(ms = 12000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (freshPoses()) return true;
        await new Promise((r) => setTimeout(r, 200));
    }
    return false;
}

// the calibration card's Calibrate button reads poses from here
setPoseSource(freshPoses);
