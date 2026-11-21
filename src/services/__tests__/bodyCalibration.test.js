import {
    armSpanFromSamples,
    averageArmSpan,
    calibrationFromMeasurements,
    CAL_LIMITS,
    defaults,
    eyeHeightFromSamples,
    sanitize
} from '../bodyCalibrationCore.js';
import { createBodyEstimator } from '../bodyEstimator.js';
import { quatFromYaw } from '../footEstimator.js';

const still = (y, n = 40) => Array.from({ length: n }, (_, i) => ({ head: { pos: [0, y + (i % 2) * 0.004, 0] } }));
const tpose = (eye, span, n = 40) =>
    Array.from({ length: n }, () => ({
        head: { pos: [0, eye, 0] },
        leftHand: { pos: [-span / 2, eye - 0.25, 0] },
        rightHand: { pos: [span / 2, eye - 0.25, 0] }
    }));

describe('eyeHeightFromSamples', () => {
    test('takes the middle value of steady samples', () => {
        expect(eyeHeightFromSamples(still(1.72))).toBeCloseTo(1.72, 2);
    });

    test('ignores a spike', () => {
        const s = still(1.7);
        s[5].head.pos[1] = 2.4;
        s[6].head.pos[1] = 0.2;
        expect(eyeHeightFromSamples(s)).toBeCloseTo(1.7, 2);
    });

    test('refuses too few samples or someone bobbing up and down', () => {
        expect(eyeHeightFromSamples(still(1.7, 3))).toBe(null);
        const bob = Array.from({ length: 40 }, (_, i) => ({ head: { pos: [0, 1.5 + (i % 2) * 0.3, 0] } }));
        expect(eyeHeightFromSamples(bob)).toBe(null);
        expect(eyeHeightFromSamples(null)).toBe(null);
    });
});

describe('armSpanFromSamples', () => {
    test('measures hand to hand in a T pose', () => {
        expect(armSpanFromSamples(tpose(1.7, 1.75), 1.7)).toBeCloseTo(1.75, 3);
    });

    test('rejects hands that are not out to the sides', () => {
        expect(armSpanFromSamples(tpose(1.7, 0.4), 1.7)).toBe(null);
        const low = tpose(1.7, 1.7).map((s) => ({ ...s, leftHand: { pos: [-0.85, 0.5, 0] }, rightHand: { pos: [0.85, 0.5, 0] } }));
        expect(armSpanFromSamples(low, 1.7)).toBe(null);
    });
});

describe('calibrationFromMeasurements', () => {
    test('an average person gets an arm scale near 1', () => {
        const eye = 1.65;
        const c = calibrationFromMeasurements({ eyeHeight: eye, armSpan: averageArmSpan(eye) + 0.08 });
        expect(c.armScale).toBeCloseTo(1, 2);
        expect(c.source).toBe('vr');
    });

    test('longer arms give a bigger scale', () => {
        const c = calibrationFromMeasurements({ eyeHeight: 1.65, armSpan: 1.95 });
        expect(c.armScale).toBeGreaterThan(1.05);
    });

    test('nonsense is kept inside the limits', () => {
        const c = calibrationFromMeasurements({ eyeHeight: 9, armSpan: 20 });
        expect(c.eyeHeight).toBeLessThanOrEqual(CAL_LIMITS.eyeHeight[1]);
        expect(c.armScale).toBeLessThanOrEqual(CAL_LIMITS.armScale[1]);
    });

    test('height only leaves the arm scale alone', () => {
        const before = { ...defaults(), armScale: 1.1 };
        expect(calibrationFromMeasurements({ eyeHeight: 1.8 }, before).armScale).toBe(1.1);
    });
});

describe('sanitize', () => {
    test('repairs missing and broken values', () => {
        expect(sanitize(null)).toEqual({ ...defaults(), calibratedAt: 0 });
        const c = sanitize({ eyeHeight: 'abc', armScale: null, legScale: 7, source: 'weird' });
        expect(c.eyeHeight).toBe(1.65);
        expect(c.armScale).toBe(1);
        expect(c.legScale).toBe(CAL_LIMITS.legScale[1]);
        expect(c.source).toBe('default');
    });
});

describe('the estimator uses the calibration', () => {
    const run = (opts) => {
        const body = createBodyEstimator(opts);
        const pose = (pos) => ({ pos, rot: quatFromYaw(0) });
        let out;
        for (let i = 0; i < 120; i++) {
            out = body.update(
                { head: pose([0, opts.eyeHeight, 0]), leftHand: pose([-0.2, 1.1, -0.3]), rightHand: pose([0.2, 1.1, -0.3]) },
                1 / 90
            );
        }
        return { out, body };
    };

    test('arm scale changes the arm bones', () => {
        const a = run({ eyeHeight: 1.65, armScale: 1 }).body.arm.upper;
        const b = run({ eyeHeight: 1.65, armScale: 1.1 }).body.arm.upper;
        expect(b / a).toBeCloseTo(1.1, 6);
    });

    test('leg scale moves the hips up and keeps the feet on the floor', () => {
        const short = run({ eyeHeight: 1.65, legScale: 0.92 }).out;
        const long = run({ eyeHeight: 1.65, legScale: 1.04 }).out;
        expect(long.hips.pos[1]).toBeGreaterThan(short.hips.pos[1]);
        expect(long.leftFoot.pos[1]).toBeCloseTo(0, 6);
        expect(short.leftFoot.pos[1]).toBeCloseTo(0, 6);
    });
});
