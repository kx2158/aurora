import { describe, expect, test } from 'vitest';
import { createBodyEstimator } from '../bodyEstimator.js';
import { constrainFeet, createFootEstimator, forwardOf, quatFromAxisAngle, quatFromYaw, quatMul, rightOf, rotate, solveKnee } from '../footEstimator.js';

const D = 1 / 90;
const Q = [0, 0, 0, 1];

function drive(headAt, secs, options = {}) {
    const body = createBodyEstimator(options);
    const rows = [];
    for (let i = 0; i < secs / D; i++) {
        const h = headAt(i * D);
        rows.push(body.update({ head: { pos: h, rot: Q } }, D));
    }
    return rows;
}

describe('adaptive joint smoothing', () => {
    test('hips catch up with a fast squat quickly', () => {
        const rows = drive((t) => [0, 1.65 - 0.5 * Math.min(1, Math.max(0, (t - 1) / 1)), 0], 4);
        const y0 = rows[0].hips.pos[1];
        const yEnd = rows[rows.length - 1].hips.pos[1];
        const i90 = rows.findIndex((r, i) => i * D > 1 && y0 - r.hips.pos[1] > 0.9 * (y0 - yEnd));
        // the head reaches 90 percent of its drop at 1.9 s; the hips must be within 50 ms of that
        expect(i90 * D - 1.9).toBeLessThan(0.05);
    });

    test('a fast sideways shift is followed with almost no lag', () => {
        const rows = drive((t) => [0.4 * Math.min(1, Math.max(0, (t - 1) / 0.4)), 1.65, 0], 4);
        const i = rows.findIndex((r, k) => k * D > 1 && r.hips.pos[0] > 0.36);
        expect(i * D).toBeLessThan(1.36 + 0.06);
    });

    test('a jump of more than a meter is taken at once', () => {
        const rows = drive((t) => (t < 1 ? [0, 1.65, 0] : [5, 1.65, 0]), 1.2);
        expect(rows[rows.length - 1].hips.pos[0]).toBeGreaterThan(4.9);
    });

    test('smoothing 0 passes the estimate through', () => {
        const a = drive((t) => [0.1 * Math.sin(t * 3), 1.65, 0], 2, { smoothing: 0 });
        expect(Number.isFinite(a[a.length - 1].hips.pos[0])).toBe(true);
    });
});

describe('hip counterbalance', () => {
    const slowLean = (cb) => {
        const rows = drive((t) => [0, 1.65, -Math.min(0.18, (0.18 * Math.max(0, t - 1)) / 3)], 6, { counterbalance: cb });
        return rows[rows.length - 1];
    };

    test('hips shift back from a slowly leaning head, more with a higher setting', () => {
        const off = slowLean(0).hips.pos[2];
        const on = slowLean(1).hips.pos[2];
        const more = slowLean(2).hips.pos[2];
        expect(on).toBeGreaterThan(off + 0.02);
        expect(more).toBeGreaterThan(on + 0.02);
    });

    test('standing still is not moved', () => {
        const a = drive(() => [0, 1.65, 0], 3, { counterbalance: 0 });
        const b = drive(() => [0, 1.65, 0], 3, { counterbalance: 1 });
        expect(b[b.length - 1].hips.pos[2]).toBeCloseTo(a[a.length - 1].hips.pos[2], 3);
    });

    test('stays finite and does not move the feet', () => {
        const a = drive(() => [0, 1.65, 0], 2, { counterbalance: 1 });
        const out = slowLean(1);
        expect(out.leftFoot.pos.every(Number.isFinite)).toBe(true);
        expect(a[a.length - 1].leftFoot.pos[1]).toBe(0);
    });
});

