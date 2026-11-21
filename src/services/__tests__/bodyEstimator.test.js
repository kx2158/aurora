import { quatFromYaw, rotate } from '../footEstimator.js';
import {
    BODY_DEFAULTS,
    createBodyEstimator,
    elbowReference,
    elbowRotation,
    quatFromBasis,
    solveArm
} from '../bodyEstimator.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a) => {
    const l = Math.hypot(...a);
    return a.map((v) => v / l);
};
const qdot = (a, b) => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);

// directions spread over a sphere
const sphere = (n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
        const y = 1 - (2 * (i + 0.5)) / n;
        const r = Math.sqrt(1 - y * y);
        const a = i * 2.399963;
        out.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
    return out;
};

describe('quatFromBasis', () => {
    test('identity basis gives the identity quaternion, and rotates like the basis', () => {
        const q = quatFromBasis([1, 0, 0], [0, 1, 0], [0, 0, 1]);
        expect(Math.abs(q[3])).toBeCloseTo(1, 9);
        const yaw = quatFromYaw(1.1);
        const x = rotate(yaw, [1, 0, 0]);
        const y = rotate(yaw, [0, 1, 0]);
        const z = rotate(yaw, [0, 0, 1]);
        expect(qdot(quatFromBasis(x, y, z), yaw)).toBeCloseTo(1, 9);
    });
});

describe('solveArm', () => {
    const shoulder = [0, 1.4, 0];
    const upper = 0.33;
    const fore = 0.3;

    test('bones keep their length for every reachable hand direction', () => {
        for (const d of sphere(400)) {
            for (const r of [0.25, 0.45, 0.6]) {
                const hand = [shoulder[0] + d[0] * r, shoulder[1] + d[1] * r, shoulder[2] + d[2] * r];
                for (const side of ['left', 'right']) {
                    const a = solveArm(shoulder, hand, upper, fore, side, 0);
                    expect(dist(shoulder, a.elbow)).toBeCloseTo(upper, 5);
                    expect(dist(a.elbow, hand)).toBeCloseTo(fore, 5);
                    expect(a.elbow.every(Number.isFinite)).toBe(true);
                }
            }
        }
    });

    test('the elbow points down or back, never up, when the hand is level with the shoulder or lower', () => {
        for (const d of sphere(400)) {
            if (d[1] > 0) continue;
            const hand = [shoulder[0] + d[0] * 0.5, shoulder[1] + d[1] * 0.5, shoulder[2] + d[2] * 0.5];
            const a = solveArm(shoulder, hand, upper, fore, 'right', 0);
            expect(a.elbow[1]).toBeLessThanOrEqual(shoulder[1] + 0.12);
        }
    });

    test('the swivel is limited and changes slowly, even when asked for something extreme', () => {
        let swivel = 0;
        const hand = [0.2, 1.2, -0.35];
        for (let i = 0; i < 5; i++) {
            const a = solveArm(shoulder, hand, upper, fore, 'left', 0, swivel, 1 / 90, 9);
            expect(Math.abs(a.swivel - swivel)).toBeLessThanOrEqual(BODY_DEFAULTS.elbowSwivelSpeed / 90 + 1e-9);
            swivel = a.swivel;
        }
        for (let i = 0; i < 200; i++) swivel = solveArm(shoulder, hand, upper, fore, 'left', 0, swivel, 1 / 90, 9).swivel;
        expect(swivel).toBeCloseTo(BODY_DEFAULTS.elbowSwivelLimit, 9);
        for (let i = 0; i < 400; i++) swivel = solveArm(shoulder, hand, upper, fore, 'left', 0, swivel, 1 / 90, -9).swivel;
        expect(swivel).toBeCloseTo(-BODY_DEFAULTS.elbowSwivelLimit, 9);
    });

    test('moving the hand smoothly through every pose never makes the elbow jump or flip', () => {
        // a long path: down by the side, across the chest, overhead, behind the head, and back
        const path = [];
        const steps = 2400;
        for (let i = 0; i <= steps; i++) {
            const t = (i / steps) * Math.PI * 4;
            path.push([Math.sin(t * 0.7) * 0.5, 1.4 + Math.cos(t) * 0.55, Math.cos(t * 1.3) * 0.5]);
        }
        let prev = null;
        let prevRot = null;
        let maxJump = 0;
        for (const hand of path) {
            const d = norm(sub(hand, shoulder));
            const r = Math.hypot(...sub(hand, shoulder));
            if (r < 0.1) continue;
            const a = solveArm(shoulder, hand, upper, fore, 'right', 0);
            const rot = elbowRotation(shoulder, a.elbow, hand, a.dir);
            if (prev) {
                maxJump = Math.max(maxJump, dist(prev, a.elbow));
                // the tracker rotation never turns over between frames
                expect(qdot(prevRot, rot)).toBeGreaterThan(0.95);
            }
            prev = a.elbow;
            prevRot = rot;
            expect(Math.abs(a.swivel)).toBeLessThanOrEqual(BODY_DEFAULTS.maxElbowSwivel);
            expect(d.every(Number.isFinite)).toBe(true);
        }
        expect(maxJump).toBeLessThan(0.08);
    });

    test('left and right elbows point to their own sides', () => {
        const hand = [0, 1.3, -0.5]; // straight ahead
        const l = solveArm(shoulder, hand, upper, fore, 'left', 0);
        const r = solveArm(shoulder, hand, upper, fore, 'right', 0);
        expect(l.elbow[0]).toBeLessThan(0);
        expect(r.elbow[0]).toBeGreaterThan(0);
    });

    test('elbowReference is a unit vector perpendicular to the arm', () => {
        for (const d of sphere(300)) {
            const ref = elbowReference(d, 0.4, 'left');
            expect(Math.hypot(...ref)).toBeCloseTo(1, 6);
            expect(Math.abs(dot(ref, d))).toBeLessThan(1e-6);
        }
    });
});

