/**
 * Last line of defence against jitter. Two small pieces around the body estimator, both pure and allocation light:
 *
 *  - createInputGuard: cleans the head and hand poses that come in. A tracking glitch (one frame in the next room,
 *    NaN, a flipped quaternion) never reaches the solver, so it can not shake the whole body.
 *  - createTrackerStabilizer: cleans the tracker poses that go out. Bad numbers are replaced by the last good pose,
 *    quaternions never flip sign between frames, tiny motion is absorbed by a soft dead zone (no shimmer at rest, no
 *    lag when you really move), and nothing is allowed to move faster than a body part can.
 *
 * Positions are meters in the estimator's own (reference sized) space, rotations are [x, y, z, w].
 */

const finiteAll = (a) => {
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
    return true;
};

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function normalizeQuat(q) {
    const l = Math.hypot(q[0], q[1], q[2], q[3]);
    return l > 1e-6 ? [q[0] / l, q[1] / l, q[2] / l, q[3] / l] : null;
}

/** Same rotation as q, on the same side of the sphere as ref (so interpolating never goes the long way round). */
function sameSide(q, ref) {
    return q[0] * ref[0] + q[1] * ref[1] + q[2] * ref[2] + q[3] * ref[3] < 0 ? [-q[0], -q[1], -q[2], -q[3]] : q;
}

function slerp(a, b, t) {
    b = sameSide(b, a);
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    d = Math.min(1, d);
    if (d > 0.9995) {
        const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
        return normalizeQuat(q) || a;
    }
    const th = Math.acos(d);
    const s = Math.sin(th);
    const wa = Math.sin((1 - t) * th) / s;
    const wb = Math.sin(t * th) / s;
    return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb, a[3] * wa + b[3] * wb];
}

function angleBetween(a, b) {
    const d = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
    return 2 * Math.acos(d);
}

/**
 * Cleans one input channel's pose. Returns the pose to use (never null once a good pose was seen).
 * A jump of more than `jumpDist` meters at more than `jumpSpeed` m/s is held back; if the new place is still there
 * `confirmFrames` frames in a row it was a real teleport and is accepted.
 */
export function createInputGuard(options = {}) {
    const o = { jumpDist: 0.6, jumpSpeed: 25, confirmFrames: 3, confirmRadius: 0.15, ...options };
    const state = new Map();

    function clean(key, pose, dt) {
        if (!pose) {
            state.delete(key);
            return { pose: null, jumped: false };
        }
        const s = state.get(key);
        const q = finiteAll(pose.pos) && Array.isArray(pose.rot) && finiteAll(pose.rot) ? normalizeQuat(pose.rot) : null;
        if (!q || !finiteAll(pose.pos)) return { pose: s ? s.pose : pose, jumped: false };
        if (!s) {
            const first = { ...pose, rot: q };
            state.set(key, { pose: first, cand: null, count: 0 });
            return { pose: first, jumped: false };
        }
        const rot = sameSide(q, s.pose.rot);
        const d = dist3(pose.pos, s.pose.pos);
        const speed = d / Math.max(dt, 1e-3);
        let jumped = false;
        if (d > o.jumpDist && speed > o.jumpSpeed) {
            if (s.cand && dist3(pose.pos, s.cand) < o.confirmRadius) s.count++;
            else {
                s.cand = pose.pos;
                s.count = 1;
            }
            if (s.count < o.confirmFrames) return { pose: s.pose, jumped: false };
            jumped = true;
        }
        s.cand = null;
        s.count = 0;
        s.pose = { ...pose, rot };
        return { pose: s.pose, jumped };
    }

    return { clean, reset: () => state.clear() };
}

export const STABILIZE_DEFAULTS = {
    // soft dead zone: meters and radians of motion that is swallowed (the output lags by at most this much)
    dead: { hips: [0.0015, 0.0026], chest: [0.0015, 0.0026], foot: [0.002, 0.0035], knee: [0.002, 0.0035], elbow: [0.0015, 0.0026] },
    // fastest a part may move: meters per second, radians per second
    maxSpeed: { hips: [5, 14], chest: [5, 14], foot: [10, 30], knee: [10, 30], elbow: [10, 30] },
    // a jump bigger than this is a teleport, not motion: take it at once
    snapDistance: 1.5,
    // after a pause longer than this (seconds) start fresh
    gap: 0.25
};

const KIND = {
    hips: 'hips',
    chest: 'chest',
    leftFoot: 'foot',
    rightFoot: 'foot',
    leftKnee: 'knee',
    rightKnee: 'knee',
    leftElbow: 'elbow',
    rightElbow: 'elbow'
};

export function createTrackerStabilizer(options = {}) {
    const o = { ...STABILIZE_DEFAULTS, ...options };
    const held = new Map();

    function stabilizeOne(key, target, dt) {
        if (!target) {
            held.delete(key);
            return null;
        }
        const prev = held.get(key);
        const ok = finiteAll(target.pos) && Array.isArray(target.rot) && finiteAll(target.rot) && normalizeQuat(target.rot);
        if (!ok) return prev || null; // bad numbers: keep the last good pose, never emit garbage
        const kind = KIND[key];
        const rotT = sameSide(normalizeQuat(target.rot), prev ? prev.rot : [0, 0, 0, 1]);
        if (!prev || dt > o.gap || dist3(target.pos, prev.pos) > o.snapDistance) {
            const first = { ...target, rot: prev ? rotT : normalizeQuat(target.rot) };
            held.set(key, first);
            return first;
        }
        const [deadP, deadR] = o.dead[kind];
        const [vP, vR] = o.maxSpeed[kind];

        // position: swallow the first deadP meters of any move, then follow, but never faster than vP
        const dp = dist3(target.pos, prev.pos);
        let pos = prev.pos;
        if (dp > deadP) {
            const step = Math.min(dp - deadP, vP * dt);
            const k = step / dp;
            pos = [prev.pos[0] + (target.pos[0] - prev.pos[0]) * k, prev.pos[1] + (target.pos[1] - prev.pos[1]) * k, prev.pos[2] + (target.pos[2] - prev.pos[2]) * k];
        }

        // rotation: the same, in radians
        const ar = angleBetween(rotT, prev.rot);
        let rot = prev.rot;
        if (ar > deadR) {
            const step = Math.min(ar - deadR, vR * dt);
            rot = slerp(prev.rot, rotT, step / ar);
        }

        const out = { ...target, pos, rot };
        held.set(key, out);
        return out;
    }

    /** Takes the estimator output and returns it with every tracker pose cleaned. */
    function apply(out, dt) {
        const next = { ...out };
        for (const key of Object.keys(KIND)) next[key] = stabilizeOne(key, out[key], dt);
        return next;
    }

    return { apply, reset: () => held.clear() };
}