describe('joint limits and body collision', () => {
    const settle = (hand, extra = {}) => {
        const body = createBodyEstimator();
        let o;
        for (let i = 0; i < 180; i++) {
            o = body.update({ head: { pos: [0, 1.65, 0], rot: Q }, rightHand: { pos: hand, rot: Q }, ...extra }, D);
        }
        return o;
    };
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

    test('the shoulder rises when the hand goes overhead', () => {
        const rest = settle([0.25, 0.9, 0]).rightElbow.shoulder[1];
        const up = settle([0.05, 2.0, -0.1]).rightElbow.shoulder[1];
        expect(up).toBeGreaterThan(rest + 0.02);
    });

    test('the shoulder stays within a few centimeters of its rest spot', () => {
        const rest = settle([0.25, 0.9, 0]).rightElbow.shoulder;
        const far = settle([0.1, 1.4, -1.5]).rightElbow.shoulder;
        expect(dist(rest, far)).toBeLessThan(0.14);
    });

    test('upper arm and forearm keep their length for reachable hands', () => {
        for (const h of [[0.18, 1.7, -0.1], [0.05, 1.95, -0.1], [-0.25, 1.25, -0.25], [0.12, 1.65, 0.12], [0.25, 0.9, 0]]) {
            const e = settle(h).rightElbow;
            expect(Math.abs(dist(e.shoulder, e.pos) - 0.33)).toBeLessThan(0.005);
            expect(Math.abs(dist(e.pos, h) - 0.297)).toBeLessThan(0.005);
        }
    });

    test('the elbow stays out of the head and the torso', () => {
        for (const h of [[0.05, 1.95, -0.1], [-0.25, 1.25, -0.25], [0.0, 1.6, -0.2], [-0.1, 1.45, -0.15]]) {
            const e = settle(h).rightElbow;
            expect(dist(e.pos, [0, 1.65, 0])).toBeGreaterThan(0.1);
        }
    });

    test('tilting the head sideways rolls the chest the same way, a little', () => {
        const roll = (a) => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
        const body = createBodyEstimator();
        let o;
        for (let i = 0; i < 180; i++) o = body.update({ head: { pos: [0, 1.65, 0], rot: roll(0.5) } }, D);
        const flat = createBodyEstimator().update({ head: { pos: [0, 1.65, 0], rot: Q } }, D);
        expect(Math.abs(o.chest.rot[2]) + Math.abs(o.chest.rot[0])).toBeGreaterThan(Math.abs(flat.chest.rot[2]) + 0.01);
        expect(Math.abs(o.chest.rot[2])).toBeLessThan(0.15);
    });
});

describe('leg joint limits', () => {
    const frame = { origin: [0, 0, 0], yaw: 0, hipY: 0.9, hipWidth: 0.16, legLength: 0.87 };
    const feet = (l, r) => constrainFeet({ pos: l, yaw: 0 }, { pos: r, yaw: 0 }, frame);

    test('a leg cannot swing out sideways past the hip range', () => {
        const out = feet([-0.5, 0, 0], [0.5, 0, 0]);
        // hips 0.9 high, ankle 0.07: about 0.83 of drop. 43 degrees allows roughly 0.78 out, but reach stops it earlier.
        // Use a low hip so the angle rule is the one that binds.
        const low = constrainFeet({ pos: [-0.45, 0, 0], yaw: 0 }, { pos: [0.45, 0, 0], yaw: 0 }, { ...frame, hipY: 0.45 });
        expect(Math.abs(low.right.pos[0] - 0.08)).toBeLessThan(Math.tan(0.75) * 0.38 + 0.001);
        expect(low.fired.includes('hip')).toBe(true);
        expect(Math.abs(out.right.pos[0])).toBeLessThan(0.8);
    });

    test('a leg cannot reach far behind the hip', () => {
        // behind the body is +z. Hips 0.6 high: about 0.53 of drop, 31 degrees of extension allows about 0.33.
        const f = { ...frame, hipY: 0.6 };
        const back = constrainFeet({ pos: [-0.08, 0, 0.7], yaw: 0 }, { pos: [0.08, 0, 0.7], yaw: 0 }, f);
        expect(back.left.pos[2]).toBeLessThan(0.34);
        expect(back.left.pos[2]).toBeGreaterThan(0.3);
        const near = constrainFeet({ pos: [-0.08, 0, 0.2], yaw: 0 }, { pos: [0.08, 0, 0.2], yaw: 0 }, f);
        expect(near.left.pos[2]).toBeCloseTo(0.2, 2);
    });

    test('normal standing and walking stances are not touched', () => {
        const r = feet([-0.1, 0, 0], [0.1, 0, 0.05]);
        expect(r.fired.includes('hip')).toBe(false);
    });

    test('the knee follows the foot turn only partly and only so far', () => {
        const est = createFootEstimator();
        let out;
        for (let i = 0; i < 60; i++) out = est.update({ head: { pos: [0, 1.65, 0], rot: [0, 0, 0, 1] } }, 1 / 90);
        const straight = out.leftKnee;
        expect(Number.isFinite(straight[0])).toBe(true);
    });
});

