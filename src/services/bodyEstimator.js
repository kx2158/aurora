/**
 * Aurora full body estimation: hips, chest, elbows, knees and feet from the headset and both hands.
 *
 * Builds on footEstimator.js (hips, feet with boundaries, knees). This file adds the chest and the arms.
 * Same coordinates: SteamVR standing space, x right, y up, -z forward, meters, quaternions [x, y, z, w].
 * Written from scratch with standard two-bone IK, not derived from any other tracking software.
 *
 * Elbows are estimated, not measured. The elbow is placed by two-bone IK, and the direction it points
 * (the swivel around the shoulder-to-hand line) is tied to a body-relative reference (down, back and
 * slightly outward) and hard-limited around it, so it can never flip to the wrong side or turn upside down.
 */
import {
    DEFAULTS as FOOT_DEFAULTS,
    createFootEstimator,
    forwardOf,
    neckAnchor,
    quatFromAxisAngle,
    quatMul,
    quatFromYaw,
    rightOf,
    rotate,
    solveKnee,
    vec,
    yawOfRotation
} from './footEstimator.js';
import { createInertia } from './bodyInertia.js';
import { createInputGuard, createTrackerStabilizer } from './trackerStabilizer.js';

const { add, sub, scale, dot, len, norm, clamp, lerp, wrap } = vec;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const perp = (v, axis) => sub(v, scale(axis, dot(v, axis)));

export const BODY_DEFAULTS = {
    ...FOOT_DEFAULTS,
    maxElbowSwivel: 1.2, // radians (about 70 degrees) the elbow turns away from its reference direction without effort
    elbowSwivelLimit: 2.6, // the most it may turn when the body or the shoulder's range leaves no other choice
    elbowSwivelSpeed: 10, // radians per second the swivel may change at most
    chestYawShare: 0.5, // how much of the head-to-hips twist the chest takes
    maxChestTwist: 0.7,
    neckTurnRange: 0.95, // radians the head may turn relative to the chest before the chest starts to follow
    neckTiltRange: 0.3, // same for tilting the head sideways
    maxLean: 2.6,
    smoothing: 1, // 0 turns joint smoothing off, 2 doubles the time constants
};

/** Rotates v about a unit axis by an angle (Rodrigues). */
export function rotateAbout(v, axis, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
}

/** Quaternion from three orthonormal axes (the columns of a rotation matrix). */
export function quatFromBasis(x, y, z) {
    const m00 = x[0], m10 = x[1], m20 = x[2];
    const m01 = y[0], m11 = y[1], m21 = y[2];
    const m02 = z[0], m12 = z[1], m22 = z[2];
    const tr = m00 + m11 + m22;
    let q;
    if (tr > 0) {
        const s = Math.sqrt(tr + 1) * 2;
        q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
    } else if (m00 > m11 && m00 > m22) {
        const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
        q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
    } else if (m11 > m22) {
        const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
        q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
    } else {
        const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
        q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
    }
    const l = Math.hypot(...q);
    return q.map((v) => v / l);
}

/**
 * The direction an elbow naturally points, perpendicular to the shoulder-to-hand axis:
 * down, back and a little outward. When the arm points along that direction (arm straight down or
 * straight up) the perpendicular part vanishes, so it fades smoothly into "back and outward".
 */
export function elbowReference(axis, bodyYaw, side) {
    const fwd = forwardOf(bodyYaw);
    const out = scale(rightOf(bodyYaw), side === 'left' ? -1 : 1);
    const main = perp(add(add([0, -1, 0], scale(fwd, -0.5)), scale(out, 0.35)), axis);
    const alt = perp(add(scale(fwd, -1), scale(out, 0.6)), axis);
    const w = clamp(len(main) / 0.25, 0, 1);
    const a = len(main) > 1e-6 ? norm(main) : [0, 0, 0];
    const b = len(alt) > 1e-6 ? norm(alt) : out;
    return norm(add(scale(a, w), scale(b, 1 - w)));
}

/**
 * Places one elbow. Returns { elbow, swivel, dir } where dir is the unit direction the elbow points
 * out of the arm line and swivel is its angle from the reference (limited to +-maxElbowSwivel).
 * bias (radians) is an optional extra swivel request, for example from a hand twist; it is clamped
 * like everything else, and the swivel can only change so fast, which is what stops flips.
 */
