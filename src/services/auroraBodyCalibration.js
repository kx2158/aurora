/**
 * Body calibration for Aurora's full body estimation.
 *
 * It is not precise. It takes your measured eye height and your arm span (hands out in a T pose), and
 * turns them into a few scale numbers for the estimator. You can also type the numbers in by hand.
 * The VR side is a hook: call setPoseSource(fn) with a function that returns the current poses
 *   { head: { pos }, leftHand: { pos }, rightHand: { pos } }  (SteamVR standing space, meters)
 * and the Calibrate buttons will use it. Until something provides poses, only manual entry works.
 */
import { computed, ref, watch } from 'vue';

import {
    armSpanFromSamples,
    calibrationFromMeasurements,
    defaults,
    eyeHeightFromSamples,
    sanitize
} from './bodyCalibrationCore';
import configRepository from './config';

const KEY = 'Aurora_body_calibration';

export { averageArmSpan, CAL_LIMITS, defaults, sanitize } from './bodyCalibrationCore';

// ---------- app state ----------

export const calibration = ref(defaults());
/** idle, stand (collecting eye height), tpose (collecting arm span), done, failed */
export const calStatus = ref('idle');
export const calMessage = ref('');
export const hasPoseSource = ref(false);

let poseSource = null;
let loaded = false;
let timer = null;

export const estimatorOptions = computed(() => ({
    eyeHeight: calibration.value.eyeHeight,
    armScale: calibration.value.armScale,
    legScale: calibration.value.legScale,
    seatHeight: calibration.value.seatHeight,
    swayAmount: calibration.value.swayAmount,
    seatSensitivity: calibration.value.seatSensitivity,
    counterbalance: calibration.value.counterbalance,
    smoothing: calibration.value.smoothing,
    // how far the head turns on the neck before the chest and then the whole body follow
    yawDeadband: 1.05 * calibration.value.neckRange,
    neckTurnRange: 0.95 * calibration.value.neckRange,
    // how far the legs may swing at the hips
    idleMotion: calibration.value.idleMotion,
    maxHipAbduction: 0.75 * calibration.value.legFreedom,
    maxHipAdduction: 0.42 * calibration.value.legFreedom,
    maxHipExtension: 0.55 * calibration.value.legFreedom,
    // the feet stand and walk wider or closer together
    stanceHalfWidth: 0.07 * calibration.value.feetSeparation,
    minFootSeparation: 0.13 * calibration.value.feetSeparation
}));

/** 'auto' decides from the hips height, 'sit' and 'stand' force it. Pass it to the estimator as input.sitting. */
export const sitMode = ref('auto');
export const sittingInput = () => (sitMode.value === 'sit' ? true : sitMode.value === 'stand' ? false : undefined);

/** Which of the 8 VRChat trackers are sent. VRChat takes hips, chest, 2 feet, 2 knees and 2 elbows, nothing more. */
export const TRACKER_KEYS = ['hips', 'chest', 'leftFoot', 'rightFoot', 'leftKnee', 'rightKnee', 'leftElbow', 'rightElbow'];
export const trackerOn = ref(Object.fromEntries(TRACKER_KEYS.map((k) => [k, true])));
const TRACKER_KEY = 'Aurora_body_trackers';

/** The body without the trackers that are switched off, ready for buildTrackerMessages. */
export function enabledBody(body) {
    const out = {};
    for (const k of TRACKER_KEYS) if (trackerOn.value[k] !== false && body?.[k]) out[k] = body[k];
    return out;
}

export function toggleTracker(name) {
    if (!TRACKER_KEYS.includes(name)) return;
    trackerOn.value = { ...trackerOn.value, [name]: !trackerOn.value[name] };
    configRepository.setString(TRACKER_KEY, JSON.stringify(trackerOn.value));
}

export async function initCalibration() {
    if (loaded) return;
    loaded = true;
    try {
        const saved = JSON.parse(await configRepository.getString(TRACKER_KEY, '{}'));
        for (const k of TRACKER_KEYS) if (saved[k] === false) trackerOn.value[k] = false;
    } catch {
        // keep all on
    }
    try {
        calibration.value = sanitize(JSON.parse(await configRepository.getString(KEY, '{}')));
    } catch {
        calibration.value = defaults();
    }
    watch(
        calibration,
        () => configRepository.setString(KEY, JSON.stringify(calibration.value)),
        { deep: true }
    );
}

/** The VR side calls this once it can deliver poses. Pass null to remove the source. */
export function setPoseSource(fn) {
    poseSource = typeof fn === 'function' ? fn : null;
    hasPoseSource.value = Boolean(poseSource);
}

/** Manual entry: any of eyeHeight, armScale, legScale. */
export function setManual(values) {
    calibration.value = sanitize({ ...calibration.value, ...values, calibratedAt: Date.now(), source: 'manual' });
}

export function resetCalibration() {
    cancelCalibration();
    calibration.value = defaults();
}

export function cancelCalibration() {
    clearInterval(timer);
    timer = null;
    calStatus.value = 'idle';
    calMessage.value = '';
}

function collect(seconds, hz = 20) {
    return new Promise((resolve) => {
        const samples = [];
        const wanted = Math.round(seconds * hz);
        let ticks = 0;
        clearInterval(timer);
        timer = setInterval(() => {
            ticks++;
            try {
                const pose = poseSource?.();
                if (pose?.head?.pos) samples.push(pose);
            } catch {
                // a bad frame is skipped
            }
            // stop when there are enough samples, or after three times as long if the source keeps failing
            if (samples.length >= wanted || ticks >= wanted * 3) {
                clearInterval(timer);
                timer = null;
                resolve(samples);
            }
        }, 1000 / hz);
    });
}

/**
 * Two steps, three seconds each: stand still (eye height), then hold both arms out to the sides (arm span).
 * Set withArms false to only measure height.
 */
export async function runCalibration({ withArms = true, seconds = 3 } = {}) {
    if (!poseSource) {
        calStatus.value = 'failed';
        calMessage.value = 'no_source';
        return false;
    }
    calStatus.value = 'stand';
    calMessage.value = '';
    const stand = await collect(seconds);
    if (calStatus.value !== 'stand') return false; // cancelled
    const eyeHeight = eyeHeightFromSamples(stand);
    if (eyeHeight === null) {
        calStatus.value = 'failed';
        calMessage.value = 'unsteady';
        return false;
    }
    let armSpan;
    if (withArms) {
        calStatus.value = 'tpose';
        const t = await collect(seconds);
        if (calStatus.value !== 'tpose') return false;
        armSpan = armSpanFromSamples(t, eyeHeight);
        if (armSpan === null) {
            calStatus.value = 'failed';
            calMessage.value = 'no_tpose';
            return false;
        }
    }
    calibration.value = calibrationFromMeasurements({ eyeHeight, armSpan }, calibration.value);
    calStatus.value = 'done';
    return true;
}
