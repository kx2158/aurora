/**
 * The pure math of Aurora's body calibration: no Vue, no storage, so it is easy to test.
 * See auroraBodyCalibration.js for the app side.
 */

export const CAL_LIMITS = {
    eyeHeight: [0.01, 100], // any body size, an avatar of 1 cm or 100 m works too,
    armScale: [0.8, 1.25],
    seatHeight: [0.25, 0.9], // for a normal sized body, it scales with eyeHeight
    swayAmount: [0, 3],
    feetSeparation: [0.6, 2],
    seatSensitivity: [0.5, 2],
    legScale: [0.88, 1.05] // legs longer than the hips are high would not fit, so the top is kept low
};

/** The estimator's average arm span for a given eye height, before any scaling. */
export function averageArmSpan(eyeHeight) {
    // two shoulders' half width each side plus upper arm and forearm each side (see bodyEstimator.js)
    return 2 * (0.1 * eyeHeight + 0.2 * eyeHeight + 0.18 * eyeHeight);
}

export const defaults = () => ({
    eyeHeight: 1.65,
    armScale: 1,
    legScale: 1,
    seatHeight: 0.46, // chair 0.45, bed around 0.55 to 0.6
    swayAmount: 1, // hip sway while walking
    feetSeparation: 1, // how far apart the feet stand and walk
    seatSensitivity: 1, // how easily it decides you sat down
    calibratedAt: 0,
    source: 'default' // 'default', 'manual' or 'vr'
});

const clampTo = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

/** Keeps every value inside what the estimator can handle, and replaces anything that is not a number. */
export function sanitize(c) {
    const d = defaults();
    const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback);
    return {
        eyeHeight: clampTo(num(c?.eyeHeight, d.eyeHeight), CAL_LIMITS.eyeHeight),
        armScale: clampTo(num(c?.armScale, d.armScale), CAL_LIMITS.armScale),
        legScale: clampTo(num(c?.legScale, d.legScale), CAL_LIMITS.legScale),
        seatHeight: clampTo(num(c?.seatHeight, d.seatHeight), CAL_LIMITS.seatHeight),
        swayAmount: clampTo(num(c?.swayAmount, d.swayAmount), CAL_LIMITS.swayAmount),
        feetSeparation: clampTo(num(c?.feetSeparation, d.feetSeparation), CAL_LIMITS.feetSeparation),
        seatSensitivity: clampTo(num(c?.seatSensitivity, d.seatSensitivity), CAL_LIMITS.seatSensitivity),
        calibratedAt: num(c?.calibratedAt, 0),
        source: ['manual', 'vr'].includes(c?.source) ? c.source : 'default'
    };
}

const median = (xs) => {
    const a = [...xs].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/**
 * Eye height from a few seconds of standing still. Median, so a quick nod or a spike does not matter.
 * Returns null if there are too few samples or they are not steady.
 */
export function eyeHeightFromSamples(samples) {
    if (!Array.isArray(samples) || samples.length < 10) return null;
    const ys = samples.map((s) => s.head.pos[1]).filter(Number.isFinite);
    if (ys.length < 10) return null;
    const mid = median(ys);
    const spread = median(ys.map((y) => Math.abs(y - mid)));
    if (spread > 0.03) return null; // moving up and down too much
    return mid;
}

/**
 * Arm span (hand to hand) from samples taken in a T pose. Also needs the arms to be roughly level
 * with the head's height line and the hands far apart, otherwise it is not a T pose.
 */
export function armSpanFromSamples(samples, eyeHeight) {
    if (!Array.isArray(samples) || samples.length < 10) return null;
    const spans = [];
    for (const s of samples) {
        const l = s.leftHand?.pos;
        const r = s.rightHand?.pos;
        if (!l || !r) continue;
        const span = Math.hypot(l[0] - r[0], l[1] - r[1], l[2] - r[2]);
        const level = Math.abs(l[1] - r[1]) < 0.15 && l[1] < s.head.pos[1] && l[1] > s.head.pos[1] - 0.6;
        if (level && span > eyeHeight * 0.7) spans.push(span);
    }
    if (spans.length < 10) return null;
    return median(spans);
}

/**
 * Turns measurements into calibration numbers. Pass any of: eyeHeight (m), armSpan (m).
 * The arm scale is the measured span against the average span for that height.
 * Controllers are held a little in front of the wrist, so the measured span runs a bit long;
 * handOffset (m, each side) takes that off. 0.04 is a typical guess.
 */
export function calibrationFromMeasurements({ eyeHeight, armSpan }, previous = defaults(), handOffset = 0.04) {
    const next = { ...previous };
    if (Number.isFinite(eyeHeight)) next.eyeHeight = eyeHeight;
    if (Number.isFinite(armSpan)) {
        const span = Math.max(0.1, armSpan - 2 * handOffset);
        next.armScale = span / averageArmSpan(next.eyeHeight);
    }
    return sanitize({ ...next, calibratedAt: Date.now(), source: 'vr' });
}
