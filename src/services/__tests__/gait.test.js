import {
    createFootEstimator,
    forwardOf,
    gaitFoot,
    gaitParams,
    gaitPitch,
    quatFromYaw,
    rightOf
} from '../footEstimator.js';
import { createBodyEstimator } from '../bodyEstimator.js';

const EYE = 1.65;
const HZ = 90;
const dt = 1 / HZ;

/**
 * Runs the estimator for `seconds`. mode 'real' moves the head through the room, 'virtual' keeps the head
 * still and feeds the speed in as virtualVelocity (thumbstick walking). Returns a frame list.
 */
function simulate({ seconds, speed = 1.2, mode = 'real', yaw = 0, dir = [0, 1], stopAt = Infinity, options = {} }) {
    const est = createFootEstimator({ eyeHeight: EYE, ...options });
    const fwd = forwardOf(yaw);
    const rgt = rightOf(yaw);
    const frames = [];
    let x = 0;
    let z = 0;
    for (let i = 0; i < seconds * HZ; i++) {
        const time = i * dt;
        const v = time < stopAt ? speed : 0;
        const vel = [rgt[0] * dir[0] * v + fwd[0] * dir[1] * v, rgt[2] * dir[0] * v + fwd[2] * dir[1] * v];
        if (mode === 'real') {
            x += vel[0] * dt;
            z += vel[1 - 1 + 1] === undefined ? 0 : vel[1] * dt;
        }
        const out = est.update(
            {
                head: { pos: [x, EYE, z], rot: quatFromYaw(yaw) },
                virtualVelocity: mode === 'virtual' ? [dir[0] * v, dir[1] * v] : undefined
            },
            dt
        );
        frames.push({ time, out });
    }
    return frames;
}
// mode real needs the head to move in the world frame; the helper above moves along (vel[0], vel[1]) = (x, z)
// where vel is already a world vector, so fix the z handling here for clarity
function simulateReal(args) {
    const est = createFootEstimator({ eyeHeight: EYE, ...(args.options || {}) });
    const { seconds, speed = 1.2, yaw = 0, dir = [0, 1], stopAt = Infinity } = args;
    const fwd = forwardOf(yaw);
    const rgt = rightOf(yaw);
    const frames = [];
    let x = 0;
    let z = 0;
    for (let i = 0; i < seconds * HZ; i++) {
        const time = i * dt;
        const v = time < stopAt ? speed : 0;
        x += (rgt[0] * dir[0] + fwd[0] * dir[1]) * v * dt;
        z += (rgt[2] * dir[0] + fwd[2] * dir[1]) * v * dt;
        frames.push({ time, out: est.update({ head: { pos: [x, EYE, z], rot: quatFromYaw(yaw) } }, dt) });
    }
    return frames;
}

const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