export function solveArm(shoulder, hand, upper, fore, side, bodyYaw, prevSwivel = 0, dt = 1 / 90, bias = 0, options = {}) {
    const o = { ...BODY_DEFAULTS, ...options };
    const to = sub(hand, shoulder);
    const axis = len(to) > 1e-6 ? norm(to) : [0, -1, 0];
    const ref = elbowReference(axis, bodyYaw, side);
    const lim = Math.max(o.maxElbowSwivel, o.elbowSwivelLimit || 0);
    const target = clamp(bias, -lim, lim);
    const maxStep = o.elbowSwivelSpeed * dt;
    const swivel = clamp(prevSwivel + clamp(target - prevSwivel, -maxStep, maxStep), -lim, lim);
    const dir = rotateAbout(ref, axis, swivel);
    const elbow = solveKnee(shoulder, hand, upper, fore, dir);
    return { elbow, swivel, dir };
}

/** Pose for the elbow tracker: -z along the forearm, +y out of the bend, so +y can never end up inverted. */
export function elbowRotation(shoulder, elbow, hand, dir) {
    let fz = norm(sub(elbow, hand)); // +z points back from the hand to the elbow
    if (len(fz) < 1e-6) fz = [0, 0, 1];
    let y = perp(dir, fz);
    if (len(y) < 1e-6) y = perp([0, 1, 0], fz);
    y = norm(y);
    const x = cross(y, fz);
    return quatFromBasis(x, y, fz);
}


// ---------- joint limits and body collision ----------

/** Distance from point p to the segment a-b, and the closest point on it. */
function nearestOnSegment(p, a, b) {
    const ab = sub(b, a);
    const l2 = dot(ab, ab);
    const t = l2 > 1e-12 ? clamp(dot(sub(p, a), ab) / l2, 0, 1) : 0;
    const c = add(a, scale(ab, t));
    return { c, d: len(sub(p, c)) };
}

/**
 * How deep the arm is inside the body, in meters (0 means clear). The upper arm may not enter the head
 * (a sphere around the head) or the torso (a capsule from the hips to the shoulders). The shoulder end of
 * the upper arm is skipped for the torso because it sits at the capsule's edge by design.
 */
export function armPenetration(shoulder, elbow, body) {
    let pen = 0;
    for (const t of [0.35, 0.6, 0.8, 1]) {
        const pt = lerp3(shoulder, elbow, t);
        pen += Math.max(0, body.headRadius - len(sub(pt, body.head)));
        if (body.headBase) pen += Math.max(0, body.neckRadius - nearestOnSegment(pt, body.head, body.headBase).d);
        if (t >= 0.6) pen += Math.max(0, body.torsoRadius - nearestOnSegment(pt, body.hips, body.neck).d);
    }
    return pen;
}

/**
 * How far an upper arm direction is outside what a shoulder can do (0 means fine). Directions are in the chest's
 * frame: out (away from the body on this side), up, forward. A shoulder cannot bring the elbow across in front of
 * or behind the face when the arm is raised, and it only reaches back so far: about 55 degrees behind the body with
 * the arm hanging down, much less with the arm raised.
 */
export function shoulderStrain(upperDir, out, up, fwd) {
    const ex = dot(upperDir, out);
    const ey = dot(upperDir, up);
    const ez = dot(upperDir, fwd);
    // across the body: more allowed in front (hugging), less the higher the arm is
    const medial = -(0.2 + 0.7 * Math.max(0, ez)) * (1 - 0.65 * Math.max(0, ey));
    let strain = Math.max(0, medial - ex);
    // backward: about 55 degrees with the arm down, about 20 with it level or raised
    const backMax = 0.35 + 0.5 * Math.max(0, -ey);
    strain += Math.max(0, -ez - backMax);
    return strain;
}
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/**
 * Picks the elbow swivel. The natural swivel is 0 (the reference direction). If that would put the upper
 * arm through the head or torso, the closest swivel that does not is used instead, still inside the normal
 * limits. This is what keeps an arm raised beside the head or crossed over the chest looking like a real arm.
 */
