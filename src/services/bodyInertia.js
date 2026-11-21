/**
 * Springs on the skeleton: smooth transitions without lag.
 *
 * When the estimator switches what it is doing (standing, walking, sitting, lying) or a joint target jumps for any
 * other reason (direction reversal, a step being re-planned, an arm choosing another elbow angle), the new pose is
 * not shown at once. The difference between where the joint was and where it should now be is kept as an offset,
 * and that offset springs back to zero with a critically damped spring: fast at first, then settling, never
 * overshooting. In steady motion the offset is zero, so nothing lags behind. This is the "inertialization" games use
 * to blend animations.
 *
 * Pure math, no imports.
 */

const LN2 = Math.LN2;

/** One critically damped spring step for a value x with velocity v toward 0. Returns [x, v]. */
export function springDecay(x, v, halflife, dt) {
    const y = (4 * LN2) / Math.max(halflife, 1e-4) / 2;
    const j1 = v + x * y;
    const e = Math.exp(-y * dt);
    return [e * (x + j1 * dt), e * (v - j1 * y * dt)];
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const qMul = (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
const qInv = (q) => [-q[0], -q[1], -q[2], q[3]];
const qNorm = (q) => {
    const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return q.map((x) => x / l);
};

/** Rotation vector (axis * angle) of a unit quaternion, shortest way round. */
export function quatLog(q) {
    let [x, y, z, w] = q;
    if (w < 0) [x, y, z, w] = [-x, -y, -z, -w];
    const s = Math.hypot(x, y, z);
    if (s < 1e-9) return [0, 0, 0];
    const angle = 2 * Math.atan2(s, w);
    return [(x / s) * angle, (y / s) * angle, (z / s) * angle];
}

/** Unit quaternion from a rotation vector. */
export function quatExp(r) {
    const angle = len(r);
    if (angle < 1e-9) return [0, 0, 0, 1];
    const s = Math.sin(angle / 2) / angle;
    return [r[0] * s, r[1] * s, r[2] * s, Math.cos(angle / 2)];
}

export const INERTIA_DEFAULTS = {
    switchHalflife: 0.16, // seconds: how long the blend after a mode switch takes to get halfway
    jumpHalflife: 0.1, // same for a single joint jumping
    jumpSpeed: 2.5, // m/s: a joint target moving this much faster than it just was counts as a jump to be smoothed
    jumpTurn: 8, // rad/s: same for rotation
    maxOffset: 2.5 // meters: anything further than this is a real teleport and is taken at once (lying to standing moves the feet about 1.5 m)
};

/**
 * Creates the spring layer. Call apply(pose, mode, dt) every frame after the estimator, where pose maps joint names
 * to { pos, rot } and mode is any string that changes when the estimator switches what it is doing.
 */
export function createInertia(options = {}) {
    const o = { ...INERTIA_DEFAULTS, ...options };
    const joints = new Map(); // name -> { target, out, off, offV, rOff, rOffV, halflife }
    let lastMode = null;

    function apply(pose, mode, dt, keys) {
        const switched = lastMode !== null && mode !== lastMode;
        lastMode = mode;
        const result = { ...pose };
        for (const key of keys) {
            const next = pose[key];
            if (!next || !next.pos) {
                joints.delete(key);
                continue;
            }
            let j = joints.get(key);
            if (!j) {
                j = { target: next, out: next, off: [0, 0, 0], offV: [0, 0, 0], rOff: [0, 0, 0], rOffV: [0, 0, 0], halflife: o.jumpHalflife, speed: 0, turnRate: 0 };
                joints.set(key, j);
                result[key] = next;
                continue;
            }
            // did the target jump? (mode switch, or a frame step far faster than a body moves)
            const move = len(sub(next.pos, j.target.pos)) / dt;
            const turn = next.rot && j.target.rot ? len(quatLog(qMul(next.rot, qInv(j.target.rot)))) / dt : 0;
            // a jump is a frame much faster than the joint was just moving: a swinging foot is fast all the way
            // through its swing, which is not a jump, while a target that teleports is
            const jumped = move > o.jumpSpeed + 2 * j.speed || turn > o.jumpTurn + 2 * j.turnRate;
            const ka = 1 - Math.exp(-dt / 0.08);
            j.speed += (Math.min(move, 6) - j.speed) * ka;
            j.turnRate += (Math.min(turn, 20) - j.turnRate) * ka;
            if (switched || jumped) {
                const gap = sub(j.out.pos, next.pos);
                if (len(gap) < o.maxOffset) {
                    j.off = gap;
                    if (next.rot && j.out.rot) j.rOff = quatLog(qMul(j.out.rot, qInv(next.rot)));
                    j.halflife = switched ? o.switchHalflife : o.jumpHalflife;
                } else {
                    j.off = [0, 0, 0];
                    j.offV = [0, 0, 0];
                    j.rOff = [0, 0, 0];
                    j.rOffV = [0, 0, 0];
                }
            }
            // the offsets spring back to zero
            for (let a = 0; a < 3; a++) {
                [j.off[a], j.offV[a]] = springDecay(j.off[a], j.offV[a], j.halflife, dt);
                [j.rOff[a], j.rOffV[a]] = springDecay(j.rOff[a], j.rOffV[a], j.halflife, dt);
            }
            const out = { ...next, pos: add(next.pos, j.off) };
            if (next.rot) out.rot = qNorm(qMul(quatExp(j.rOff), next.rot));
            j.target = next;
            j.out = out;
            result[key] = out;
        }
        return result;
    }

    function reset() {
        joints.clear();
        lastMode = null;
    }

    /** True while any joint is still blending (handy for tests). */
    const blending = () => [...joints.values()].some((j) => len(j.off) > 0.002 || len(j.rOff) > 0.01);

    return { apply, reset, blending };
}