describe('gait curves', () => {
    test('stance moves back at exactly walking speed, so a planted foot stands still in the world', () => {
        const L = 0.6;
        const rate = 1.0; // cycles per second
        const speed = 2 * L * rate; // stepLength * stepRate with stepRate = 2 * cycleRate
        const h = 1e-5;
        for (const theta of [0.05, 0.2, 0.4, 0.55]) {
            const v = (gaitFoot(theta + h, L, 0.09).along - gaitFoot(theta - h, L, 0.09).along) / (2 * h) * rate;
            expect(v).toBeCloseTo(-speed, 4);
        }
    });

    test('the stride is continuous and its speed is continuous where the foot leaves and meets the floor', () => {
        const L = 0.6;
        const a = gaitFoot(0.6 - 1e-9, L, 0.09);
        const b = gaitFoot(0.6 + 1e-9, L, 0.09);
        expect(a.along).toBeCloseTo(b.along, 6);
        const end = gaitFoot(1 - 1e-9, L, 0.09);
        const start = gaitFoot(1e-9, L, 0.09);
        expect(end.along).toBeCloseTo(start.along, 6);
        const h = 1e-6;
        const vSwingStart = (gaitFoot(0.6 + 2 * h, L, 0.09).along - gaitFoot(0.6 + h, L, 0.09).along) / h;
        const vStance = (gaitFoot(0.6 - h, L, 0.09).along - gaitFoot(0.6 - 2 * h, L, 0.09).along) / h;
        expect(vSwingStart).toBeCloseTo(vStance, 2);
    });

    test('the foot lifts only while swinging and clears the floor', () => {
        expect(gaitFoot(0.3, 0.6, 0.09).y).toBe(0);
        expect(gaitFoot(0.8, 0.6, 0.09).y).toBeGreaterThan(0.07);
        for (let t = 0; t < 1; t += 0.01) expect(gaitFoot(t, 0.6, 0.09).y).toBeGreaterThanOrEqual(0);
    });

    test('heel strike is toes up, mid stance is flat, toe-off is heel up', () => {
        expect(gaitPitch(0)).toBeGreaterThan(0.25);
        expect(gaitPitch(0.2)).toBe(0);
        expect(gaitPitch(0.6)).toBeLessThan(-0.5);
        expect(gaitPitch(0.9999)).toBeGreaterThan(0.25);
    });

    test('step length times step rate is the speed, and short legs get a faster cadence', () => {
        for (const s of [0.3, 0.8, 1.2, 1.6]) {
            const g = gaitParams(s, 10);
            expect(g.stepLength * (g.cycleRate * 2)).toBeCloseTo(s, 9);
        }
        const free = gaitParams(1.4, 10);
        const short = gaitParams(1.4, 0.25);
        expect(short.stepLength).toBeLessThan(free.stepLength);
        expect(short.cycleRate).toBeGreaterThan(free.cycleRate);
        expect(short.stepLength * short.cycleRate * 2).toBeCloseTo(1.4, 9);
    });
});