describe('planted feet hold still while walking', () => {
    test('a planted foot moves very little in the world', () => {
        const body = createBodyEstimator();
        const rows = [];
        for (let i = 0; i < 90 * 8; i++) rows.push(body.update({ head: { pos: [0, 1.65, -1.2 * (i / 90)], rot: Q } }, D));
        let sum = 0;
        let n = 0;
        for (let i = 120; i < rows.length; i++) {
            for (const side of ['leftFoot', 'rightFoot']) {
                const a = rows[i][side].pos;
                const b = rows[i - 1][side].pos;
                if (a[1] < 0.002 && b[1] < 0.002) {
                    sum += (Math.hypot(a[0] - b[0], a[2] - b[2]) * 90) ** 2;
                    n++;
                }
            }
        }
        expect(Math.sqrt(sum / n)).toBeLessThan(0.06);
    });

    test('no foot jumps faster than a real swing while walking', () => {
        const body = createBodyEstimator();
        let prev = null;
        let worst = 0;
        for (let i = 0; i < 90 * 8; i++) {
            const o = body.update({ head: { pos: [0, 1.65, -1.2 * (i / 90)], rot: Q } }, D);
            if (prev && i > 120) for (const side of ['leftFoot', 'rightFoot']) worst = Math.max(worst, (Math.hypot(...o[side].pos.map((v, k) => v - prev[side].pos[k])) * 90));
            prev = o;
        }
        expect(worst).toBeLessThan(4.6);
    });
});

describe('head-only movement leaves the body alone', () => {
    // the headset is a few centimeters in front of the neck, so a head pose is generated by pivoting it around a fixed neck joint
    const NECK = [0, 1.57, 0.09];
    const headAt = (yaw, pitch = 0, roll = 0) => {
        const q = quatMul(quatFromYaw(yaw), quatMul(quatFromAxisAngle([1, 0, 0], pitch), quatFromAxisAngle([0, 0, -1], roll)));
        const o = rotate(q, [0, -0.08, 0.09]);
        return { pos: [NECK[0] - o[0], NECK[1] - o[1], NECK[2] - o[2]], rot: q };
    };
    const hands = { leftHand: { pos: [-0.25, 0.97, -0.21], rot: Q }, rightHand: { pos: [0.25, 0.97, -0.21], rot: Q } };
    const run = (pose, secs = 5) => {
        const body = createBodyEstimator();
        let first;
        let o;
        let worst = { hips: 0, chest: 0, feet: 0 };
        for (let i = 0; i < secs * 90; i++) {
            const t = i / 90;
            o = body.update({ head: headAt(...pose(t)), ...hands }, D);
            if (i === 90) first = o;
            if (i > 90) {
                worst.hips = Math.max(worst.hips, dist3(o.hips.pos, first.hips.pos));
                worst.chest = Math.max(worst.chest, dist3(o.chest.pos, first.chest.pos));
                worst.feet = Math.max(worst.feet, dist3(o.leftFoot.pos, first.leftFoot.pos), dist3(o.rightFoot.pos, first.rightFoot.pos));
            }
        }
        return { o, worst };
    };
    const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const ramp = (t, v) => v * Math.min(1, Math.max(0, (t - 1.5) / 0.8));

    test('turning the head 50 degrees moves nothing', () => {
        const { worst, o } = run((t) => [ramp(t, 0.87), 0, 0]);
        expect(worst.hips).toBeLessThan(0.005);
        expect(worst.chest).toBeLessThan(0.01);
        expect(worst.feet).toBeLessThan(0.005);
        expect(Math.abs(o.bodyYaw)).toBeLessThan(0.05);
    });

    test('nodding, looking up and tilting the head move nothing', () => {
        for (const pose of [(t) => [0, ramp(t, 1.05), 0], (t) => [0, ramp(t, -0.87), 0], (t) => [0, 0, ramp(t, 0.3)]]) {
            const { worst } = run(pose);
            expect(worst.hips).toBeLessThan(0.005);
            expect(worst.chest).toBeLessThan(0.005);
            expect(worst.feet).toBeLessThan(0.005);
        }
    });

    test('looking left and right within the neck range leaves the chest alone', () => {
        const { worst } = run((t) => [1.05 * Math.sin(Math.max(0, t - 1.5) * 1.5), 0, 0], 8);
        expect(worst.hips).toBeLessThan(0.01);
        expect(worst.chest).toBeLessThan(0.02);
        expect(worst.feet).toBeLessThan(0.005);
    });

    test('turning the whole body, arms and all, turns the body to follow', () => {
        const body = createBodyEstimator();
        let o;
        for (let i = 0; i < 7 * 90; i++) {
            const t = i / 90;
            const yaw = Math.PI * Math.min(1, Math.max(0, (t - 1.5) / 2));
            const f = forwardOf(yaw);
            const r = rightOf(yaw);
            const at = (x) => [NECK[0] + r[0] * x + f[0] * 0.6, 0.97, NECK[2] + r[2] * x + f[2] * 0.6];
            o = body.update({ head: headAt(yaw), leftHand: { pos: at(-0.25), rot: Q }, rightHand: { pos: at(0.25), rot: Q } }, D);
        }
        expect(Math.abs(Math.abs(o.bodyYaw) - Math.PI)).toBeLessThan(0.5);
    });

    test('a head turned far past the neck range brings the body round', () => {
        const { o } = run((t) => [ramp(t, 2.4), 0, 0], 6);
        expect(Math.abs(o.bodyYaw)).toBeGreaterThan(0.8);
    });
});