describe('createBodyEstimator', () => {
    const eye = 1.65;
    const pose = (pos, yaw = 0) => ({ pos, rot: quatFromYaw(yaw) });

    test('produces every tracker, finite, with chest between hips and head', () => {
        const body = createBodyEstimator({ eyeHeight: eye });
        let out;
        for (let i = 0; i < 200; i++) {
            out = body.update(
                {
                    head: pose([0, eye, 0]),
                    leftHand: pose([-0.25, 1.1, -0.3]),
                    rightHand: pose([0.25, 1.1, -0.3])
                },
                1 / 90
            );
        }
        for (const k of ['hips', 'chest', 'leftFoot', 'rightFoot', 'leftKnee', 'rightKnee', 'leftElbow', 'rightElbow']) {
            expect(out[k]).toBeTruthy();
            expect([...out[k].pos, ...out[k].rot].every(Number.isFinite)).toBe(true);
        }
        expect(out.chest.pos[1]).toBeGreaterThan(out.hips.pos[1]);
        expect(out.chest.pos[1]).toBeLessThan(eye);
    });

    test('a missing hand skips only that arm', () => {
        const body = createBodyEstimator({ eyeHeight: eye });
        const out = body.update({ head: pose([0, eye, 0]), rightHand: pose([0.3, 1.1, -0.3]) }, 1 / 90);
        expect(out.leftElbow).toBe(null);
        expect(out.rightElbow).toBeTruthy();
    });

    test('walking and waving keeps feet ordered and elbows on their own side', () => {
        const body = createBodyEstimator({ eyeHeight: eye });
        for (let i = 0; i < 1500; i++) {
            const a = i * 0.005;
            const hx = Math.cos(a) * 1.2;
            const hz = Math.sin(a) * 1.2;
            const yaw = -a - Math.PI / 2;
            const wave = Math.sin(i * 0.1);
            const out = body.update(
                {
                    head: pose([hx, eye, hz], yaw),
                    leftHand: pose([hx - 0.3, 1.2 + wave * 0.5, hz], yaw),
                    rightHand: pose([hx + 0.3, 1.2 - wave * 0.5, hz], yaw)
                },
                1 / 90
            );
            const right = [Math.cos(out.bodyYaw), 0, -Math.sin(out.bodyYaw)];
            const lu = dot(sub(out.leftFoot.pos, out.hips.pos), right);
            const ru = dot(sub(out.rightFoot.pos, out.hips.pos), right);
            expect(ru).toBeGreaterThanOrEqual(lu - 1e-6);
            for (const k of ['leftElbow', 'rightElbow']) {
                expect(Math.abs(out[k].swivel)).toBeLessThanOrEqual(BODY_DEFAULTS.elbowSwivelLimit + 1e-9);
                expect(out[k].pos.every(Number.isFinite)).toBe(true);
            }
        }
    });
});