export function chooseSwivel(shoulder, hand, upper, fore, side, bodyYaw, body, options = {}, prev = 0) {
    const o = { ...BODY_DEFAULTS, ...options };
    const to = sub(hand, shoulder);
    const axis = len(to) > 1e-6 ? norm(to) : [0, -1, 0];
    const ref = elbowReference(axis, bodyYaw, side);
    const lim = Math.max(o.maxElbowSwivel, o.elbowSwivelLimit || 0);
    const frame = body.chestFrame;
    const outDir = frame ? scale(frame.right, side === 'left' ? -1 : 1) : null;
    let best = 0;
    let bestCost = Infinity;
    const steps = 32;
    for (let i = 0; i <= steps; i++) {
        const sv = ((i / steps) * 2 - 1) * lim;
        const e = solveKnee(shoulder, hand, upper, fore, rotateAbout(ref, axis, sv));
        const ud = norm(sub(e, shoulder));
        const strain = frame ? shoulderStrain(ud, outDir, frame.up, frame.fwd) : 0;
        // inside the body or past the shoulder's range costs most; then turning far from natural; then changing
        // much from the last frame (so two equally good answers do not make the elbow hop back and forth)
        const cost =
            armPenetration(shoulder, e, body) * 40 +
            strain * 8 +
            Math.abs(sv) * 0.25 +
            Math.max(0, Math.abs(sv) - o.maxElbowSwivel) * 0.8 +
            Math.abs(sv - prev) * 0.12;
        if (cost < bestCost) {
            bestCost = cost;
            best = sv;
        }
    }
    return best;
}

/**
 * Where a shoulder sits, given the hand it carries. Real shoulders are not welded to the neck: they rise
 * when the hand goes overhead, slide forward when it reaches out or across the body, and are pulled toward
 * a hand that is farther away than the arm is long. All of it is limited (a few centimeters), so the
 * shoulder stays where a shoulder could be.
 */
export function shoulderOffset(restShoulder, hand, chestFwd, chestUp, chestRight, side, reach, eye) {
    const to = sub(hand, restShoulder);
    const up = dot(to, chestUp);
    const fwd = dot(to, chestFwd);
    const out = dot(to, chestRight) * (side === 'left' ? -1 : 1); // positive: away from the body
    const k = eye / 1.65;
    const shrug = clamp((up - 0.1 * k) / (0.45 * k), 0, 1) * 0.05 * k;
    const protract = clamp((fwd - 0.1 * k) / (0.5 * k), 0, 1) * 0.05 * k + clamp(-out / (0.3 * k), 0, 1) * 0.03 * k;
    let off = add(scale(chestUp, shrug), scale(chestFwd, protract));
    // a hand beyond reach drags the shoulder after it, but only so far
    const d = len(sub(hand, add(restShoulder, off)));
    if (d > reach) {
        const pull = Math.min(d - reach, 0.08 * k);
        off = add(off, scale(norm(sub(hand, add(restShoulder, off))), pull));
    }
    return off;
}

// ---------- joint smoothing ----------

// Speed-adaptive smoothing (a low pass whose cutoff rises with how fast the joint moves). Standing still
// the cutoff is low, so tracker noise and idle wobble are flattened; when the joint really moves the
// cutoff opens up, so it follows with almost no lag. Per joint: cutoff when still (Hz), how much it opens
// per m/s (horizontal and vertical), vertical cutoff when still, and the same pair for rotation (per rad/s).
// Vertical gets a higher floor so crouches and jumps are not compressed or stretched by the smoothing.
const SMOOTH = {
    hips: { fc: 0.5, beta: 4, fcY: 1.6, betaY: 24, fcR: 0.7, betaR: 1.0, lead: 0.05 },
    chest: { fc: 0.5, beta: 4, fcY: 1.6, betaY: 24, fcR: 0.8, betaR: 1.0, lead: 0.05 },
    knee: { fc: 0.8, beta: 4, fcY: 2.0, betaY: 8, fcR: 0.9, betaR: 0.9, lead: 0.03 },
    elbow: { fc: 0.9, beta: 5, fcY: 2.2, betaY: 8, fcR: 1.0, betaR: 1.0, lead: 0.035 },
    foot: { fc: 0.8, beta: 6, fcY: 2.5, betaY: 9, fcR: 1.0, betaR: 1.2, lead: 0.02 }
};

const alphaFor = (fc, dt) => {
    const tau = 1 / (2 * Math.PI * fc);
    return 1 / (1 + tau / dt);
};

function nlerp(a, b, k) {
    const sign = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
    const q = [0, 1, 2, 3].map((i) => a[i] + (sign * b[i] - a[i]) * k);
    const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return q.map((x) => x / l);
}

const angleBetween = (a, b) => {
    const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
    return 2 * Math.acos(Math.min(1, d));
};