describe('walking', () => {
    const settle = 1.2; // seconds to skip while the walk starts

    test('real walking: planted feet do not slide in the world', () => {
        const frames = simulateReal({ seconds: 8, speed: 1.2 });
        let worst = 0;
        let planted = 0;
        for (let i = 1; i < frames.length; i++) {
            if (frames[i].time < settle) continue;
            for (const side of ['left', 'right']) {
                const a = frames[i - 1].out[side];
                const b = frames[i].out[side];
                if (a.pos[1] < 0.0004 && b.pos[1] < 0.0004) {
                    planted++;
                    worst = Math.max(worst, dist2(a.pos, b.pos) / dt);
                }
            }
        }
        expect(planted).toBeGreaterThan(400);
        expect(worst).toBeLessThan(0.05); // m/s of slide while on the floor
    });

    test('cadence and step length look like a human walk', () => {
        const frames = simulateReal({ seconds: 10, speed: 1.2 });
        // count heel strikes: a foot going from airborne to on the floor
        let strikes = 0;
        const lastStrike = {};
        const lengths = [];
        let prevStrikePos = null;
        for (let i = 1; i < frames.length; i++) {
            if (frames[i].time < settle) continue;
            for (const side of ['left', 'right']) {
                const a = frames[i - 1].out[side].pos[1];
                const b = frames[i].out[side].pos[1];
                if (a > 0.004 && b <= 0.004) {
                    strikes++;
                    lastStrike[side] = frames[i].out[side].pos;
                    if (prevStrikePos) lengths.push(dist2(prevStrikePos, frames[i].out[side].pos));
                    prevStrikePos = frames[i].out[side].pos;
                }
            }
        }
        const seconds = frames[frames.length - 1].time - settle;
        const cadence = (strikes / seconds) * 60; // steps per minute
        expect(cadence).toBeGreaterThan(95);
        expect(cadence).toBeLessThan(135);
        const mean = lengths.reduce((s, v) => s + v, 0) / lengths.length;
        expect(mean).toBeGreaterThan(0.45);
        expect(mean).toBeLessThan(0.8);
    });

    test('there is always a foot on the floor and the feet take turns', () => {
        const frames = simulateReal({ seconds: 8, speed: 1.2 });
        let leftAir = 0;
        let rightAir = 0;
        for (const { time, out } of frames) {
            if (time < settle) continue;
            const la = out.left.pos[1] > 0.01;
            const ra = out.right.pos[1] > 0.01;
            expect(la && ra).toBe(false);
            if (la) leftAir++;
            if (ra) rightAir++;
        }
        expect(Math.abs(leftAir - rightAir) / Math.max(leftAir, rightAir)).toBeLessThan(0.1);
        expect(leftAir).toBeGreaterThan(100);
    });

    test('the leading foot is ahead when it lands and behind when it leaves', () => {
        const frames = simulateReal({ seconds: 6, speed: 1.2 });
        let ahead = 0;
        let strikes = 0;
        for (let i = 1; i < frames.length; i++) {
            if (frames[i].time < settle) continue;
            const a = frames[i - 1].out.left.pos[1];
            const b = frames[i].out.left.pos[1];
            if (a > 0.004 && b <= 0.004) {
                strikes++;
                const f = forwardOf(frames[i].out.bodyYaw);
                const d = [frames[i].out.left.pos[0] - frames[i].out.hipsGround[0], 0, frames[i].out.left.pos[2] - frames[i].out.hipsGround[2]];
                if (d[0] * f[0] + d[2] * f[2] > 0.2) ahead++;
            }
        }
        expect(strikes).toBeGreaterThan(3);
        expect(ahead).toBe(strikes);
    });

    test('thumbstick walking: the head stays put and the legs still walk', () => {
        const frames = simulate({ seconds: 8, speed: 1.2, mode: 'virtual' });
        let walking = 0;
        let maxLeft = 0;
        for (const { time, out } of frames) {
            if (time < settle) continue;
            if (out.gait.walking) walking++;
            maxLeft = Math.max(maxLeft, out.left.pos[1]);
            expect(out.hips.pos[0]).toBeCloseTo(0, 1); // head did not move, hips only sway a little
        }
        expect(walking / (frames.length - settle * HZ)).toBeGreaterThan(0.99);
        expect(maxLeft).toBeGreaterThan(0.06);
    });

    test('walking backward and sideways keeps the feet ordered, apart and in reach', () => {
        for (const dir of [[0, -1], [1, 0], [-1, 0], [0.7, 0.7]]) {
            const frames = simulate({ seconds: 6, speed: 0.9, mode: 'virtual', dir, yaw: 0.8 });
            for (const { out } of frames) {
                const r = rightOf(out.bodyYaw);
                const lu = (out.left.pos[0] - out.hipsGround[0]) * r[0] + (out.left.pos[2] - out.hipsGround[2]) * r[2];
                const ru = (out.right.pos[0] - out.hipsGround[0]) * r[0] + (out.right.pos[2] - out.hipsGround[2]) * r[2];
                expect(ru).toBeGreaterThanOrEqual(lu - 1e-6);
                expect(out.left.pos[1]).toBeGreaterThanOrEqual(0);
                for (const v of [...out.leftKnee, ...out.rightKnee]) expect(Number.isFinite(v)).toBe(true);
            }
        }
    });

    test('no foot ever jumps farther than a real swing in one frame', () => {
        for (const mode of ['real', 'virtual']) {
            const frames = mode === 'real' ? simulateReal({ seconds: 10, speed: 1.4, stopAt: 6 }) : simulate({ seconds: 10, speed: 1.4, mode, stopAt: 6 });
            let worst = 0;
            for (let i = 1; i < frames.length; i++) {
                for (const side of ['left', 'right']) {
                    const a = frames[i - 1].out[side].pos;
                    const b = frames[i].out[side].pos;
                    worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
                }
            }
            expect(worst).toBeLessThan(0.07); // 6 m/s at 90 Hz
        }
    });

    test('stopping: the feet come to rest together, level, and stay still', () => {
        const frames = simulate({ seconds: 8, speed: 1.2, mode: 'virtual', stopAt: 4 });
        const end = frames[frames.length - 1].out;
        expect(end.gait.walking).toBe(false);
        expect(end.left.pos[1]).toBeCloseTo(0, 6);
        expect(end.right.pos[1]).toBeCloseTo(0, 6);
        const r = rightOf(end.bodyYaw);
        const gap = (end.right.pos[0] - end.left.pos[0]) * r[0] + (end.right.pos[2] - end.left.pos[2]) * r[2];
        expect(gap).toBeGreaterThan(0.12);
        // nothing moves in the last two seconds
        const a = frames[frames.length - 2 * HZ].out;
        expect(dist2(a.left.pos, end.left.pos)).toBeLessThan(0.005);
        expect(dist2(a.right.pos, end.right.pos)).toBeLessThan(0.005);
    });

    test('the body moves with the stride by a few centimeters and degrees, not more', () => {
        const frames = simulate({ seconds: 8, speed: 1.2, mode: 'virtual' });
        let minY = Infinity;
        let maxY = -Infinity;
        let maxYaw = 0;
        let maxSway = 0;
        for (const { time, out } of frames) {
            if (time < settle) continue;
            minY = Math.min(minY, out.hips.pos[1]);
            maxY = Math.max(maxY, out.hips.pos[1]);
            maxYaw = Math.max(maxYaw, Math.abs(out.hips.yaw - out.bodyYaw));
            maxSway = Math.max(maxSway, Math.abs(out.hips.pos[0]));
        }
        expect(maxY - minY).toBeGreaterThan(0.02);
        expect(maxY - minY).toBeLessThan(0.06);
        expect(maxYaw).toBeGreaterThan(0.04);
        expect(maxYaw).toBeLessThan(0.12);
        expect(maxSway).toBeLessThan(0.04);
    });

    test('the hips bob twice per stride cycle and sway once', () => {
        const frames = simulate({ seconds: 10, speed: 1.2, mode: 'virtual' }).filter((f) => f.time > settle);
        const cross = (get) => {
            let n = 0;
            const mean = frames.reduce((s, f) => s + get(f.out), 0) / frames.length;
            for (let i = 1; i < frames.length; i++) if (get(frames[i - 1].out) < mean && get(frames[i].out) >= mean) n++;
            return n;
        };
        const bobs = cross((o) => o.hips.pos[1]);
        const sways = cross((o) => o.hips.pos[0]);
        expect(bobs / sways).toBeGreaterThan(1.7);
        expect(bobs / sways).toBeLessThan(2.3);
    });

    test('knees stay bent forward and legs keep their length through the whole walk', () => {
        const frames = simulate({ seconds: 8, speed: 1.3, mode: 'virtual' });
        const thigh = 0.53 * EYE * 0.5;
        for (const { out } of frames) {
            for (const [hip, knee] of [
                [out.hipJoints.left, out.leftKnee],
                [out.hipJoints.right, out.rightKnee]
            ]) {
                expect(Math.hypot(hip[0] - knee[0], hip[1] - knee[1], hip[2] - knee[2])).toBeCloseTo(thigh, 4);
            }
            const f = forwardOf(out.bodyYaw);
            // the knee is never behind the line from hip to foot, which would be a backward-bending knee
            for (const [hip, knee, foot] of [
                [out.hipJoints.left, out.leftKnee, out.left.pos],
                [out.hipJoints.right, out.rightKnee, out.right.pos]
            ]) {
                const mid = [(hip[0] + foot[0]) / 2, 0, (hip[2] + foot[2]) / 2];
                const bend = (knee[0] - mid[0]) * f[0] + (knee[2] - mid[2]) * f[2];
                expect(bend).toBeGreaterThan(-0.02);
            }
        }
    });

    test('a turn while walking does not break anything', () => {
        const est = createFootEstimator({ eyeHeight: EYE });
        let x = 0;
        let z = 0;
        for (let i = 0; i < 12 * HZ; i++) {
            const yaw = Math.sin(i * dt * 0.7) * 2.5;
            const f = forwardOf(yaw);
            x += f[0] * 1.0 * dt;
            z += f[2] * 1.0 * dt;
            const out = est.update({ head: { pos: [x, EYE, z], rot: quatFromYaw(yaw) } }, dt);
            expect([...out.left.pos, ...out.right.pos, ...out.leftKnee, ...out.rightKnee].every(Number.isFinite)).toBe(true);
            const r = rightOf(out.bodyYaw);
            const lu = (out.left.pos[0] - out.hipsGround[0]) * r[0] + (out.left.pos[2] - out.hipsGround[2]) * r[2];
            const ru = (out.right.pos[0] - out.hipsGround[0]) * r[0] + (out.right.pos[2] - out.hipsGround[2]) * r[2];
            expect(ru).toBeGreaterThanOrEqual(lu - 1e-6);
        }
    });
});