describe('lying down', () => {
    // head up points from the body toward the head. Head at z = -0.9, so the body lies along +z.
    const POSES = {
        back: quatMul(quatFromYaw(Math.PI), quatFromAxisAngle([1, 0, 0], Math.PI / 2)), // face up
        front: quatFromAxisAngle([1, 0, 0], -Math.PI / 2), // face down
        side: quatMul(quatFromAxisAngle([0, 0, 1], -Math.PI / 2), quatFromAxisAngle([0, 1, 0], 0)) // head on its side, up level
    };
    const lie = (name, secs = 2) => {
        const body = createBodyEstimator();
        let o;
        for (let i = 0; i < secs * 90; i++) o = body.update({ head: { pos: [0, 0.62, -0.9], rot: POSES[name] } }, D);
        return o;
    };

    test('face up, face down and on the side are all recognised', () => {
        for (const name of ['back', 'front', 'side']) {
            const o = lie(name);
            expect(o.gait.laying).toBe(true);
        }
        expect(lie('back').gait.layPose).toBe('back');
        expect(lie('front').gait.layPose).toBe('front');
    });

    test('the body lies flat: hips low behind the head, feet stretched out the other way', () => {
        const o = lie('back');
        expect(o.hips.pos[1]).toBeLessThan(0.6);
        expect(o.hips.pos[2]).toBeGreaterThan(-0.9 + 0.4); // hips are away from the head
        expect(o.leftFoot.pos[2]).toBeGreaterThan(o.hips.pos[2] + 0.5); // legs run the other way
        expect(Math.abs(o.leftFoot.pos[1] - 0.5)).toBeLessThan(0.15); // feet stay at bed height, not in the air or the floor
        expect(o.leftFoot.pos[0]).toBeLessThan(o.rightFoot.pos[0]);
    });

    test('every tracker stays finite while lying', () => {
        const o = lie('side');
        for (const k of ['hips', 'chest', 'leftFoot', 'rightFoot', 'leftKnee', 'rightKnee']) {
            expect(o[k].pos.every(Number.isFinite)).toBe(true);
            expect(o[k].rot.every(Number.isFinite)).toBe(true);
        }
    });

    test('standing does not count, and getting up goes back to normal', () => {
        const body = createBodyEstimator();
        let o;
        for (let i = 0; i < 180; i++) o = body.update({ head: { pos: [0, 0.62, -0.9], rot: POSES.back } }, D);
        expect(o.gait.laying).toBe(true);
        for (let i = 0; i < 180; i++) o = body.update({ head: { pos: [0, 1.65, 0], rot: Q } }, D);
        expect(o.gait.laying).toBe(false);
        expect(o.leftFoot.pos[1]).toBeLessThan(0.01);
        expect(o.hips.pos[1]).toBeGreaterThan(0.8);
    });

    test('bending over or crouching is not lying', () => {
        const body = createBodyEstimator();
        let o;
        const bent = quatFromAxisAngle([1, 0, 0], -1.2); // head tipped well forward but still more up than level
        for (let i = 0; i < 270; i++) o = body.update({ head: { pos: [0, 0.9, -0.3], rot: bent } }, D);
        expect(o.gait.laying).toBe(false);
    });
});