/**
 * Takes the noise and sharp edges off the estimator's output. Each joint keeps its own filtered speed
 * (itself smoothed, so one noisy frame cannot open the filter). scaleOf() is the user's smoothing
 * setting: 0 is off, 2 doubles how long it takes to catch up. A jump bigger than a meter (teleport,
 * tracking restart) is taken at once.
 */
function createJointSmoother(scaleOf) {
    const state = new Map();
    function pose(key, cfg, next, dt) {
        if (!next) {
            state.delete(key);
            return next;
        }
        const prev = state.get(key);
        const sc = scaleOf();
        if (!prev || !(sc > 0) || len(sub(next.pos, prev.pos)) > 1) {
            state.set(key, { ...next, raw: next.pos, vel: [0, 0, 0], vr: 0 });
            return next;
        }
        // velocity of the raw target from successive raw samples (not from the lagging filter state), low
        // passed as a vector so noise cancels instead of piling up
        const vk = alphaFor(8, dt);
        const vel = [
            lerp(prev.vel[0], (next.pos[0] - prev.raw[0]) / dt, vk),
            lerp(prev.vel[1], (next.pos[1] - prev.raw[1]) / dt, vk),
            lerp(prev.vel[2], (next.pos[2] - prev.raw[2]) / dt, vk)
        ];
        const vh = Math.hypot(vel[0], vel[2]);
        const vy = Math.abs(vel[1]);
        const vr = lerp(prev.vr, angleBetween(prev.rot, next.rot) / dt, vk);
        const kh = alphaFor((cfg.fc + cfg.beta * vh) / sc, dt);
        const ky = alphaFor((cfg.fcY + cfg.betaY * vy) / sc, dt);
        const kr = alphaFor((cfg.fcR + cfg.betaR * vr) / sc, dt);
        // Any filter trails the target while it moves. Add back a little of the velocity (only when the joint
        // really moves, so rest noise is not amplified, and never more than 3 cm) so the pose does not feel late.
        const gate = Math.min(1, Math.max(0, (Math.hypot(vel[0], vel[1], vel[2]) - 0.25) / 0.4));
        const L = (cfg.lead || 0) * gate / sc;
        const cap = (v) => Math.max(-0.03, Math.min(0.03, v));
        const out = {
            ...next,
            pos: [
                lerp(prev.pos[0], next.pos[0], kh) + cap(vel[0] * L),
                lerp(prev.pos[1], next.pos[1], ky) + cap(vel[1] * L),
                lerp(prev.pos[2], next.pos[2], kh) + cap(vel[2] * L)
            ],
            rot: nlerp(prev.rot, next.rot, kr)
        };
        state.set(key, { ...out, pos: [lerp(prev.pos[0], next.pos[0], kh), lerp(prev.pos[1], next.pos[1], ky), lerp(prev.pos[2], next.pos[2], kh)], raw: next.pos, vel, vr });
        return out;
    }
    return { pose, reset: () => state.clear() };
}

