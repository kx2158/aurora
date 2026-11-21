import { describe, expect, it } from 'vitest';

import { createBodyEstimator } from '../bodyEstimator.js';
import { createInputGuard, createTrackerStabilizer } from '../trackerStabilizer.js';

const Q = [0, 0, 0, 1];
const pose = (x, y, z, rot = Q) => ({ pos: [x, y, z], rot });
const frame = (hips, extra = {}) => ({ hips, chest: pose(0, 1.2, 0), leftFoot: null, rightFoot: null, leftKnee: null, rightKnee: null, leftElbow: null, rightElbow: null, ...extra });
const dt = 1 / 90;

describe('output stabilizer', () => {
    it('holds the last good pose when numbers go bad', () => {
        const s = createTrackerStabilizer();
        s.apply(frame(pose(0, 1, 0)), dt);
        const out = s.apply(frame(pose(NaN, 1, 0)), dt);
        expect(out.hips.pos[0]).toBe(0);
        const out2 = s.apply(frame({ pos: [0, 1, 0], rot: [0, 0, 0, 0] }), dt);
        expect(out2.hips.pos[1]).toBe(1);
    });
    it('swallows sub-millimeter noise at rest', () => {
        const s = createTrackerStabilizer();
        let last = null;
        let moved = 0;
        for (let i = 0; i < 400; i++) {
            const n = Math.sin(i * 12.9898) * 0.0004;
            const out = s.apply(frame(pose(n, 1 + n, -n)), dt);
            if (last && (out.hips.pos[0] !== last[0] || out.hips.pos[1] !== last[1])) moved++;
            last = out.hips.pos;
        }
        expect(moved).toBe(0);
    });
    it('follows real motion with no more lag than the dead zone', () => {
        const s = createTrackerStabilizer();
        let out;
        for (let i = 0; i < 90; i++) out = s.apply(frame(pose(i * 0.003, 1, 0)), dt);
        const target = 89 * 0.003;
        expect(target - out.hips.pos[0]).toBeLessThan(0.0016);
        expect(target - out.hips.pos[0]).toBeGreaterThan(-1e-9);
    });
    it('never moves faster than a body part can', () => {
        const s = createTrackerStabilizer();
        s.apply(frame(pose(0, 1, 0)), dt);
        const out = s.apply(frame(pose(0.9, 1, 0)), dt); // a one frame spike of 0.9 m
        expect(out.hips.pos[0]).toBeLessThan(5 * dt + 1e-9);
    });
    it('takes a teleport at once', () => {
        const s = createTrackerStabilizer();
        s.apply(frame(pose(0, 1, 0)), dt);
        expect(s.apply(frame(pose(10, 1, 0)), dt).hips.pos[0]).toBe(10);
    });
    it('keeps quaternions on one side of the sphere', () => {
        const s = createTrackerStabilizer();
        const a = [0, 0.3827, 0, 0.9239];
        s.apply(frame(pose(0, 1, 0, a)), dt);
        const out = s.apply(frame(pose(0, 1, 0, a.map((v) => -v))), dt);
        expect(out.hips.rot[3]).toBeGreaterThan(0);
    });
    it('passes missing trackers through as null and forgets them', () => {
        const s = createTrackerStabilizer();
        s.apply(frame(pose(0, 1, 0)), dt);
        expect(s.apply(frame(null), dt).hips).toBeNull();
        expect(s.apply(frame(pose(3, 1, 0)), dt).hips.pos[0]).toBe(3);
    });
});

describe('input guard', () => {
    it('drops a one frame tracking spike', () => {
        const g = createInputGuard();
        g.clean('hand', pose(0, 1, 0), dt);
        expect(g.clean('hand', pose(3, 1, 0), dt).pose.pos[0]).toBe(0);
        expect(g.clean('hand', pose(0.01, 1, 0), dt).pose.pos[0]).toBe(0.01);
    });
    it('accepts a real teleport after a few frames', () => {
        const g = createInputGuard();
        g.clean('head', pose(0, 1.6, 0), dt);
        let r;
        for (let i = 0; i < 3; i++) r = g.clean('head', pose(8, 1.6, 0), dt);
        expect(r.pose.pos[0]).toBe(8);
        expect(r.jumped).toBe(true);
    });
    it('holds on NaN and fixes the quaternion side', () => {
        const g = createInputGuard();
        const a = [0, 0.3827, 0, 0.9239];
        g.clean('hand', pose(0, 1, 0, a), dt);
        expect(g.clean('hand', pose(NaN, 1, 0, a), dt).pose.pos[0]).toBe(0);
        expect(g.clean('hand', pose(0, 1, 0, a.map((v) => -v)), dt).pose.rot[3]).toBeGreaterThan(0);
    });
});

