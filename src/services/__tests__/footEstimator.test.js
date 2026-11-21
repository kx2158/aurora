import {
    constrainFeet,
    createFootEstimator,
    forwardOf,
    proportions,
    quatFromYaw,
    rightOf,
    solveKnee,
    yawOfRotation
} from '../footEstimator.js';

const frameAt = (yaw = 0) => ({ origin: [0, 0, 0], yaw, hipY: 0.88, hipWidth: 0.16, legLength: 0.9, ankleHeight: 0.07 });
const foot = (u, v, yaw = 0, y = 0, bodyYaw = 0) => {
    const r = rightOf(bodyYaw);
    const f = forwardOf(bodyYaw);
    return { pos: [r[0] * u + f[0] * v, y, r[2] * u + f[2] * v], yaw };
};
const local = (f, bodyYaw = 0) => {
    const r = rightOf(bodyYaw);
    const fw = forwardOf(bodyYaw);
    return { u: f.pos[0] * r[0] + f.pos[2] * r[2], v: f.pos[0] * fw[0] + f.pos[2] * fw[2], y: f.pos[1] };
};

describe('yaw helpers', () => {
    test('yawOfRotation reads back the yaw it was built from', () => {
        for (const yaw of [-3, -1.2, 0, 0.4, 2.5]) {
            expect(yawOfRotation(quatFromYaw(yaw))).toBeCloseTo(yaw, 6);
        }
    });
});

describe('constrainFeet', () => {
    test('crossed feet are uncrossed', () => {
        const out = constrainFeet(foot(0.1, 0), foot(-0.1, 0), frameAt());
        expect(local(out.left).u).toBeLessThan(local(out.right).u);
        expect(out.fired).toContain('cross');
    });

    test('feet side by side keep the minimum separation', () => {
        const out = constrainFeet(foot(-0.01, 0), foot(0.01, 0), frameAt(), { minFootSeparation: 0.13 });
        expect(local(out.right).u - local(out.left).u).toBeGreaterThanOrEqual(0.13 - 1e-6);
    });

    test('feet already apart are left alone', () => {
        const l = foot(-0.1, 0);
        const r = foot(0.1, 0);
        const out = constrainFeet(l, r, frameAt());
        expect(out.fired).toEqual([]);
        expect(out.left.pos[0]).toBeCloseTo(l.pos[0], 9);
        expect(out.right.pos[0]).toBeCloseTo(r.pos[0], 9);
    });

    test('a foot far ahead of the other may be close sideways', () => {
        const out = constrainFeet(foot(-0.02, 0), foot(0.02, -0.28), frameAt());
        expect(out.fired).toEqual([]);
    });

    test('crossTolerance lets a foot cross a little when the other is clearly ahead', () => {
        const strict = constrainFeet(foot(0.05, 0), foot(-0.05, -0.28), frameAt());
        const loose = constrainFeet(foot(0.05, 0), foot(-0.05, -0.28), frameAt(), { crossTolerance: 0.1 });
        expect(local(strict.left).u).toBeLessThanOrEqual(local(strict.right).u + 1e-9);
        expect(loose.fired).toEqual([]);
    });

    test('a foot too far from the hip is pulled in', () => {
        const out = constrainFeet(foot(-0.1, 2), foot(0.1, 0), frameAt());
        const l = local(out.left);
        const d = Math.hypot(l.u + 0.08, l.v, 0.88 - (l.y + 0.07));
        expect(d).toBeLessThanOrEqual(0.9 * 0.98 + 1e-6);
        expect(out.fired).toContain('reach');
    });

    test('feet never go under the floor', () => {
        const out = constrainFeet(foot(-0.1, 0, 0, -0.3), foot(0.1, 0, 0, -0.1), frameAt());
        expect(out.left.pos[1]).toBe(0);
        expect(out.right.pos[1]).toBe(0);
    });

    test('toes are limited relative to the body and to each other', () => {
        const out = constrainFeet(foot(-0.1, 0, 2), foot(0.1, 0, -2), frameAt());
        expect(Math.abs(out.left.yaw)).toBeLessThanOrEqual(0.7 + 1e-9);
        expect(Math.abs(out.right.yaw)).toBeLessThanOrEqual(0.7 + 1e-9);
        expect(Math.abs(out.left.yaw - out.right.yaw)).toBeLessThanOrEqual(0.9 + 1e-9);
    });

    test('works the same when the body faces another way', () => {
        for (const yaw of [0.7, 2.1, -2.8]) {
            const out = constrainFeet(foot(0.1, 0, yaw, 0, yaw), foot(-0.1, 0, yaw, 0, yaw), frameAt(yaw));
            expect(local(out.left, yaw).u).toBeLessThan(local(out.right, yaw).u);
        }
    });

    test('random feet always come out ordered, apart, above the floor and in reach', () => {
        let seed = 12345;
        const rand = () => {
            seed = (seed * 1664525 + 1013904223) % 4294967296;
            return seed / 4294967296;
        };
        for (let i = 0; i < 2000; i++) {
            const yaw = (rand() - 0.5) * 6;
            const l = foot((rand() - 0.5) * 1.6, (rand() - 0.5) * 1.6, (rand() - 0.5) * 8, rand() * 0.4 - 0.1, yaw);
            const r = foot((rand() - 0.5) * 1.6, (rand() - 0.5) * 1.6, (rand() - 0.5) * 8, rand() * 0.4 - 0.1, yaw);
            const out = constrainFeet(l, r, frameAt(yaw));
            const a = local(out.left, yaw);
            const b = local(out.right, yaw);
            expect(Number.isFinite(a.u + a.v + a.y + b.u + b.v + b.y)).toBe(true);
            expect(b.u).toBeGreaterThanOrEqual(a.u - 1e-6);
            expect(a.y).toBeGreaterThanOrEqual(0);
            expect(b.y).toBeGreaterThanOrEqual(0);
            const dv = Math.abs(b.v - a.v);
            const need = 0.13 * Math.sqrt(Math.max(0, 1 - Math.min(1, dv / 0.26) ** 2));
            expect(b.u - a.u).toBeGreaterThanOrEqual(need - 1e-6);
            for (const [f, hu] of [
                [a, -0.08],
                [b, 0.08]
            ]) {
                const d = Math.hypot(f.u - hu, f.v, 0.88 - (f.y + 0.07));
                expect(d).toBeLessThanOrEqual(0.9 * 0.98 + 0.002);
            }
        }
    });
});