function createBodyCore(options = {}) {
    const o = { ...BODY_DEFAULTS, ...options };
    const feet = createFootEstimator(o);
    const p = feet.proportions;
    const eye = o.eyeHeight;
    const arm = {
        upper: 0.2 * eye * o.armScale,
        fore: 0.18 * eye * o.armScale,
        shoulderHalf: 0.1 * eye
    };
    const swivels = { left: 0, right: 0 };
    const smoother = createJointSmoother(() => o.smoothing);

    function update(input, dt) {
        dt = clamp(dt || 0.011, 0.001, 0.1);
        // Do the arms turn with the head? Hands held out in front stay in front of the face when the whole
        // body turns, but stay behind when only the head looks around. Only used when both hands are tracked
        // and held out in front of the body; otherwise the head alone decides.
        let turning = 0;
        if (input.leftHand && input.rightHand) {
            const mid = [(input.leftHand.pos[0] + input.rightHand.pos[0]) / 2 - input.head.pos[0], (input.leftHand.pos[2] + input.rightHand.pos[2]) / 2 - input.head.pos[2]];
            if (Math.hypot(mid[0], mid[1]) > 0.2) {
                const handsYaw = Math.atan2(-mid[0], -mid[1]);
                const agree = 1 - clamp(Math.abs(wrap(handsYaw - yawOfRotation(input.head.rot))) / 0.5, 0, 1);
                turning = agree;
            }
        }
        const lower = feet.update({ head: input.head, virtualVelocity: input.virtualVelocity, sitting: input.sitting, turning }, dt);
        const yaw = lower.bodyYaw;
        const headYaw = yawOfRotation(input.head.rot);
        const anchor = neckAnchor(input.head, yaw); // head position without the swing around the neck

        // spine: the chest takes part of the head's turn and the lean
        const hips = lower.hipsBase; // the spine follows the head, not the hips' own walking motion
        // the neck turns first: the chest only follows once the head is turned past the neck's comfortable range
        const rel = wrap(headYaw - yaw);
        const beyond = Math.sign(rel) * Math.max(0, Math.abs(rel) - o.neckTurnRange);
        const twist = clamp(beyond * o.chestYawShare, -o.maxChestTwist, o.maxChestTwist);
        const chestYaw = yaw + twist + lower.gait.counterYaw;
        const fwdC = forwardOf(chestYaw);
        const rgtC = rightOf(chestYaw);
        const toHead = sub(anchor, hips);
        const lean = clamp(Math.atan2(dot(toHead, forwardOf(yaw)), toHead[1]), -o.maxLean, o.maxLean);
        // head tilt: sideways tilt of the head bends the spine a little toward the same side. Looking up or
        // down does not lean the chest by itself, only the head moving away from the hips does.
        const hr = rotate(input.head.rot, [1, 0, 0]);
        const headRoll = Math.atan2(hr[1], Math.hypot(hr[0], hr[2]));
        const rollBeyond = Math.sign(headRoll) * Math.max(0, Math.abs(headRoll) - o.neckTiltRange); // the neck takes the first part of a tilt
        const spineRoll = clamp(-rollBeyond * 0.5, -0.25, 0.25);
        const upC = [Math.sin(lean) * fwdC[0], Math.cos(lean), Math.sin(lean) * fwdC[2]];
        const upN = norm(upC);
        const rgtT = rotateAbout(rgtC, fwdC, spineRoll);
        const upT = rotateAbout(upN, fwdC, spineRoll);
        const shoulderCenter = add(sub(anchor, scale(upT, 0.12 * eye)), scale(fwdC, -0.05));
        const chestPos = add(hips, scale(sub(shoulderCenter, hips), 0.7));
        const chestRot = quatMul(quatMul(quatFromYaw(chestYaw), quatFromAxisAngle(rgtC, lean)), quatFromAxisAngle([0, 0, -1], spineRoll));
        const hipsRot = quatMul(quatFromYaw(lower.hips.yaw), quatFromAxisAngle(rightOf(lower.hips.yaw), lean * 0.6));

        // body volumes the arms must stay out of
        const k = eye / 1.65;
        // the head's centre sits about 8 cm behind and 4 cm below the headset
        const headCentre = add(input.head.pos, rotate(input.head.rot, [0, -0.04 * k, 0.08 * k]));
        const bodyVol = {
            head: headCentre,
            headRadius: 0.13 * k,
            headBase: add(shoulderCenter, scale(upT, 0.03 * k)),
            neckRadius: 0.08 * k,
            hips,
            neck: sub(shoulderCenter, scale(upT, 0.04 * k)),
            torsoRadius: 0.13 * k,
            chestFrame: { right: rgtT, up: upT, fwd: fwdC }
        };
        const reachMax = arm.upper + arm.fore;

        const makeArm = (side, hand) => {
            if (!hand) return null;
            const sign = side === 'left' ? -1 : 1;
            const rest = add(shoulderCenter, scale(rgtT, sign * arm.shoulderHalf));
            const shoulder = add(rest, shoulderOffset(rest, hand.pos, fwdC, upT, rgtT, side, reachMax * 0.97, eye));
            const want = chooseSwivel(shoulder, hand.pos, arm.upper, arm.fore, side, chestYaw, bodyVol, o, swivels[side]);
            const r = solveArm(shoulder, hand.pos, arm.upper, arm.fore, side, chestYaw, swivels[side], dt, want, o);
            swivels[side] = r.swivel;
            return {
                shoulder,
                pos: r.elbow,
                rot: elbowRotation(shoulder, r.elbow, hand.pos, r.dir),
                swivel: r.swivel
            };
        };

        // knees: rotation follows the thigh with the knee pointing the way the toes point
        const kneeRot = (hipJoint, knee, foot) => {
            const down = norm(sub(knee, hipJoint));
            const forward = norm(perp(forwardOf(foot.yaw), down));
            return quatFromBasis(cross(down, forward), scale(down, -1), scale(forward, -1));
        };
        const hipL = lower.hipJoints.left;
        const hipR = lower.hipJoints.right;

        const sm = smoother.pose;
        // a smoothed foot never dips into the floor
        const smFoot = (key, pose) => {
            const f = sm(key, SMOOTH.foot, pose, dt);
            return f.pos[1] < 0 ? { ...f, pos: [f.pos[0], 0, f.pos[2]] } : f;
        };
        const outElbow = (side, e) => {
            if (!e) {
                sm(side + 'Elbow', SMOOTH.elbow, null, dt);
                return null;
            }
            const out = sm(side + 'Elbow', SMOOTH.elbow, e, dt);
            // smoothing moves the elbow on its own, so put it back at arm length from the shoulder (a bone does not stretch)
            const d = sub(out.pos, e.shoulder);
            const l = len(d);
            const pos = l > 1e-6 ? add(e.shoulder, scale(d, arm.upper / l)) : out.pos;
            return { ...out, pos, shoulder: e.shoulder, swivel: e.swivel };
        };
        return {
            bodyYaw: yaw,
            hips: sm('hips', SMOOTH.hips, { pos: lower.hips.pos, rot: hipsRot }, dt),
            hipsBase: lower.hipsBase,
            chest: sm('chest', SMOOTH.chest, { pos: chestPos, rot: chestRot }, dt),
            leftFoot: smFoot('leftFoot', { pos: lower.left.pos, rot: lower.left.rot }),
            rightFoot: smFoot('rightFoot', { pos: lower.right.pos, rot: lower.right.rot }),
            leftKnee: sm('leftKnee', SMOOTH.knee, { pos: lower.leftKnee, rot: kneeRot(hipL, lower.leftKnee, lower.left) }, dt),
            rightKnee: sm('rightKnee', SMOOTH.knee, { pos: lower.rightKnee, rot: kneeRot(hipR, lower.rightKnee, lower.right) }, dt),
            leftElbow: outElbow('left', makeArm('left', input.leftHand)),
            rightElbow: outElbow('right', makeArm('right', input.rightHand)),
            gait: lower.gait,
            fired: lower.fired
        };
    }

    function reset() {
        feet.reset();
        swivels.left = 0;
        swivels.right = 0;
        smoother.reset();
    }

    return { update, reset, arm, proportions: p };
}

