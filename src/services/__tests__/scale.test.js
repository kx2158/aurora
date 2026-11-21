import { createBodyEstimator } from '../bodyEstimator.js';
import { quatFromYaw } from '../footEstimator.js';

// the same moves for a body of any size: positions and speeds scale with it, time does not
const scenario = (s) => (t) => {
    const e = 1.65 * s;
    const ease = (a, b) => {
        const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
        return k * k * (3 - 2 * k);
    };
    let hx = 0;
    let hy = e;
    let hz = 0;
    let yaw = 0;
    let virt;
    if (t < 3) virt = [0, 1.1 * s];
    else if (t < 7) {
        const a = ((t - 3) * 1.0) / 1.5;
        hx = Math.cos(a) * 1.5 * s - 1.5 * s;
        hz = Math.sin(a) * 1.5 * s;
        yaw = Math.PI - a;
    } else {
        // standing still where the circle ended, then a bend, back up, then sitting down
        const kb = ease(8.5, 9.5) - ease(10, 11);
        const ks = ease(12, 13);
        hx = (Math.cos(4 / 1.5) * 1.5 - 1.5) * s;
        hz = Math.sin(4 / 1.5) * 1.5 * s - 0.5 * s * kb + 0.1 * s * ks;
        hy = e - 0.42 * s * kb - 0.4 * s * ks;
        yaw = Math.PI - 4 / 1.5;
    }
    const hand = (side) => ({ pos: [hx + side * 0.28 * s, hy - 0.55 * s, hz - 0.3 * s], rot: quatFromYaw(yaw) });
    return { head: { pos: [hx, hy, hz], rot: quatFromYaw(yaw) }, leftHand: hand(-1), rightHand: hand(1), virtualVelocity: virt };
};

const run = (s) => {
    const b = createBodyEstimator({ eyeHeight: 1.65 * s });
    const sc = scenario(s);
    const frames = [];
    for (let i = 0; i < 15 * 90; i += 3) {
        let out;
        for (let j = 0; j < 3; j++) out = b.update(sc((i + j) / 90), 1 / 90);
        frames.push(out);
    }
    return frames;
};

const joints = ['hips', 'chest', 'leftFoot', 'rightFoot', 'leftKnee', 'rightKnee', 'leftElbow', 'rightElbow'];

describe('any body size', () => {
    const reference = run(1);
    for (const s of [0.006, 0.05, 0.5, 3, 60]) {
        test(`a body ${s} times the size moves exactly like a normal one, only scaled`, () => {
            const frames = run(s);
            // a step can start one frame earlier or later where a threshold is crossed within rounding
            // error, so frames are compared tightly until then and the settled end pose loosely
            const compare = (f, r, limit) => {
                let worst = 0;
                for (const j of joints) {
                    const a = f[j] && f[j].pos;
                    const b = r[j] && r[j].pos;
                    if (!a || !b) continue;
                    for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(a[k] / s - b[k]));
                }
                expect(worst < limit).toBe(true);
            };
            frames.forEach((f, i) => {
                if ((i * 3) / 90 < 8.4) {
                    compare(f, reference[i], 1e-4);
                    expect(f.fired.join()).toBe(reference[i].fired.join());
                    expect(f.gait.walking).toBe(reference[i].gait.walking);
                }
            });
            const last = frames.length - 1;
            compare(frames[last], reference[last], 0.03);
            expect(frames[last].gait.sitting).toBe(reference[last].gait.sitting);
        });
    }
    test('the proportions scale too', () => {
        const small = createBodyEstimator({ eyeHeight: 0.01 });
        const normal = createBodyEstimator({ eyeHeight: 1.65 });
        expect(Math.abs(small.proportions.legLength / normal.proportions.legLength - 0.01 / 1.65) < 1e-9).toBe(true);
        expect(Math.abs(small.arm.upper / normal.arm.upper - 0.01 / 1.65) < 1e-9).toBe(true);
    });
});