describe('lateral and curved walking', () => {
    const run = (gen, secs = 6) => {
        const est = createFootEstimator({ eyeHeight: 1.65 });
        let fired = 0;
        for (let i = 0; i < secs * 90; i++) {
            const r = est.update(gen(i / 90), 1 / 90);
            if (i > 135 && r.fired.length) fired++;
        }
        return fired;
    };
    const still = (v) => () => ({ head: { pos: [0, 1.65, 0], rot: quatFromYaw(0) }, virtualVelocity: v });
    test('strafing never fires the foot rules', () => {
        expect(run(still([0.9, 0]))).toBe(0);
        expect(run(still([-0.9, 0]))).toBe(0);
    });
    test('oblique walking never fires the foot rules', () => {
        expect(run(still([0.6, 0.6]))).toBe(0);
        expect(run(still([0.5, -0.5]))).toBe(0);
    });
    test('walking a circle never fires the foot rules', () => {
        expect(
            run((t) => {
                const a = (t * 1.2) / 1.1;
                return { head: { pos: [Math.cos(a) * 1.1, 1.65, Math.sin(a) * 1.1], rot: quatFromYaw(Math.PI - a) } };
            })
        ).toBe(0);
    });
});

describe('bending over', () => {
    const settle = (fwdOff, drop) => {
        const b = createBodyEstimator({ eyeHeight: 1.65 });
        let o;
        let steps = 0;
        for (let i = 0; i < 360; i++) {
            const k = Math.min(1, Math.max(0, (i / 90 - 1) / 1.5));
            const s = k * k * (3 - 2 * k);
            o = b.update({ head: { pos: [0, 1.65 - drop * s, -fwdOff * s], rot: quatFromYaw(0) } }, 1 / 90);
            if (o.gait.walking) steps++;
        }
        return { o, steps };
    };
    test('bending keeps the feet planted and the hips over them', () => {
        const { o, steps } = settle(0.5, 0.42);
        expect(steps).toBe(0);
        expect(Math.abs(o.leftFoot.pos[2] - 0.04) < 0.02).toBe(true);
        expect(Math.abs(o.hips.pos[2] - 0.09) < 0.05).toBe(true);
        expect(o.hips.pos[1] > 0.45).toBe(true);
        expect(o.chest.pos[2] < o.hips.pos[2] - 0.1).toBe(true);
    });
    test('a squat still brings the hips straight down', () => {
        const { o } = settle(0, 0.5);
        expect(Math.abs(o.hips.pos[2] - 0.04) < 0.03).toBe(true);
        expect(o.hips.pos[1] < 0.5).toBe(true);
    });
});