// ---------- calibration pose (for VRChat's Calibrate FBT) ----------

/**
 * Is this a T-pose? Both hands out to the sides at about shoulder height, far apart, level, across the way the head
 * faces, and held still. VRChat's full body calibration shows the avatar in a T-pose, so this is when to hand VRChat a
 * clean, straight body to match its trackers to (the same idea as Standable's calibration mode, without the flick).
 * Works at the reference size (eye height 1.65 m).
 */
export function isTPose(head, left, right, eye = 1.65) {
    if (!head || !left || !right) return false;
    const k = eye / 1.65;
    const span = Math.hypot(left.pos[0] - right.pos[0], left.pos[2] - right.pos[2]);
    if (span < 1.05 * k) return false;
    for (const h of [left, right]) {
        const dy = h.pos[1] - head.pos[1];
        if (dy < -0.5 * k || dy > 0.12 * k) return false;
    }
    if (Math.abs(left.pos[1] - right.pos[1]) > 0.22 * k) return false;
    // the middle of the hands is near the body
    const mid = [(left.pos[0] + right.pos[0]) / 2 - head.pos[0], (left.pos[2] + right.pos[2]) / 2 - head.pos[2]];
    if (Math.hypot(mid[0], mid[1]) > 0.3 * k) return false;
    // the line between the hands runs across the way the head faces, with the left hand on the left
    const r = rightOf(yawOfRotation(head.rot));
    const across = ((right.pos[0] - left.pos[0]) * r[0] + (right.pos[2] - left.pos[2]) * r[2]) / span;
    return across > 0.8;
}