describe('solveKnee', () => {
    test('keeps both bones at their length and bends toward the pole', () => {
        const hip = [0, 0.9, 0];
        const ankle = [0, 0.15, -0.2];
        const knee = solveKnee(hip, ankle, 0.45, 0.45, [0, 0, -1]);
        const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        expect(dist(hip, knee)).toBeCloseTo(0.45, 6);
        expect(dist(knee, ankle)).toBeCloseTo(0.45, 6);
        expect(knee[2]).toBeLessThan(-0.1); // forward is -z
    });

    test('a fully stretched leg does not produce NaN', () => {
        const knee = solveKnee([0, 0.9, 0], [0, -5, 0], 0.45, 0.45, [0, 0, -1]);
        expect(knee.every(Number.isFinite)).toBe(true);
    });
});

describe('createFootEstimator', () => {
    const eye = 1.65;
    const head = (x, z, yaw, y = eye) => ({ head: { pos: [x, y, z], rot: quatFromYaw(yaw) } });

    const checkFrame = (out, bodyYaw) => {
        const l = local(out.left, bodyYaw);
        const r = local(out.right, bodyYaw);
        for (const v of [...out.hips.pos, ...out.left.pos, ...out.right.pos, ...out.leftKnee, ...out.rightKnee]) {
            expect(Number.isFinite(v)).toBe(true);
        }
        expect(r.u).toBeGreaterThanOrEqual(l.u - 1e-6);
        expect(l.y).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
    };

    test('standing still keeps the feet apart and level', () => {
        const est = createFootEstimator({ eyeHeight: eye });
        let out;
        for (let i = 0; i < 300; i++) out = est.update(head(0, 0, 0), 1 / 90);
        checkFrame(out, out.bodyYaw);
        const l = local(out.left, out.bodyYaw);
        const r = local(out.right, out.bodyYaw);
        expect(r.u - l.u).toBeGreaterThanOrEqual(0.13);
        expect(l.y).toBeCloseTo(0, 6);
    });

    test('walking in a circle never crosses or sinks the feet', () => {
        const est = createFootEstimator({ eyeHeight: eye });
        let steps = 0;
        for (let i = 0; i < 2000; i++) {
            const a = i * 0.004;
            const out = est.update(head(Math.cos(a) * 1.5, Math.sin(a) * 1.5, -a - Math.PI / 2), 1 / 90);
            checkFrame(out, out.bodyYaw);
            if (out.left.pos[1] > 0.01 || out.right.pos[1] > 0.01) steps++;
        }
        expect(steps).toBeGreaterThan(0);
    });

    test('turning the head quickly and back stays valid', () => {
        const est = createFootEstimator({ eyeHeight: eye });
        for (let i = 0; i < 1200; i++) {
            const yaw = Math.sin(i * 0.05) * 3;
            const out = est.update(head(0.2 * Math.sin(i * 0.02), 0, yaw), 1 / 90);
            checkFrame(out, out.bodyYaw);
        }
    });

    test('crouching and standing on tiptoe stay finite and in reach', () => {
        const est = createFootEstimator({ eyeHeight: eye });
        for (let i = 0; i < 600; i++) {
            const y = eye + Math.sin(i * 0.03) * 0.7;
            const out = est.update(head(0, 0, 0, y), 1 / 90);
            checkFrame(out, out.bodyYaw);
        }
    });

    test('proportions scale with height', () => {
        expect(proportions(1.8).legLength).toBeGreaterThan(proportions(1.5).legLength);
    });
});