describe('sitting and full bend', () => {
    const ease = (t, a, b) => {
        const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
        return k * k * (3 - 2 * k);
    };
    const run = (opts, fn, secs) => {
        const b = createBodyEstimator({ eyeHeight: 1.65, ...opts });
        let o;
        for (let i = 0; i < secs * 90; i++) o = b.update(fn(i / 90), 1 / 90);
        return o;
    };
    const head = (x, y, z, extra = {}) => ({ head: { pos: [x, y, z], rot: quatFromYaw(0) }, ...extra });
    test('sitting down on a chair puts the hips on the seat and the feet flat in front', () => {
        const o = run({}, (t) => head(0, 1.65 - 0.4 * ease(t, 1, 2), 0.1 * ease(t, 1, 2)), 6);
        expect(o.gait.sitting).toBe(true);
        expect(Math.abs(o.hips.pos[1] - 0.51) < 0.02).toBe(true);
        expect(o.leftFoot.pos[1] < 0.01).toBe(true);
        expect(o.leftFoot.pos[2] < o.hips.pos[2] - 0.25).toBe(true);
        expect(o.fired.length).toBe(0);
    });
    test('the seat height setting moves the hips', () => {
        const o = run({ seatHeight: 0.6 }, (t) => head(0, 1.65 - 0.3 * ease(t, 1, 2), 0.1 * ease(t, 1, 2)), 6);
        expect(o.gait.sitting).toBe(true);
        expect(Math.abs(o.hips.pos[1] - 0.65) < 0.02).toBe(true);
    });
    test('standing up again ends sitting and brings the hips back up', () => {
        const o = run({}, (t) => { const s = ease(t, 1, 2) - ease(t, 4, 5); return head(0, 1.65 - 0.4 * s, 0.1 * s); }, 7);
        expect(o.gait.sitting).toBe(false);
        expect(o.hips.pos[1] > 0.85).toBe(true);
    });
    test('forcing sitting off keeps a crouch a crouch', () => {
        const o = run({}, () => head(0, 1.25, 0, { sitting: false }), 4);
        expect(o.gait.sitting).toBe(false);
    });
    test('a full bend keeps the hips high and the feet where they were', () => {
        const o = run({}, (t) => head(0, 1.65 - 0.95 * ease(t, 1, 3), -0.45 * ease(t, 1, 3)), 5);
        expect(o.hips.pos[1] > 0.7).toBe(true);
        expect(o.chest.pos[1] < o.hips.pos[1]).toBe(true);
        expect(Math.abs(o.leftFoot.pos[2]) < 0.2).toBe(true);
    });
});