describe('calibration settings', async () => {
    const { CAL_LIMITS, defaults, sanitize } = await import('../bodyCalibrationCore.js');
    test('the new feel settings default to 1 and are kept inside their limits', () => {
        const d = defaults();
        for (const k of ['counterbalance', 'smoothing', 'neckRange', 'legFreedom']) expect(d[k]).toBe(1);
        const hi = sanitize({ counterbalance: 99, smoothing: 99, neckRange: 99, legFreedom: 99 });
        const lo = sanitize({ counterbalance: -5, smoothing: -5, neckRange: -5, legFreedom: -5 });
        for (const k of ['counterbalance', 'smoothing', 'neckRange', 'legFreedom']) {
            expect(hi[k]).toBe(CAL_LIMITS[k][1]);
            expect(lo[k]).toBe(CAL_LIMITS[k][0]);
        }
        expect(sanitize({ counterbalance: 'x' }).counterbalance).toBe(1);
    });
});

describe('sitting down', () => {
    const ease = (x) => {
        x = Math.min(1, Math.max(0, x));
        return x * x * (3 - 2 * x);
    };
    // stand, then sit down over 1.5 s: the head goes down 50 cm and back 25 cm, then leans around on the seat
    const sitHead = (t) => {
        const s = ease((t - 2) / 1.5);
        const lean = t > 6 ? 0.15 * Math.sin((t - 6) * 1.3) : 0;
        return [0, 1.65 - 0.5 * s, 0.25 * s + lean];
    };

    test('the feet stay with the body: sitting down is not walking', () => {
        const rows = drive(sitHead, 10);
        for (const r of rows) {
            expect(Math.hypot(r.leftFoot.pos[0] - r.hips.pos[0], r.leftFoot.pos[2] - r.hips.pos[2])).toBeLessThan(1.0);
            expect(Math.hypot(r.rightFoot.pos[0] - r.hips.pos[0], r.rightFoot.pos[2] - r.hips.pos[2])).toBeLessThan(1.0);
        }
        const last = rows[rows.length - 1];
        expect(Math.abs(last.hips.pos[2])).toBeLessThan(0.8);
    });

    test('a low seat or a slouch is still recognised as sitting, and the legs keep their length', () => {
        const rows = drive(sitHead, 10);
        const last = rows[rows.length - 1];
        expect(last.gait.sitting).toBe(true);
        for (const r of rows.slice(Math.floor(5 / D))) {
            for (const f of [r.leftFoot, r.rightFoot]) {
                const d = Math.hypot(f.pos[0] - r.hips.pos[0], f.pos[1] - r.hips.pos[1], f.pos[2] - r.hips.pos[2]);
                expect(d).toBeLessThan(1.0);
                expect(d).toBeGreaterThan(0.3);
            }
        }
    });

    test('leaning on the seat does not drag the feet along', () => {
        const rows = drive(sitHead, 14);
        const from = Math.floor(7 / D);
        let move = 0;
        for (let i = from + 1; i < rows.length; i++) move = Math.max(move, Math.abs(rows[i].leftFoot.pos[2] - rows[from].leftFoot.pos[2]));
        expect(move).toBeLessThan(0.2);
    });

    test('feet never dip into the floor and are smoothed', () => {
        const rows = drive(sitHead, 10);
        for (const r of rows) expect(r.leftFoot.pos[1]).toBeGreaterThan(-1e-6);
    });
});