/** A clean standing pose under the head with straight arms out to the hands: what VRChat should calibrate against. */
export function calibrationPose(head, left, right, proportions, arm, eye = 1.65) {
    const yaw = yawOfRotation(head.rot);
    const fwd = forwardOf(yaw);
    const rgt = rightOf(yaw);
    const up = [0, 1, 0];
    const anchor = neckAnchor(head, yaw);
    const rot = quatFromYaw(yaw);
    const hips = add(sub(anchor, [0, proportions.headToHips, 0]), scale(fwd, -0.02));
    const shoulderCenter = add(sub(anchor, scale(up, 0.12 * eye)), scale(fwd, -0.05));
    const chest = add(hips, scale(sub(shoulderCenter, hips), 0.7));
    const ground = [hips[0], 0, hips[2]];
    const leg = (sign) => {
        const hipJoint = add(hips, scale(rgt, (sign * proportions.hipWidth) / 2));
        const foot = add(ground, scale(rgt, (sign * proportions.hipWidth) / 2));
        const ankle = add(foot, [0, proportions.ankleHeight, 0]);
        const knee = add(scale(add(hipJoint, ankle), 0.5), scale(fwd, 0.03));
        return { foot: { pos: foot, rot, yaw, pitch: 0 }, knee: { pos: knee, rot } };
    };
    const L = leg(-1);
    const R = leg(1);
    const armOf = (sign, hand) => {
        if (!hand) return null;
        const shoulder = add(shoulderCenter, scale(rgt, sign * arm.shoulderHalf));
        const dir = norm(sub(hand.pos, shoulder));
        const elbow = add(shoulder, scale(dir, arm.upper));
        // elbows face back with the palms down, like the avatar's T-pose
        return { pos: elbow, rot: elbowRotation(shoulder, elbow, hand.pos, scale(fwd, -1)), shoulder, swivel: 0 };
    };
    return {
        hips: { pos: hips, rot },
        chest: { pos: chest, rot },
        leftFoot: L.foot,
        rightFoot: R.foot,
        leftKnee: L.knee,
        rightKnee: R.knee,
        leftElbow: armOf(-1, left),
        rightElbow: armOf(1, right)
    };
}

const REFERENCE_EYE = 1.65;

const scalePos = (p, k) => [p[0] * k, p[1] * k, p[2] * k];
const scalePose = (pose, k) => (pose ? { ...pose, pos: scalePos(pose.pos, k) } : pose);
const scaleElbow = (e, k) => (e ? { ...e, pos: scalePos(e.pos, k), shoulder: scalePos(e.shoulder, k) } : e);

/**
 * Creates the full body estimator.
 *
 *   const body = createBodyEstimator({ eyeHeight: 1.69 });
 *   const out = body.update({ head: { pos, rot }, leftHand: { pos, rot }, rightHand: { pos, rot } }, dt);
 *
 * Hands are optional; an arm is skipped (null) when its hand is missing. Output poses are { pos, rot }.
 *
 * It works at any size. eyeHeight is the eye height of the body in the same units as the poses that
 * come in, so a 1 cm avatar (eyeHeight 0.01) or a 100 m one works exactly like a normal one: the
 * input is shrunk to a normal sized body, estimated there, and the result is scaled back. Every
 * distance rule (foot gaps, step sizes, thresholds) therefore scales with the body.
 */