describe('joint smoothing', () => {
    const hands = (y, z) => ({
        head: { pos: [0, 1.65, 0], rot: quatFromYaw(0) },
        leftHand: { pos: [-0.3, y, z], rot: quatFromYaw(0) },
        rightHand: { pos: [0.3, 0.9, -0.2], rot: quatFromYaw(0) }
    });
    const settle = (opts, input) => {
        const b = createBodyEstimator({ eyeHeight: 1.65, ...opts });
        let o;
        for (let i = 0; i < 90; i++) o = b.update(input, 1 / 90);
        return { b, o };
    };
    test('a hand that jumps does not make the elbow snap', () => {
        const { b } = settle({}, hands(0.9, -0.2));
        const before = b.update(hands(0.9, -0.2), 1 / 90).leftElbow.pos;
        const after = b.update(hands(1.5, -0.5), 1 / 90).leftElbow.pos;
        expect(Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]) < 0.1).toBe(true);
        const raw = createBodyEstimator({ eyeHeight: 1.65, smoothing: 0 });
        for (let i = 0; i < 90; i++) raw.update(hands(0.9, -0.2), 1 / 90);
        const r0 = raw.update(hands(0.9, -0.2), 1 / 90).leftElbow.pos;
        const r1 = raw.update(hands(1.5, -0.5), 1 / 90).leftElbow.pos;
        expect(Math.hypot(r1[0] - r0[0], r1[1] - r0[1], r1[2] - r0[2]) > 0.1).toBe(true);
    });
    test('the elbow catches up within a third of a second', () => {
        const { b } = settle({}, hands(0.9, -0.2));
        let o;
        for (let i = 0; i < 30; i++) o = b.update(hands(1.5, -0.5), 1 / 90);
        const raw = createBodyEstimator({ eyeHeight: 1.65, smoothing: 0 });
        let r;
        for (let i = 0; i < 90; i++) r = raw.update(hands(0.9, -0.2), 1 / 90);
        for (let i = 0; i < 30; i++) r = raw.update(hands(1.5, -0.5), 1 / 90);
        const d = Math.hypot(...o.leftElbow.pos.map((x, i) => x - r.leftElbow.pos[i]));
        expect(d < 0.03).toBe(true);
    });
    test('smoothing never touches the feet, so planted feet stay put', () => {
        const { o } = settle({}, hands(0.9, -0.2));
        expect(o.leftFoot.pos[1]).toBe(0);
    });
});