describe('estimator with the guards', () => {
    const input = (x) => ({ head: pose(x, 1.65, 0), leftHand: pose(x - 0.3, 1.2, -0.3), rightHand: pose(x + 0.3, 1.2, -0.3) });
    it('a one frame glitch in a hand does not move the body', () => {
        const a = createBodyEstimator();
        const b = createBodyEstimator();
        let oa, ob;
        for (let i = 0; i < 120; i++) {
            oa = a.update(input(0), dt);
            const inp = input(0);
            if (i === 100) inp.leftHand = pose(4, 3, 4);
            ob = b.update(inp, dt);
        }
        expect(Math.abs(oa.hips.pos[0] - ob.hips.pos[0])).toBeLessThan(1e-6);
        expect(Math.abs(oa.leftElbow.pos[0] - ob.leftElbow.pos[0])).toBeLessThan(1e-6);
    });
    it('never outputs NaN', () => {
        const e = createBodyEstimator();
        for (let i = 0; i < 60; i++) e.update(input(0), dt);
        const bad = input(0);
        bad.head = pose(NaN, NaN, NaN);
        const out = e.update(bad, dt);
        for (const k of ['hips', 'chest', 'leftFoot', 'rightFoot', 'leftKnee', 'rightKnee']) expect(Number.isFinite(out[k].pos[0] + out[k].pos[1] + out[k].pos[2])).toBe(true);
    });
});

describe('elbow never pops', () => {
    it('hands behind a turning body: the elbow turns at a limited speed, no jump to the other side', () => {
        const e = createBodyEstimator();
        let prev = null;
        let worst = 0;
        let t = 0;
        for (let i = 0; i < 3600; i++) {
            t += 1 / 60;
            const a = (t * 1.1) / 1.6;
            const hx = Math.cos(a) * 1.6;
            const hz = Math.sin(a) * 1.6;
            const yaw = Math.PI - a;
            const rot = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
            const o = e.update({ head: pose(hx, 1.65, hz, rot), leftHand: pose(hx - 0.28, 1.1, hz - 0.3, rot), rightHand: pose(hx + 0.28, 1.1, hz - 0.3, rot) }, 1 / 60);
            const rel = o.rightElbow.pos.map((v, j) => v - o.rightElbow.shoulder[j]);
            if (prev && i > 60) worst = Math.max(worst, Math.hypot(...rel.map((v, j) => v - prev[j])));
            prev = rel;
        }
        expect(worst).toBeLessThan(0.07);
    });
});

describe('Quest body hint', () => {
    const yawQ = (a) => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
    it('lines the headset joints up with the SteamVR head, whatever the yaw between the spaces', async () => {
        const { buildXrHint } = await import('../bodyXrCore.js');
        const make = (yaw) => {
            // the same real elbow (0.1 right, 0.3 down, 0.05 back of the shoulder), seen from a space turned by yaw
            const rot = (v) => {
                const c = Math.cos(yaw);
                const s = Math.sin(yaw);
                return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
            };
            const sh = rot([0.2, 1.4, 0]);
            const el = rot([0.3, 1.1, 0.05]);
            return { state: 5, ageMs: 10, confidence: 1, view: [0, 1.6, 0, ...yawQ(yaw)], joints: { rightShoulder: [...sh, 0, 0, 0, 1], rightElbow: [...el, 0, 0, 0, 1] } };
        };
        const a = buildXrHint(make(0), { rot: yawQ(0) }).rightElbow;
        const b = buildXrHint(make(1.2), { rot: yawQ(0) }).rightElbow;
        for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(1e-5);
    });
    it('ignores old or missing data', async () => {
        const { buildXrHint } = await import('../bodyXrCore.js');
        expect(buildXrHint(null, { rot: [0, 0, 0, 1] })).toBeNull();
        expect(buildXrHint({ state: 4 }, { rot: [0, 0, 0, 1] })).toBeNull();
        expect(buildXrHint({ state: 5, ageMs: 9999, view: [0, 0, 0, 0, 0, 0, 1], joints: {} }, { rot: [0, 0, 0, 1] })).toBeNull();
    });
    it('pulls the elbow toward the real one, and stays at arm length', () => {
        const e = createBodyEstimator();
        const hands = { head: pose(0, 1.65, 0), leftHand: pose(-0.2, 1.3, -0.5), rightHand: pose(0.2, 1.3, -0.5) };
        let plain;
        let hinted;
        const e2 = createBodyEstimator();
        for (let i = 0; i < 120; i++) {
            plain = e.update(hands, dt);
            hinted = e2.update({ ...hands, xr: { rightElbow: [0.3, 0.0, 0.0], leftElbow: [-0.3, 0.0, 0], weight: 0.8 } }, dt);
        }
        // the hint says the elbows point straight out to the sides, so they end up further out than without it
        expect(hinted.rightElbow.pos[0]).toBeGreaterThan(plain.rightElbow.pos[0] + 0.01);
        const d = Math.hypot(...hinted.rightElbow.pos.map((v, i) => v - hinted.rightElbow.shoulder[i]));
        expect(Math.abs(d - e2.arm.upper)).toBeLessThan(1e-4);
    });
});
