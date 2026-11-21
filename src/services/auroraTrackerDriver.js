/**
 * Aurora's own SteamVR driver: makes SteamVR list the body trackers (hips, chest, feet, knees, elbows) as real trackers,
 * so every SteamVR game sees them, not just VRChat. The driver is built from Driver/ and installed with Aurora.
 * Aurora registers it with SteamVR when you turn it on (see TrackerDriver.cs); SteamVR must be restarted once after that.
 */
import { ref } from 'vue';

/** 'unknown' | 'missing' (not built into this Aurora) | 'ready' | 'restart' | 'error' */
export const driverState = ref('unknown');

export async function ensureTrackerDriver() {
    if (typeof AppApi === 'undefined' || typeof AppApi.EnsureAuroraTrackerDriver !== 'function') {
        return (driverState.value = 'missing');
    }
    try {
        const status = JSON.parse((await AppApi.EnsureAuroraTrackerDriver()) || '{}');
        if (status.error) return (driverState.value = 'error');
        if (!status.built) return (driverState.value = 'missing');
        if (status.needsSteamVrRestart) return (driverState.value = 'restart');
        // registered just now while SteamVR is closed, or earlier: SteamVR loads it at its next start
        return (driverState.value = status.registered ? 'ready' : 'error');
    } catch {
        return (driverState.value = 'error');
    }
}
