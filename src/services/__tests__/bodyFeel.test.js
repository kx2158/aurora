import { describe, expect, test } from 'vitest';

import { createBodyEstimator } from '../bodyEstimator.js';
import { createInertia, springDecay } from '../bodyInertia.js';
import { quatFromAxisAngle, quatFromYaw, quatMul } from '../footEstimator.js';

const D = 1 / 90;
const Q = [0, 0, 0, 1];
const ease = (x) => {
    x = Math.min(1, Math.max(0, x));
    return x * x * (3 - 2 * x);
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const JOINTS = ['hips', 'chest', 'leftFoot', 'rightFoot', 'leftKnee', 'rightKnee', 'leftElbow', 'rightElbow'];
const hands = (h) => ({
    leftHand: { pos: [h[0] - 0.25, h[1] - 0.6, h[2] - 0.1], rot: Q },
    rightHand: { pos: [h[0] + 0.25, h[1] - 0.6, h[2] - 0.1], rot: Q }
});

/** Runs a scenario and returns every frame plus the fastest any joint moved (m/s) after the first half second. */
function drive(seconds, inputAt) {
    const body = createBodyEstimator();
    const rows = [];
    let worst = 0;
    for (let i = 0; i < seconds / D; i++) {
        const r = body.update(inputAt(i * D), D);
        const prev = rows[rows.length - 1];
        if (prev && i * D > 0.5) for (const j of JOINTS) if (r[j] && prev[j]) worst = Math.max(worst, len(sub(r[j].pos, prev[j].pos)) / D);
        rows.push(r);
    }
    return { rows, worst };
}

describe('springs on the skeleton', () => {
    test('a critically damped spring settles without overshooting', () => {
        let x = 1;
        let v = 0;
        let min = 1;
        for (let i = 0; i < 200; i++) {
            [x, v] = springDecay(x, v, 0.15, D);
            min = Math.min(min, x);
        }
        expect(min).toBeGreaterThanOrEqual(-1e-6);
        expect(Math.abs(x)).toBeLessThan(0.01);
    });

    test('a mode switch blends from the old pose instead of snapping', () => {
        const inertia = createInertia();
        const a = { hips: { pos: [0, 1, 0], rot: Q } };
        const b = { hips: { pos: [0.5, 1, 0], rot: quatFromYaw(1) } };
        inertia.apply(a, 'stand', D, ['hips']);
        const first = inertia.apply(b, 'sit', D, ['hips']);
        expect(first.hips.pos[0]).toBeLessThan(0.05);
        let out = first;
        for (let i = 0; i < 90; i++) out = inertia.apply(b, 'sit', D, ['hips']);
        expect(Math.abs(out.hips.pos[0] - 0.5)).toBeLessThan(0.01);
    });

    test('steady motion is not delayed', () => {
        const inertia = createInertia();
        let out;
        for (let i = 0; i < 90; i++) out = inertia.apply({ foot: { pos: [i * D * 3, 0, 0], rot: Q } }, 'walk', D, ['foot']);
        expect(Math.abs(out.foot.pos[0] - 89 * D * 3)).toBeLessThan(1e-4);
    });
});

describe('standing stays standing', () => {
    test('swaying and leaning in place never moves the feet', () => {
        const { rows } = drive(12, (t) => {
            const h = [0.12 * Math.sin(t * 0.9) + 0.04 * Math.sin(t * 2.3), 1.65 - 0.03 * (1 - Math.cos(t * 0.7)), 0.1 * Math.sin(t * 0.6 + 1)];
            return { head: { pos: h, rot: quatMul(quatFromYaw(0.6 * Math.sin(t * 0.5)), quatFromAxisAngle([1, 0, 0], 0.25 * Math.sin(t * 0.8))) }, ...hands(h) };
        });
        let travel = 0;
        for (let i = 91; i < rows.length; i++) travel += len(sub(rows[i].leftFoot.pos, rows[i - 1].leftFoot.pos)) + len(sub(rows[i].rightFoot.pos, rows[i - 1].rightFoot.pos));
        expect(travel).toBeLessThan(0.05);
        expect(rows.every((r) => !r.gait.walking)).toBe(true);
    });

    test('really walking away still walks', () => {
        const { rows } = drive(4, (t) => {
            const h = [0, 1.65, -1.2 * Math.max(0, t - 1)];
            return { head: { pos: h, rot: Q }, ...hands(h) };
        });
        expect(rows.some((r) => r.gait.walking)).toBe(true);
    });
});

describe('crouching and sitting', () => {
    test('going low keeps the feet planted, knees forward, and ends up sitting', () => {
        let footBack = 0;
        let kneeBehind = 0;
        const start = {};
        const { rows } = drive(9, (t) => {
            const h = [0, 1.65 - 0.8 * ease((t - 1) / 3), 0.05 * ease((t - 1) / 3)];
            return { head: { pos: h, rot: quatFromAxisAngle([1, 0, 0], -0.25 * ease((t - 1) / 3)) }, ...hands(h) };
        });
        rows.forEach((r, i) => {
            if (i * D < 0.9) {
                start.l = r.leftFoot.pos[2];
                start.r = r.rightFoot.pos[2];
                return;
            }
            footBack = Math.max(footBack, r.leftFoot.pos[2] - start.l, r.rightFoot.pos[2] - start.r);
            for (const [k, f] of [
                [r.leftKnee, r.leftFoot],
                [r.rightKnee, r.rightFoot]
            ])
                kneeBehind = Math.max(kneeBehind, k.pos[2] - (r.hips.pos[2] + f.pos[2]) / 2);
        });
        expect(footBack).toBeLessThan(0.02);
        expect(kneeBehind).toBeLessThan(0.02);
        expect(rows[rows.length - 1].gait.sitting).toBe(true);
    });

    test('sitting on the floor puts the legs out in front', () => {
        const { rows } = drive(8, (t) => {
            const h = [0, 1.65 - 1.0 * ease((t - 1) / 2.5), 0.1 * ease((t - 1) / 2.5)];
            return { head: { pos: h, rot: Q }, ...hands(h) };
        });
        const r = rows[rows.length - 1];
        expect(r.gait.sitting).toBe(true);
        const reach = (r.hips.pos[2] - r.leftFoot.pos[2] + r.hips.pos[2] - r.rightFoot.pos[2]) / 2;
        expect(reach).toBeGreaterThan(0.55);
    });
});

describe('lying down', () => {
    test('lying on a bed is recognised and getting up again blends smoothly', () => {
        const { rows, worst } = drive(12, (t) => {
            const down = ease((t - 1) / 2) - ease((t - 8) / 2);
            const h = [0, 1.65 - 0.9 * down, 0.5 * down];
            return { head: { pos: h, rot: quatFromAxisAngle([1, 0, 0], 1.5 * down) }, ...hands(h) };
        });
        expect(rows[Math.round(6 / D)].gait.laying).toBe(true);
        expect(rows[rows.length - 1].gait.laying).toBe(false);
        expect(worst).toBeLessThan(10);
    });
});

describe('arms', () => {
    test('elbows stay out of the head with the hands over and around it', () => {
        let closest = 9;
        drive(10, (t) => {
            const a = t * 1.3;
            const k = ease((t - 1) / 1);
            const lift = 0.15 + 0.25 * Math.sin(a * 0.7);
            const L = [-0.25 + k * (0.13 + 0.18 * Math.cos(a)), 1.05 + k * (0.65 + lift * 1), -0.1 + k * (0.05 + 0.15 * Math.sin(a))];
            const R = [0.25 - k * (0.13 + 0.18 * Math.cos(a * 1.1)), 1.05 + k * (0.65 + lift), -0.1 + k * (0.05 + 0.15 * Math.cos(a))];
            const tw = quatFromAxisAngle([0, 0, 1], 1.4 * Math.sin(t * 2));
            return { head: { pos: [0, 1.65, 0], rot: Q }, leftHand: { pos: L, rot: tw }, rightHand: { pos: R, rot: tw } };
        }).rows.forEach((r, i) => {
            if (i * D < 2) return;
            const c = [0, 1.61, 0.08]; // the head's centre, behind the headset
            for (const e of [r.leftElbow, r.rightElbow])
                for (const s of [0.5, 0.75, 1]) closest = Math.min(closest, len(sub(e.shoulder.map((v, a) => v + (e.pos[a] - v) * s), c)));
        });
        expect(closest).toBeGreaterThan(0.12);
    });
});
