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
    quatFromAxisAngle,
    quatMul,
    quatFromYaw,
    rightOf,
    rotate,
    solveKnee,
    vec,
    yawOfRotation
} from './footEstimator.js';

const { add, sub, scale, dot, len, norm, clamp, lerp, wrap } = vec;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const perp = (v, axis) => sub(v, scale(axis, dot(v, axis)));

export const BODY_DEFAULTS = {
    ...FOOT_DEFAULTS,
    maxElbowSwivel: 1.2, // radians (about 70 degrees) the elbow may turn away from its reference direction
    elbowSwivelSpeed: 10, // radians per second the swivel may change at most
    chestYawShare: 0.5, // how much of the head-to-hips twist the chest takes
    maxChestTwist: 0.7,
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
    const target = clamp(bias, -o.maxElbowSwivel, o.maxElbowSwivel);
    const maxStep = o.elbowSwivelSpeed * dt;
    const swivel = clamp(prevSwivel + clamp(target - prevSwivel, -maxStep, maxStep), -o.maxElbowSwivel, o.maxElbowSwivel);
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

// ---------- joint smoothing ----------

// time constants in seconds: how quickly each joint catches up with where the math says it should be
const SMOOTH_TC = { hips: 0.05, chest: 0.06, knee: 0.05, elbow: 0.045 };

function nlerp(a, b, k) {
    const sign = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
    const q = [0, 1, 2, 3].map((i) => a[i] + (sign * b[i] - a[i]) * k);
    const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return q.map((x) => x / l);
}

/**
 * Takes the sharp edges off the estimator's output so nothing snaps: each joint eases toward its new
 * pose. A jump bigger than a meter (teleport, tracking restart) is taken at once.
 */
function createJointSmoother(scaleOf) {
    const state = new Map();
    function pose(key, tc, next, dt) {
        if (!next) {
            state.delete(key);
            return next;
        }
        const prev = state.get(key);
        const t = tc * scaleOf();
        if (!prev || t <= 0 || len(sub(next.pos, prev.pos)) > 1) {
            state.set(key, next);
            return next;
        }
        const k = 1 - Math.exp(-dt / t);
        const out = {
            ...next,
            pos: [lerp(prev.pos[0], next.pos[0], k), lerp(prev.pos[1], next.pos[1], k), lerp(prev.pos[2], next.pos[2], k)],
            rot: nlerp(prev.rot, next.rot, k)
        };
        state.set(key, out);
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
        const lower = feet.update({ head: input.head, virtualVelocity: input.virtualVelocity, sitting: input.sitting }, dt);
        const yaw = lower.bodyYaw;
        const headYaw = yawOfRotation(input.head.rot);

        // spine: the chest takes part of the head's turn and the lean
        const hips = lower.hipsBase; // the spine follows the head, not the hips' own walking motion
        const twist = clamp(wrap(headYaw - yaw) * o.chestYawShare, -o.maxChestTwist, o.maxChestTwist);
        const chestYaw = yaw + twist + lower.gait.counterYaw;
        const fwdC = forwardOf(chestYaw);
        const rgtC = rightOf(chestYaw);
        const toHead = sub(input.head.pos, hips);
        const lean = clamp(Math.atan2(dot(toHead, forwardOf(yaw)), toHead[1]), -o.maxLean, o.maxLean);
        const upC = [Math.sin(lean) * fwdC[0], Math.cos(lean), Math.sin(lean) * fwdC[2]];
        const shoulderCenter = add(sub(input.head.pos, scale(norm(upC), 0.12 * eye)), scale(fwdC, -0.05));
        const chestPos = add(hips, scale(sub(shoulderCenter, hips), 0.7));
        const chestRot = quatMul(quatFromYaw(chestYaw), quatFromAxisAngle(rgtC, lean));
        const hipsRot = quatMul(quatFromYaw(lower.hips.yaw), quatFromAxisAngle(rightOf(lower.hips.yaw), lean * 0.6));

        const makeArm = (side, hand) => {
            if (!hand) return null;
            const sign = side === 'left' ? -1 : 1;
            const shoulder = add(shoulderCenter, scale(rgtC, sign * arm.shoulderHalf));
            const r = solveArm(shoulder, hand.pos, arm.upper, arm.fore, side, chestYaw, swivels[side], dt, 0, o);
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
        const outElbow = (side, e) => (e ? { ...sm(side + 'Elbow', SMOOTH_TC.elbow, e, dt), shoulder: e.shoulder, swivel: e.swivel } : (sm(side + 'Elbow', 0, null, dt), null));
        return {
            bodyYaw: yaw,
            hips: sm('hips', SMOOTH_TC.hips, { pos: lower.hips.pos, rot: hipsRot }, dt),
            hipsBase: lower.hipsBase,
            chest: sm('chest', SMOOTH_TC.chest, { pos: chestPos, rot: chestRot }, dt),
            leftFoot: { pos: lower.left.pos, rot: lower.left.rot },
            rightFoot: { pos: lower.right.pos, rot: lower.right.rot },
            leftKnee: sm('leftKnee', SMOOTH_TC.knee, { pos: lower.leftKnee, rot: kneeRot(hipL, lower.leftKnee, lower.left) }, dt),
            rightKnee: sm('rightKnee', SMOOTH_TC.knee, { pos: lower.rightKnee, rot: kneeRot(hipR, lower.rightKnee, lower.right) }, dt),
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

    function update(input, dt) {
        const inp = {
            ...input,
            head: scalePose(input.head, inv),
            leftHand: scalePose(input.leftHand, inv),
            rightHand: scalePose(input.rightHand, inv),
            virtualVelocity: input.virtualVelocity ? [input.virtualVelocity[0] * inv, input.virtualVelocity[1] * inv] : input.virtualVelocity
        };
        const out = core.update(inp, dt);
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

    return { update, reset: core.reset, arm, proportions: p, scale: s };
}