export function createBodyEstimator(options = {}) {
    const base = { ...BODY_DEFAULTS, ...options };
    const eye = Number.isFinite(Number(base.eyeHeight)) && Number(base.eyeHeight) > 0 ? Number(base.eyeHeight) : REFERENCE_EYE;
    const s = eye / REFERENCE_EYE;
    // seatHeight is for a normal sized body, so it grows and shrinks with the body like everything else
    const core = createBodyCore({ ...base, eyeHeight: REFERENCE_EYE });
    const inv = 1 / s;
    const arm = { upper: core.arm.upper * s, fore: core.arm.fore * s, shoulderHalf: core.arm.shoulderHalf * s };
    const p = { ...core.proportions };
    for (const key of ['legLength', 'headToHips', 'hipWidth', 'ankleHeight', 'thigh', 'shin']) if (typeof p[key] === 'number') p[key] *= s;

    // every preventive: bad input never reaches the solver, bad output never reaches SteamVR
    const guard = createInputGuard();
    const stabilizer = createTrackerStabilizer();
    // springs on the skeleton: switches and jumps blend instead of snapping (see bodyInertia.js)
    const inertia = createInertia();
    let tTimer = 0; // how long the T-pose has been held (or, while calibrating, how long it has been let go)
    let calibrating = false;
    const JOINTS = ['hips', 'chest', 'leftFoot', 'rightFoot', 'leftKnee', 'rightKnee', 'leftElbow', 'rightElbow'];

    function reset() {
        core.reset();
        guard.reset();
        stabilizer.reset();
        inertia.reset();
    }

    function update(input, dt) {
        const frame = dt || 0.011;
        const head = guard.clean('head', input.head, frame);
        const leftHand = guard.clean('leftHand', input.leftHand, frame);
        const rightHand = guard.clean('rightHand', input.rightHand, frame);
        // the headset really jumped somewhere else (teleport, respawn): start the body over at the new place
        if (head.jumped) {
            core.reset();
            stabilizer.reset();
            inertia.reset();
        }
        const inp = {
            ...input,
            head: scalePose(head.pose, inv),
            leftHand: scalePose(leftHand.pose, inv),
            rightHand: scalePose(rightHand.pose, inv),
            virtualVelocity: input.virtualVelocity ? [input.virtualVelocity[0] * inv, input.virtualVelocity[1] * inv] : input.virtualVelocity
        };
        let raw = core.update(inp, dt);
        // VRChat calibration: input.calibrate true forces the calibration pose, false never shows it, and left out it
        // comes on by itself while you hold a T-pose (half a second) and goes off when you let go
        if (input.calibrate === true) calibrating = true;
        else if (input.calibrate === false) calibrating = false;
        else {
            const t = isTPose(inp.head, inp.leftHand, inp.rightHand);
            if (!calibrating) {
                tTimer = t ? tTimer + frame : 0;
                if (tTimer > 0.5) {
                    calibrating = true;
                    tTimer = 0;
                }
            } else {
                tTimer = t ? 0 : tTimer + frame;
                if (tTimer > 0.35) {
                    calibrating = false;
                    tTimer = 0;
                }
            }
        }
        if (calibrating) {
            const pose = calibrationPose(inp.head, inp.leftHand, inp.rightHand, core.proportions, core.arm);
            raw = { ...raw, ...pose, gait: { ...raw.gait, mode: 'calibrate', calibrating: true } };
        }
        // the shoulders ride on springs too, so an elbow kept at arm length from its shoulder cannot jump either
        const withShoulders = {
            ...raw,
            leftShoulder: raw.leftElbow ? { pos: raw.leftElbow.shoulder } : null,
            rightShoulder: raw.rightElbow ? { pos: raw.rightElbow.shoulder } : null
        };
        const sprung = inertia.apply(withShoulders, raw.gait.mode || 'stand', frame, [...JOINTS, 'leftShoulder', 'rightShoulder']);
        for (const side of ['left', 'right']) {
            const e = sprung[side + 'Elbow'];
            const sh = sprung[side + 'Shoulder'];
            if (e && sh) sprung[side + 'Elbow'] = { ...e, shoulder: sh.pos };
            delete sprung[side + 'Shoulder'];
        }
        // a blended foot never dips into the floor (unless lying, where the body is on the surface)
        if (!raw.gait.laying) {
            for (const key of ['leftFoot', 'rightFoot']) {
                const f = sprung[key];
                if (f && f.pos[1] < 0) sprung[key] = { ...f, pos: [f.pos[0], 0, f.pos[2]] };
            }
        }
        const out = stabilizer.apply(sprung, frame);
        // the stabilizer may hold an elbow back for a frame: a bone does not stretch, so keep it at arm length
        for (const key of ['leftElbow', 'rightElbow']) {
            const e = out[key];
            if (!e || !e.shoulder) continue;
            const d = sub(e.pos, e.shoulder);
            const l = len(d);
            if (l > 1e-6) out[key] = { ...e, pos: add(e.shoulder, scale(d, core.arm.upper / l)) };
        }
        if (s === 1) return out;
        return {
            ...out,
            hips: scalePose(out.hips, s),
            hipsBase: scalePos(out.hipsBase, s),
            chest: scalePose(out.chest, s),
            leftFoot: scalePose(out.leftFoot, s),
            rightFoot: scalePose(out.rightFoot, s),
            leftKnee: scalePose(out.leftKnee, s),
            rightKnee: scalePose(out.rightKnee, s),
            leftElbow: scaleElbow(out.leftElbow, s),
            rightElbow: scaleElbow(out.rightElbow, s),
            gait: { ...out.gait, speed: out.gait.speed * s, stepLength: out.gait.stepLength * s }
        };
    }

    return { update, reset, arm, proportions: p, scale: s };
}
