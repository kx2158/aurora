/**
 * Aurora full body estimation: hips, feet and knees from the headset alone.
 *
 * Pure math, no imports, so it can be tested without VR. Written from scratch with standard
 * two-bone IK and simple geometry, not derived from any other tracking software.
 *
 * Coordinates are SteamVR standing space: x right, y up, -z forward, meters, quaternions as
 * [x, y, z, w]. Yaw is the angle about +y, forward = [-sin(yaw), 0, -cos(yaw)], right = [cos(yaw), 0, -sin(yaw)].
 *
 * The important part for foot trackers is constrainFeet(). It can be used on its own, on feet from any
 * source, to keep them from crossing, overlapping, over-reaching or going under the floor.
 */

const TAU = Math.PI * 2;

export const DEFAULTS = {
    eyeHeight: 1.65, // meters, floor to eyes while standing
    legScale: 1, // calibration: 1.1 means legs 10 percent longer than the average for this height
    armScale: 1, // calibration: same for the arms
    // constraints (meters, radians)
    minFootSeparation: 0.13, // closest the feet may be side by side (center to center)
    footLength: 0.26, // feet this far apart front to back may overlap sideways
    crossTolerance: 0, // how far a foot may cross the center line when the other is clearly ahead
    maxToeAngle: 0.7, // about 40 degrees of toe in or out from the body direction
    maxFootYawDifference: 0.9, // feet may not point more than about 50 degrees apart
    reachFactor: 0.98, // share of the full leg length a foot may be from its hip
    maxHipAbduction: 0.75, // radians (about 43 degrees): how far out to the side a leg may swing from straight down
    maxHipAdduction: 0.42, // about 24 degrees: how far a leg may swing inward, across the other one
    maxHipExtension: 0.55, // about 31 degrees: how far behind the hip a leg may reach
    kneeYawShare: 0.75, // how much of the foot's turn the knee follows (the rest stays with the pelvis)
    maxKneeYaw: 0.6, // radians the knee may point away from the pelvis direction
    // stepping
    stepDistance: 0.2, // a foot steps when the hips are this far from its resting spot
    stepTime: 0.22, // seconds per step
    stepHeight: 0.07,
    // body direction
    // walking
    walkStart: 0.2, // m/s of movement (real or from the game) that starts a walk cycle
    walkStop: 0.07, // below this for a moment and the walk ends
    stanceHalfWidth: 0.07, // each foot's distance from the center line while walking
    walkStepHeight: 0.09, // how high the swinging foot lifts at a normal pace
    seatHeight: 0.46, // top of the chair or bed you sit on, meters; 0 turns sitting off
    layHeight: 0.75, // the head must be lower than this (meters) to count as lying down; a deep bend stays above it
    layDepth: 1, // how far the legs stretch out while lying, 1 is nearly straight
    laySpread: 1, // how far apart the feet lie, 1 is about hip width
    seatSensitivity: 1, // above 1 sits down sooner and from a little higher, below 1 needs a clearer sit
    swayAmount: 1, // how much the hips sway side to side while walking, 0 is none
    counterbalance: 1, // how far the hips shift away from a leaning head while standing, 0 is off
    yawDeadband: 1.05, // radians (about 60 degrees) the head may turn on the neck before the body follows
    yawFollowSpeed: 7,
    pivotTurn: 0.5, // radians the body may turn before the feet re-plant (pivot) to face the new way
};

// ---------- small vector and angle helpers ----------

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (a) => {
    let r = (a + Math.PI) % TAU;
    if (r < 0) r += TAU;
    return r - Math.PI;
};
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => {
    const l = len(a);
    return l > 1e-9 ? scale(a, 1 / l) : [0, 0, 0];
};

export const vec = { add, sub, scale, dot, len, norm, clamp, lerp, wrap };

export const forwardOf = (yaw) => [-Math.sin(yaw), 0, -Math.cos(yaw)];
export const rightOf = (yaw) => [Math.cos(yaw), 0, -Math.sin(yaw)];

/** Rotates a vector by a quaternion [x, y, z, w]. */
export function rotate(q, v) {
    const [x, y, z, w] = q;
    const tx = 2 * (y * v[2] - z * v[1]);
    const ty = 2 * (z * v[0] - x * v[2]);
    const tz = 2 * (x * v[1] - y * v[0]);
    return [
        v[0] + w * tx + (y * tz - z * ty),
        v[1] + w * ty + (z * tx - x * tz),
        v[2] + w * tz + (x * ty - y * tx)
    ];
}

/**
 * Yaw of a head rotation. Uses the head's right axis, which stays well defined when looking
 * straight up or down (the forward axis does not).
 */
export function yawOfRotation(q) {
    const r = rotate(q, [1, 0, 0]);
    if (Math.hypot(r[0], r[2]) < 1e-6) return 0;
    return Math.atan2(-r[2], r[0]);
}


/**
 * Where the head would be if it sat directly over the spine. The headset hangs about 9 cm in front of the
 * neck joint, so turning or nodding the head swings it around that joint. Undoing that swing means a head
 * that only turns (or nods, or tilts) does not look like the whole body moving. Facing straight ahead with
 * the body, this returns the headset position itself.
 */
export function neckAnchor(head, bodyYaw) {
    const o = rotate(head.rot, [0, -0.08, 0.09]); // neck joint relative to the headset, in the world
    const f = forwardOf(bodyYaw);
    return [head.pos[0] + o[0] + f[0] * 0.09, head.pos[1] + o[1] + 0.08, head.pos[2] + o[2] + f[2] * 0.09];
}

/** Quaternion for a rotation about +y. */
export const quatFromYaw = (yaw) => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];

export function quatFromAxisAngle(axis, angle) {
    const a = norm(axis);
    const s = Math.sin(angle / 2);
    return [a[0] * s, a[1] * s, a[2] * s, Math.cos(angle / 2)];
}

/** Hamilton product: applies b first, then a. */
export function quatMul(a, b) {
    return [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
    ];
}

/**
 * Foot pitch during a step (radians, positive = toes up): the heel peels off first, then the toes
 * come up to land heel first. t runs 0 to 1 over the step.
 */
export function stepPitch(t) {
    if (t < 0.45) return -0.5 * Math.sin((t / 0.45) * Math.PI * 0.5) * Math.sin((t / 0.45) * Math.PI);
    const u = (t - 0.45) / 0.55;
    return 0.35 * Math.sin(u * Math.PI);
}

/**
 * Leg proportions from eye height. Rough human averages: hips sit at about 55 percent of eye height
 * and the leg (hip to ankle) is about 53 percent of it.
 */
export function proportions(eyeHeight, legScale = 1) {
    const leg = 0.53 * eyeHeight * legScale;
    return {
        legLength: leg,
        thigh: leg * 0.5,
        shin: leg * 0.5,
        headToHips: eyeHeight * (1 - 0.55 * legScale), // longer legs put the hips higher
        hipWidth: 0.1 * eyeHeight,
        ankleHeight: 0.07
    };
}

// ---------- the boundaries ----------

/**
 * Keeps two feet inside sensible limits. Feet are plain objects { pos: [x, y, z], yaw }.
 * frame is { origin: [x, y, z] (point on the floor under the hips), yaw, hipY, hipWidth, legLength }.
 *
 * What it enforces:
 *  1. reach: an ankle cannot be farther from its hip than the leg is long
 *  2. no crossing and no overlap: the left foot stays left of the right one, and the feet keep a
 *     footprint-shaped gap (more room sideways, less when one foot is clearly ahead)
 *  3. floor: feet never go under the floor
 *  4. toe angles: each foot stays near the body direction and the two cannot point far apart
 * The rules are applied in a few alternating passes so they settle together. Returns new feet and a list of which rules had to act, which is handy for debugging.
 */
export function constrainFeet(left, right, frame, options = {}) {
    const o = { ...DEFAULTS, ...options };
    const fwd = forwardOf(frame.yaw);
    const rgt = rightOf(frame.yaw);
    const origin = frame.origin;
    const hipHalf = (frame.hipWidth ?? 0.16) / 2;
    const reach = (frame.legLength ?? 0.9) * o.reachFactor;
    const hipY = frame.hipY ?? 0.9;
    const ankle = frame.ankleHeight ?? 0.07; // the leg ends at the ankle, not at the sole
    const floorY = frame.floorY ?? 0;
    const fired = new Set();

    // how far right of the left foot the right foot has to be, given how far apart they are front to back
    const requiredFor = (dv) => {
        const gap = o.minFootSeparation * Math.sqrt(Math.max(0, 1 - Math.min(1, dv / o.footLength) ** 2));
        if (!(o.crossTolerance > 0)) return gap;
        const t = clamp((dv - o.footLength * 0.5) / (o.footLength * 0.5), 0, 1);
        return lerp(gap, -o.crossTolerance, t);
    };

    // work in body coordinates: u sideways (right positive), v forward, y up
    const toLocal = (f) => {
        const d = sub(f.pos, origin);
        return { u: dot(d, rgt), v: dot(d, fwd), y: f.pos[1], yaw: f.yaw };
    };
    const L = toLocal(left);
    const R = toLocal(right);

    const reachPass = (foot, hipU) => {
        const dy = hipY - (foot.y + ankle);
        const du = foot.u - hipU;
        const flat = Math.hypot(du, foot.v);
        const maxFlat = dy >= reach ? 0 : Math.sqrt(reach * reach - dy * dy);
        if (dy > reach) {
            // hips higher than the leg is long: the foot is lifted instead of stretching the leg
            foot.y = hipY - reach - ankle;
            fired.add('reach');
        }
        if (flat > maxFlat && flat > 1e-9) {
            const k = maxFlat / flat;
            foot.u = hipU + du * k;
            foot.v *= k;
            fired.add('reach');
        }
        // hip joint range: the leg can swing out to the side or back only so far for how low the foot hangs
        const drop = Math.max(dy, 0.12);
        const outSign = hipU < 0 ? -1 : 1; // which way is outward for this leg
        const side = (foot.u - hipU) * outSign; // positive: foot is outside its hip
        const maxOut = Math.tan(o.maxHipAbduction) * drop;
        const maxIn = Math.tan(o.maxHipAdduction) * drop;
        if (side > maxOut || side < -maxIn) {
            foot.u = hipU + outSign * clamp(side, -maxIn, maxOut);
            fired.add('hip');
        }
        const maxBack = Math.tan(o.maxHipExtension) * drop;
        if (foot.v < -maxBack) {
            foot.v = -maxBack;
            fired.add('hip');
        }
    };

    for (let pass = 0; pass < 8; pass++) {
        reachPass(L, -hipHalf);
        reachPass(R, hipHalf);

        // crossing and overlap
        const required = requiredFor(Math.abs(R.v - L.v));
        const have = R.u - L.u;
        if (have < required) {
            const push = (required - have) / 2;
            L.u -= push;
            R.u += push;
            fired.add(have < 0 ? 'cross' : 'overlap');
        }
    }

    // The rules can fight each other when both feet are far out of range. If anything is still wrong, blend
    // the feet toward a neutral stance (always valid) just far enough to satisfy every rule.
    const valid = () => {
        if (R.u - L.u < requiredFor(Math.abs(R.v - L.v)) - 1e-6) return false;
        for (const [f, hu] of [
            [L, -hipHalf],
            [R, hipHalf]
        ]) {
            const dy = hipY - (f.y + ankle);
            if (Math.hypot(f.u - hu, f.v, dy) > reach + 1e-6) return false;
            const drop = Math.max(dy, 0.12);
            const outSign = hu < 0 ? -1 : 1;
            const sd = (f.u - hu) * outSign;
            if (sd > Math.tan(o.maxHipAbduction) * drop + 1e-6 || sd < -Math.tan(o.maxHipAdduction) * drop - 1e-6) return false;
            if (f.v < -Math.tan(o.maxHipExtension) * drop - 1e-6) return false;
        }
        return true;
    };
    if (!valid()) {
        const half = Math.max(hipHalf, o.minFootSeparation / 2);
        const vMid = clamp((L.v + R.v) / 2, -0.05, 0.05);
        const a = { u: L.u, v: L.v, y: L.y };
        const b = { u: R.u, v: R.v, y: R.y };
        for (let k = 1; k <= 8 && !valid(); k++) {
            const t = k / 8;
            L.u = lerp(a.u, -half, t);
            L.v = lerp(a.v, vMid, t);
            L.y = lerp(a.y, floorY, t);
            R.u = lerp(b.u, half, t);
            R.v = lerp(b.v, vMid, t);
            R.y = lerp(b.y, floorY, t);
        }
        fired.add('reset');
    }

    for (const f of [L, R]) {
        if (f.y < floorY) {
            f.y = floorY;
            fired.add('floor');
        }
    }

    // toe angles relative to the body direction
    const rel = (f) => wrap(f.yaw - frame.yaw);
    let lr = clamp(rel(L), -o.maxToeAngle, o.maxToeAngle);
    let rr = clamp(rel(R), -o.maxToeAngle, o.maxToeAngle);
    if (lr !== rel(L) || rr !== rel(R)) fired.add('toe');
    // left yaw minus right yaw: positive means the toes point away from each other, negative toward
    const spread = lr - rr;
    if (Math.abs(spread) > o.maxFootYawDifference) {
        const excess = (Math.abs(spread) - o.maxFootYawDifference) / 2;
        const s = Math.sign(spread);
        lr -= s * excess;
        rr += s * excess;
        fired.add('toe');
    }
    L.yaw = frame.yaw + lr;
    R.yaw = frame.yaw + rr;

    const toWorld = (f) => ({
        pos: [origin[0] + rgt[0] * f.u + fwd[0] * f.v, f.y, origin[2] + rgt[2] * f.u + fwd[2] * f.v],
        yaw: f.yaw
    });
    return { left: toWorld(L), right: toWorld(R), fired: [...fired] };
}

// ---------- knees ----------

/**
 * Two-bone IK. Returns the knee position for a leg from hipJoint to target (the ankle),
 * with the knee bending toward poleDir (the way the toes point).
 */
export function solveKnee(hipJoint, target, thigh, shin, poleDir) {
    const to = sub(target, hipJoint);
    const maxD = thigh + shin - 1e-4;
    const d = clamp(len(to), 0.05, maxD);
    const dir = norm(to);
    const a = (thigh * thigh - shin * shin + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(thigh * thigh - a * a, 0));
    // part of the pole direction that is perpendicular to the leg
    let pole = sub(poleDir, scale(dir, dot(poleDir, dir)));
    if (len(pole) < 1e-6) pole = [0, 0, -1];
    return add(add(hipJoint, scale(dir, a)), scale(norm(pole), h));
}

// ---------- walking ----------

const smooth01 = (t) => {
    const x = clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
};

/**
 * Foot pitch through one stride (radians, positive = toes up). theta 0 is heel strike, 0.6 is toe-off.
 * Heel strikes toes-up, the foot comes down flat, the heel peels off, then the foot swings through and
 * lifts its toes again for the next strike.
 */
export function gaitPitch(theta) {
    if (theta < 0.08) return 0.3 * (1 - smooth01(theta / 0.08));
    if (theta < 0.35) return 0;
    if (theta < 0.6) return -0.55 * smooth01((theta - 0.35) / 0.25);
    const u = (theta - 0.6) / 0.4;
    if (u < 0.45) return lerp(-0.55, 0, smooth01(u / 0.45));
    return lerp(0, 0.3, smooth01((u - 0.45) / 0.55));
}

/**
 * Step length and stride rate for a speed. Normal walking is about 1.15 steps a second at a crawl and
 * about 1.85 at 1.4 m/s. Short legs cannot take long steps, so when the step would be longer than the
 * leg can reach (maxHalfStride is how far a foot may be ahead of or behind the hips), the step shortens
 * and the cadence goes up instead, the way real people compensate. Speed always works out exactly:
 * stepLength * stepRate = speed, which is what keeps planted feet from sliding.
 * Returns { stepLength, cycleRate } where cycleRate is full left+right cycles per second.
 */
export function gaitParams(speed, maxHalfStride) {
    const f0 = 1.15 + 0.5 * Math.min(speed, 2.2);
    let length = speed / f0;
    const maxLength = (2 * maxHalfStride) / 1.2;
    if (length > maxLength) length = maxLength;
    const stepRate = length > 1e-6 ? speed / length : f0;
    return { stepLength: length, cycleRate: stepRate / 2 };
}

/**
 * The two feet walk in parallel lanes, one on each side of the line of travel, so they never meet no
 * matter which way you move. dirv is the unit direction of travel in body coordinates [right, forward].
 * Returns the lane direction (unit, from the center line toward the right foot) and how the feet should
 * point: toes lean toward the direction of travel but never more than about 35 degrees.
 */
export function gaitLanes(dirv) {
    const s = Math.tanh(dirv[1] / 0.2);
    const lu = dirv[1] * s + 0.02;
    const lv = -dirv[0] * s;
    const l = Math.hypot(lu, lv);
    // folded so walking backward leans the same way as walking forward
    let phi = Math.atan2(dirv[0], dirv[1]);
    if (phi > Math.PI / 2) phi -= Math.PI;
    else if (phi < -Math.PI / 2) phi += Math.PI;
    return { lane: [lu / l, lv / l], toeLean: clamp(-phi * 0.25, -0.3, 0.3) };
}

/**
 * Where one foot is along the direction of travel, relative to the hips, and how high it is.
 * theta is the foot's own stride phase (0 heel strike). The foot is planted for the first 60 percent
 * and moves backward at exactly the walking speed (so in the world it stands still), then swings
 * forward. The swing is a Hermite curve that starts and ends moving backward at walking speed, so
 * the speed is smooth where the foot leaves and meets the floor.
 */
export function gaitFoot(theta, stepLength, stepHeight) {
    const half = 0.6 * stepLength;
    if (theta < 0.6) return { along: half - 2 * stepLength * theta, y: 0 };
    const u = (theta - 0.6) / 0.4;
    const u2 = u * u;
    const u3 = u2 * u;
    const m = -0.8 * stepLength; // velocity times swing time, in meters
    const along =
        -half * (2 * u3 - 3 * u2 + 1) + m * (u3 - 2 * u2 + u) + half * (-2 * u3 + 3 * u2) + m * (u3 - u2);
    return { along, y: stepHeight * Math.sin(Math.PI * u) ** 1.2 };
}

// ---------- the estimator ----------

/**
 * Creates an estimator. Call update() every frame with the headset pose and the time step.
 *
 *   const est = createFootEstimator({ eyeHeight: 1.69 });
 *   const out = est.update({ head: { pos, rot }, virtualVelocity: [0, 1.2] }, dt);
 *   // out.hips, out.left, out.right, out.leftKnee, out.rightKnee, out.gait, out.fired
 *
 * Walking is driven by movement of your head, plus optional virtualVelocity: [right, forward] in m/s,
 * your body's own frame. Use that for thumbstick movement, where the headset stays put but the game
 * moves you. Without it a person walking with the stick would look like they are standing still.
 */
export function createFootEstimator(options = {}) {
    const o = { ...DEFAULTS, ...options };
    const p = proportions(o.eyeHeight, o.legScale);
    let bodyYaw = null;
    let feet = null; // { left: {pos, yaw}, right: {...} } planted spots
    let step = null; // { side, from, to, t }
    let lastHipsGround = null;
    let swingPitch = null;
    let pitches = { left: 0, right: 0 };
    // walking
    let walking = false;
    let phase = 0; // the left foot's stride phase, the right foot is half a cycle behind
    let blend = 0; // 0 right after a walk starts, 1 once the feet have joined the stride
    let entry = null; // where the feet were when the walk started, in body coordinates
    let stanceYaw = null; // the way the planted feet point; they only turn once the body has turned a good way
    let pivoting = false;
    let laying = false;
    let layTimer = 0;
    let layAxis = null; // horizontal direction from the hips toward the head while lying
    let layBlend = 0;
    let stopTimer = 0;
    let releaseOff = { left: [0, 0], right: [0, 0] };
    let plant = { left: null, right: null }; // world spot a planted foot is held at so it does not creep
    let vSmooth = [0, 0];
    let bendSmooth = 0;
    let sitting = false;
    let sitTimer = 0;
    let sitBlend = 0;
    let sitAnchor = null;
    let lastHeadPos = null;
    let lastHeadGround = null;
    let sitFeet = { left: null, right: null }; // where the feet rest while sitting
    let vyAvg = 0; // smoothed vertical head speed, m/s
    let balance = [0, 0]; // smoothed world x/z shift of the hips that counters the head leaning off the feet
    let travelVel = [0, 0, 0]; // smoothed world velocity of the hips, used to point the body where it walks

    const homeOf = (side, hipsGround, yaw, velocity) => {
        const half = Math.max(o.minFootSeparation, 0.1) / 2 + 0.04;
        const sign = side === 'left' ? -1 : 1;
        const lead = clamp(dot(velocity, forwardOf(yaw)) * 0.15, -0.15, 0.2);
        return add(add(hipsGround, scale(rightOf(yaw), sign * half)), scale(forwardOf(yaw), lead));
    };

    // The lying pose. Face up, face down and on the side differ only in which way the toes and knees point.
    function layOut(head, headUp, headFwdV, dt) {
        layBlend = Math.min(1, layBlend + dt / 0.5);
        const flat = [headUp[0], 0, headUp[2]];
        if (len(flat) > 0.25) {
            const a = norm(flat);
            layAxis = layAxis ? norm(add(scale(layAxis, Math.exp(-4 * dt)), scale(a, 1 - Math.exp(-4 * dt)))) : a;
        } else if (!layAxis) {
            layAxis = forwardOf(bodyYaw ?? 0);
        }
        const axis = layAxis;
        const side = [-axis[2], 0, axis[0]]; // horizontal, across the body
        // 'back' faces the ceiling, 'front' the floor, otherwise on a side
        const faceUp = headFwdV[1];
        const pose = faceUp > 0.5 ? 'back' : faceUp < -0.5 ? 'front' : 'side';
        const floorY = 0;
        const hipsY = Math.max(floorY + 0.08, head.pos[1] - 0.09);
        const torso = p.headToHips * 0.85;
        const hips = [head.pos[0] - axis[0] * torso, hipsY, head.pos[2] - axis[2] * torso];
        const hipsYaw = Math.atan2(-axis[0], -axis[2]);
        const legDir = scale(axis, -1);
        const dist = p.legLength * 0.9 * clamp(o.layDepth, 0.4, 1.1);
        const halfSpread = (p.hipWidth / 2 + 0.03) * o.laySpread;
        const footY = Math.max(floorY, hipsY - 0.07);
        const sideSign = pose === 'side' ? 0 : 1;
        // on the side the legs stack: both feet sit nearly together, one in front of the other
        const feetAt = (sign) => [
            hips[0] + legDir[0] * (dist - (pose === 'side' ? 0.06 * sign : 0)) + side[0] * sign * halfSpread * sideSign,
            footY + (pose === 'side' && sign > 0 ? 0.1 : 0),
            hips[2] + legDir[2] * (dist - (pose === 'side' ? 0.06 * sign : 0)) + side[2] * sign * halfSpread * sideSign
        ];
        // toes point up when lying on the back, down on the front, and sideways on the side
        const pitch = pose === 'back' ? 1.2 : pose === 'front' ? -0.9 : 0;
        const footYaw = Math.atan2(-legDir[0], -legDir[2]) + (pose === 'front' ? Math.PI : 0);
        const mk = (sign) => {
            const pos = feetAt(sign);
            return { pos, yaw: footYaw, pitch, rot: quatMul(quatFromYaw(footYaw), quatFromAxisAngle([1, 0, 0], pitch)) };
        };
        const left = mk(-1);
        const right = mk(1);
        const hipJoint = (sign) => add(hips, scale(side, sign * p.hipWidth / 2));
        const hipL = hipJoint(-1);
        const hipR = hipJoint(1);
        // knees bend a little upward so they never end up under the surface
        const kneePole = [0, 1, 0];
        const kneeL = solveKnee(hipL, add(left.pos, [0, p.ankleHeight, 0]), p.thigh, p.shin, kneePole);
        const kneeR = solveKnee(hipR, add(right.pos, [0, p.ankleHeight, 0]), p.thigh, p.shin, kneePole);
        lastHipsGround = [hips[0], 0, hips[2]];
        lastHeadGround = null;
        feet = { left: { pos: [...left.pos], yaw: footYaw }, right: { pos: [...right.pos], yaw: footYaw } };
        return {
            bodyYaw: hipsYaw,
            hips: { pos: hips, yaw: hipsYaw },
            hipsBase: hips,
            hipsGround: lastHipsGround,
            hipJoints: { left: hipL, right: hipR },
            left,
            right,
            leftKnee: kneeL,
            rightKnee: kneeR,
            gait: { walking: false, phase: 0, speed: 0, stepLength: 0, counterYaw: 0, sitting: false, laying: true, layPose: pose },
            fired: []
        };
    }

    function update(input, dt) {
        dt = clamp(dt || 0.011, 0.001, 0.1);
        const head = input.head;
        const headYaw = yawOfRotation(head.rot);

        // lying down: the head is low and tipped over, so its up direction is level instead of vertical. The body
        // then lies along that direction: hips back from the head, legs stretched out the other way.
        const headUp = rotate(head.rot, [0, 1, 0]);
        const headFwdV = rotate(head.rot, [0, 0, -1]);
        const tipped = headUp[1] < 0.5 && head.pos[1] < o.layHeight;
        if (o.layHeight > 0 && input.sitting !== true) {
            layTimer = tipped ? layTimer + dt : Math.max(0, layTimer - dt * 2);
            if (!laying && layTimer > 0.5) {
                laying = true;
                layBlend = 0;
                layAxis = null;
                step = null;
                walking = false;
                sitting = false;
            } else if (laying && layTimer <= 0) {
                laying = false;
                // stand up fresh: the body direction and feet are worked out again from the head
                bodyYaw = null;
                feet = null;
                stanceYaw = null;
                lastHipsGround = null;
                lastHeadGround = null;
            }
        }
        if (laying) return layOut(head, headUp, headFwdV, dt);

        // body direction follows the head only after it has turned past the deadband
        if (bodyYaw === null) bodyYaw = headYaw;
        const diff = wrap(headYaw - bodyYaw);
        // input.turning (0 to 1) says the arms are turning with the head, so the whole body is turning and
        // not just the head looking around: the body then follows after a much smaller head turn
        const band = o.yawDeadband * (1 - 0.6 * clamp(input.turning || 0, 0, 1));
        if (Math.abs(diff) > band) {
            const target = headYaw - Math.sign(diff) * band * 0.5;
            bodyYaw = wrap(bodyYaw + wrap(target - bodyYaw) * (1 - Math.exp(-o.yawFollowSpeed * dt)));
        }

        // someone walking forward faces where they are going, so on a curve the body turns with the path
        // instead of lagging behind the head (which would make a curve look like sideways steps)
        const travelSpeed = Math.hypot(travelVel[0], travelVel[2]);
        if (travelSpeed > 0.4 && !input.virtualVelocity) {
            const heading = Math.atan2(-travelVel[0], -travelVel[2]);
            if (Math.abs(wrap(heading - headYaw)) < 1.1) {
                bodyYaw = wrap(bodyYaw + wrap(heading - bodyYaw) * (1 - Math.exp(-14 * dt)));
            }
        }

        if (stanceYaw === null) stanceYaw = bodyYaw;
        const sd = wrap(bodyYaw - stanceYaw);
        if (!pivoting && Math.abs(sd) > o.pivotTurn) pivoting = true;
        if (pivoting) {
            stanceYaw = wrap(stanceYaw + sd * (1 - Math.exp(-9 * dt)));
            if (Math.abs(wrap(bodyYaw - stanceYaw)) < 0.06) pivoting = false;
        }
        const fwd = forwardOf(bodyYaw);
        const rgt = rightOf(bodyYaw);
        const hp = neckAnchor(head, bodyYaw); // head position with the swing around the neck removed
        let baseHips = add(sub(hp, [0, p.headToHips, 0]), scale(fwd, -0.07)); // the hips sit almost under the neck joint (2 cm ahead of it)

        // sitting: with a seat height set, hips that settle at seat height and stay there mean sitting.
        // input.sitting can force it on (true) or off (false); leave it out for automatic.
        const headSpeed = lastHeadPos ? Math.hypot(hp[0] - lastHeadPos[0], hp[2] - lastHeadPos[2]) / dt : 0;
        // smoothed vertical head speed (negative while going down) and how far the head is below standing height
        const headVy = lastHeadPos ? (hp[1] - lastHeadPos[1]) / dt : 0;
        vyAvg = lerp(vyAvg, headVy, 1 - Math.exp(-10 * dt));
        const lowered = o.eyeHeight - hp[1];
        lastHeadPos = [...hp];
        const seatHips = o.seatHeight + 0.05; // hips centre when seated
        if (o.seatHeight > 0 || input.sitting === true) {
            const hipEst = baseHips[1];
            let want;
            if (input.sitting === true) want = true;
            else if (input.sitting === false) want = false;
            else if (!sitting) {
                // a bend looks like sitting by height alone, but then the head is well ahead of the feet
                // (sitting back onto a seat puts the head behind the feet, leaning forward over them does not count)
                const aheadOfFeet = feet
                    ? (hp[0] - (feet.left.pos[0] + feet.right.pos[0]) / 2) * fwd[0] + (hp[2] - (feet.left.pos[2] + feet.right.pos[2]) / 2) * fwd[2]
                    : 0;
                const overFeet = !feet || (aheadOfFeet < 0.18 && aheadOfFeet > -0.6);
                // a slouch or a low chair puts the hips lower than the seat setting says, so the window reaches further down
                const near = hipEst < seatHips + 0.09 * o.seatSensitivity && hipEst > seatHips - 0.2 * o.seatSensitivity && headSpeed < 0.15 && !walking && overFeet;
                sitTimer = near ? sitTimer + dt : 0;
                want = sitTimer > 0.4 / o.seatSensitivity;
            } else {
                want = hipEst < seatHips + 0.14 * o.seatSensitivity;
            }
            if (want && !sitting) {
                sitting = true;
                sitFeet = { left: null, right: null };
                sitAnchor = [baseHips[0], baseHips[2]];
                sitBlend = 0;
                step = null;
                walking = false;
                pitches = { left: 0, right: 0 };
            } else if (!want && sitting) {
                sitting = false;
                sitTimer = 0;
            }
        }
        sitBlend = sitting ? Math.min(1, sitBlend + dt / 0.5) : 0;
        if (sitting) {
            // the pelvis stays on the seat, following the head only a little (leaning, shuffling)
            sitAnchor = [lerp(sitAnchor[0], baseHips[0], 1 - Math.exp(-0.6 * dt)), lerp(sitAnchor[1], baseHips[2], 1 - Math.exp(-0.6 * dt))];
            const k = smooth01(sitBlend);
            baseHips = [lerp(baseHips[0], sitAnchor[0], k), lerp(baseHips[1], seatHips, k), lerp(baseHips[2], sitAnchor[1], k)];
        }

        // bending over: when the head goes forward of the feet and down, the hips do not follow it. They
        // stay over the feet and the spine hinges, so the hips height comes from the torso length. A squat
        // (head straight down) is left alone, there the hips really do go down with the head. In a full
        // bend the head ends up below the hips: the hips stay at standing height and slide back instead.
        const rawHips = baseHips;
        let bend = 0;
        if (feet && !sitting) {
            const cx = (feet.left.pos[0] + feet.right.pos[0]) / 2;
            const cz = (feet.left.pos[2] + feet.right.pos[2]) / 2;
            const ahead = (hp[0] - cx) * fwd[0] + (hp[2] - cz) * fwd[2];
            const drop = o.eyeHeight - hp[1];
            bend = smooth01((ahead - 0.04) / 0.15) * smooth01((drop - 0.02) / 0.06);
            bendSmooth = lerp(bendSmooth, bend, 1 - Math.exp(-12 * dt));
        } else {
            bendSmooth = lerp(bendSmooth, 0, 1 - Math.exp(-12 * dt));
        }
        if (bendSmooth > 0.001 && feet) {
            const cx = (feet.left.pos[0] + feet.right.pos[0]) / 2;
            const cz = (feet.left.pos[2] + feet.right.pos[2]) / 2;
            const T = p.headToHips;
            const stand = o.eyeHeight - T - 0.03 * bendSmooth;
            let hx = cx - fwd[0] * 0.05;
            let hz = cz - fwd[2] * 0.05;
            const f = Math.min((hp[0] - hx) * fwd[0] + (hp[2] - hz) * fwd[2], T * 0.95);
            const hyHinge = Math.min(hp[1] - Math.sqrt(Math.max(T * T - f * f, 0.01)) - 0.03 * bendSmooth, stand);
            // full bend: head below the hips. Keep the hips high and push them back until the torso fits.
            const f2 = Math.sqrt(Math.max(T * T - (stand - hp[1]) ** 2, 0.01));
            const headF = (hp[0] - cx) * fwd[0] + (hp[2] - cz) * fwd[2];
            const back = clamp(f2 - headF, -0.05, 0.35);
            // slide from the first model to the second as the hinge solution gets too low to be believable
            const w = smooth01((0.6 - hyHinge) / 0.25);
            hx = lerp(hx, cx - fwd[0] * back, w);
            hz = lerp(hz, cz - fwd[2] * back, w);
            const hy = lerp(hyHinge, stand, w);
            baseHips = [lerp(baseHips[0], hx, bendSmooth), lerp(baseHips[1], hy, bendSmooth), lerp(baseHips[2], hz, bendSmooth)];
        }
        const hipsGround = [baseHips[0], 0, baseHips[2]];
        // speed comes from the head (the hips before the bend model moves them): the bend model keeps the hips
        // over the feet, so measuring them would make the feet chase their own hips and walk away
        const headGround = [rawHips[0], 0, rawHips[2]];
        const worldVel = lastHeadGround ? scale(sub(headGround, lastHeadGround), 1 / dt) : [0, 0, 0];
        lastHeadGround = headGround;
        lastHipsGround = hipsGround;
        travelVel = add(scale(travelVel, Math.exp(-12 * dt)), scale(worldVel, 1 - Math.exp(-12 * dt)));

        if (!feet) {
            feet = {
                left: { pos: homeOf('left', hipsGround, bodyYaw, [0, 0, 0]), yaw: bodyYaw },
                right: { pos: homeOf('right', hipsGround, bodyYaw, [0, 0, 0]), yaw: bodyYaw }
            };
        }

        // how fast the body is moving through the world, in its own frame (right, forward)
        const virt = input.virtualVelocity || [0, 0];
        const vNow = [dot(worldVel, rgt) + virt[0], dot(worldVel, fwd) + virt[1]];
        // slow and heavy while the speed is steady (the stride should not wobble), quick when it really changes
        const change = Math.hypot(vNow[0] - vSmooth[0], vNow[1] - vSmooth[1]);
        const tcSpeed = lerp(0.2, 0.07, smooth01(change / 0.6));
        const k = 1 - Math.exp(-dt / tcSpeed);
        vSmooth = [lerp(vSmooth[0], vNow[0], k), lerp(vSmooth[1], vNow[1], k)];
        const speed = Math.hypot(vSmooth[0], vSmooth[1]);
        const toLocal = (pos) => {
            const d = sub(pos, hipsGround);
            return [dot(d, rgt), dot(d, fwd)];
        };
        const toWorld = (u, v, y) => [
            hipsGround[0] + rgt[0] * u + fwd[0] * v,
            y,
            hipsGround[2] + rgt[2] * u + fwd[2] * v
        ];

        // lowering the body (sitting down, a squat, getting up from a chair) moves the head sideways a little but
        // is not walking: no walk cycle starts while the head is going down fast or is well below standing height
        const goingDown = vyAvg < -0.18 || lowered > 0.22;
        if (!sitting && !walking && speed > o.walkStart && bendSmooth < 0.2 && !goingDown) {
            walking = true;
            plant = { left: null, right: null };
            releaseOff = { left: [0, 0], right: [0, 0] };
            blend = 0;
            stopTimer = 0;
            step = null;
            swingPitch = null;
            entry = { left: toLocal(feet.left.pos), right: toLocal(feet.right.pos) };
            // start with the foot that is further back in the air coming forward, the other one planted
            phase = entry.left[1] >= entry.right[1] ? 0.3 : 0.8;
        } else if (walking) {
            stopTimer = speed < o.walkStop || lowered > 0.32 || vyAvg < -0.35 ? stopTimer + dt : 0;
            if (stopTimer > 0.15) {
                walking = false;
                pitches = { left: 0, right: 0 };
                for (const f of [feet.left, feet.right]) f.pos[1] = 0;
            }
        }

        let hips = baseHips;
        // counterbalance: a person whose head drifts off their feet pushes the hips the other way to keep
        // their weight over the feet. Small leans (under 5 cm) do nothing, so standing still stays still;
        // a real bend already moves the hips back on its own, so this fades out as the bend takes over.
        let bTarget = [0, 0];
        if (o.counterbalance > 0 && feet && !walking && !sitting) {
            // measured from where the head rests over the feet (it stands 7 cm ahead of the hips), not from zero
            const ox = hp[0] - (feet.left.pos[0] + feet.right.pos[0]) / 2 - fwd[0] * 0.07;
            const oz = hp[2] - (feet.left.pos[2] + feet.right.pos[2]) / 2 - fwd[2] * 0.07;
            const mag = Math.hypot(ox, oz);
            const amount = Math.min(0.12, 0.22 * o.counterbalance * Math.max(0, Math.min(mag, 0.4) - 0.05)) * (1 - bendSmooth);
            if (mag > 1e-6) bTarget = [(-ox / mag) * amount, (-oz / mag) * amount];
        }
        const bk = 1 - Math.exp(-6 * dt);
        balance = [lerp(balance[0], bTarget[0], bk), lerp(balance[1], bTarget[1], bk)];
        if (Math.abs(balance[0]) + Math.abs(balance[1]) > 1e-5) hips = [hips[0] + balance[0], hips[1], hips[2] + balance[1]];
        let pelvisYaw = 0;
        let counterYaw = 0;
        let stepLength = 0;
        let ankleExtra = 0;
        let reachFactor = o.reachFactor;

        if (walking) {
            stanceYaw = bodyYaw;
            pivoting = false;
            const dirv = speed > 1e-6 ? [vSmooth[0] / speed, vSmooth[1] / speed] : [0, 1];
            const sideways = Math.abs(dirv[0]);
            const half = o.stanceHalfWidth + 0.1 * sideways; // a wider stance when moving sideways
            const { lane, toeLean } = gaitLanes(dirv);
            // sideways movement puts the feet farther from the hips, which leaves less room to stride
            const laneExtra = 0.0125 + 0.1415 * sideways;
            // a walker never locks the knees: the whole stride happens a little lower than standing
            const crouch = 0.03 * smooth01(speed / 0.4);
            const dy = baseHips[1] - crouch - 0.035 - (p.ankleHeight + 0.05);
            const reach = p.legLength * 0.995;
            const maxHalf = 0.9 * (dy >= reach ? 0.1 : Math.sqrt(reach * reach - dy * dy)) - laneExtra;
            // feet must not pass each other sideways: limit the sideways part of the stride to the room
            // between the lanes (fast small steps instead, like a step-close shuffle)
            const latRoom = 2 * half * Math.abs(lane[0]) - 0.115;
            const latCap = sideways > 0.3 ? Math.max(latRoom, 0.06) / (2 * sideways) : Infinity;
            const params = gaitParams(Math.max(speed, 0.05), Math.max(Math.min(maxHalf, latCap), 0.05));
            stepLength = params.stepLength;
            phase = (phase + dt * params.cycleRate) % 1;
            blend = Math.min(1, blend + dt / 0.2);
            const sm = smooth01(blend);
            const stepHeight = o.walkStepHeight * 1.25 * clamp(stepLength / 0.45, 0.25, 1);

            for (const side of ['left', 'right']) {
                const sign = side === 'left' ? -1 : 1;
                const theta = (phase + (side === 'left' ? 0 : 0.5)) % 1;
                const g = gaitFoot(theta, stepLength, stepHeight);
                const gu = sign * half * lane[0] + dirv[0] * g.along;
                const gv = sign * half * lane[1] + dirv[1] * g.along;
                const u = lerp(entry[side][0], gu, sm);
                const v = lerp(entry[side][1], gv, sm);
                let pos = toWorld(u, v, g.y * sm);
                if (theta < 0.6 && sm >= 1) {
                    // planted: hold the spot where the foot landed. The stride math only pulls it along when the
                    // speed estimate has drifted so far (over 5 cm) that holding it would look wrong.
                    if (!plant[side]) plant[side] = [pos[0], 0, pos[2]];
                    const off = [pos[0] - plant[side][0], 0, pos[2] - plant[side][2]];
                    const ol = len(off);
                    if (ol > 0.05) plant[side] = add(plant[side], scale(off, (ol - 0.05) / ol));
                    releaseOff[side] = [plant[side][0] - pos[0], plant[side][2] - pos[2]];
                    pos = [plant[side][0], g.y * sm, plant[side][2]];
                } else {
                    plant[side] = null;
                    // leaving the ground: the held spot and the stride curve can differ by a few cm. Fade that
                    // difference out over the swing instead of jumping, so the toe-off is smooth.
                    if (theta >= 0.6) {
                        const fade = 1 - smooth01((theta - 0.6) / 0.25);
                        pos = [pos[0] + releaseOff[side][0] * fade, pos[1], pos[2] + releaseOff[side][1] * fade];
                    } else {
                        releaseOff[side] = [0, 0];
                    }
                }
                feet[side] = { pos, yaw: bodyYaw - sign * 0.1 + toeLean * sm };
                pitches[side] = gaitPitch(theta) * sm;
            }

            // the body moves with the stride: lowest when both feet are down, shifted over the planted
            // foot, and the pelvis turns toward the leading leg while the chest turns the other way
            const amp = sm * smooth01(speed / 0.4);
            const fast = Math.min(speed, 1.6);
            const c1 = Math.cos(2 * Math.PI * phase);
            const bob = (0.02 + 0.016 * fast) * amp * ((1 + Math.cos(4 * Math.PI * phase)) / 2);
            const sway = (0.012 + 0.01 * fast) * amp * o.swayAmount * -Math.sin(2 * Math.PI * phase);
            pelvisYaw = -(0.04 + 0.03 * fast) * amp * c1;
            counterYaw = -0.6 * pelvisYaw;
            hips = add(add(sub(baseHips, [0, bob + crouch * sm, 0]), scale(rgt, sway)), [balance[0], 0, balance[1]]);
            ankleExtra = 0.05; // covers the most the ankle rises when the foot tilts (see ankle() below)
            reachFactor = 0.995;
        } else if (sitting) {
            // feet flat on the floor in front of the knees, a little apart
            const kf = 1 - Math.exp(-5 * dt);
            const reachF = Math.min(p.thigh * 0.95, 0.5);
            for (const side of ['left', 'right']) {
                const sign = side === 'left' ? -1 : 1;
                const want = add(add(hipsGround, scale(rgt, sign * 0.1)), scale(fwd, reachF));
                // feet stay where they are while you lean and shift on the seat, and only shuffle over when
                // the hips have moved well away from them (people do not drag their feet with every lean)
                let hold = sitFeet[side];
                if (!hold || Math.hypot(want[0] - hold[0], want[2] - hold[2]) > 0.14) hold = sitFeet[side] = [want[0], 0, want[2]];
                feet[side] = {
                    pos: [lerp(feet[side].pos[0], hold[0], kf), lerp(feet[side].pos[1], 0, kf), lerp(feet[side].pos[2], hold[2], kf)],
                    yaw: bodyYaw - sign * 0.08
                };
            }
        } else if (step) {
            step.t += dt / o.stepTime;
            const t = clamp(step.t, 0, 1);
            const eased = t * t * (3 - 2 * t);
            // swing a little outward so the moving foot clears the planted one
            const clear = (step.side === 'left' ? -1 : 1) * Math.sin(t * Math.PI) * 0.02;
            const pos = [
                lerp(step.from[0], step.to[0], eased) + rgt[0] * clear,
                Math.sin(t * Math.PI) * o.stepHeight,
                lerp(step.from[2], step.to[2], eased) + rgt[2] * clear
            ];
            feet[step.side] = { pos, yaw: stanceYaw };
            swingPitch = { side: step.side, pitch: stepPitch(t) };
            if (t >= 1) step = null;
        } else {
            const dl = len(sub(feet.left.pos, homeOf('left', hipsGround, bodyYaw, worldVel)));
            const dr = len(sub(feet.right.pos, homeOf('right', hipsGround, bodyYaw, worldVel)));
            if (bendSmooth < 0.25 && Math.max(dl, dr) > o.stepDistance) {
                const side = dl >= dr ? 'left' : 'right';
                step = {
                    side,
                    from: [...feet[side].pos],
                    to: homeOf(side, hipsGround, bodyYaw, worldVel),
                    t: 0
                };
            } else {
                feet.left.yaw = stanceYaw;
                feet.right.yaw = stanceYaw;
            }
        }

        if (!walking) {
            pitches = {
                left: step && swingPitch && swingPitch.side === 'left' ? swingPitch.pitch : 0,
                right: step && swingPitch && swingPitch.side === 'right' ? swingPitch.pitch : 0
            };
        }

        const frame = {
            origin: hipsGround,
            yaw: bodyYaw,
            hipY: hips[1],
            hipWidth: p.hipWidth,
            legLength: p.legLength,
            ankleHeight: p.ankleHeight + ankleExtra
        };
        const result = constrainFeet(feet.left, feet.right, frame, { ...o, reachFactor });
        // remember where the rules put the feet, so a planted foot stays where it was corrected to
        feet.left = { pos: [...result.left.pos], yaw: result.left.yaw };
        feet.right = { pos: [...result.right.pos], yaw: result.right.yaw };
        const footOut = (f, side) => ({
            pos: f.pos,
            yaw: f.yaw,
            pitch: pitches[side],
            rot: quatMul(quatFromYaw(f.yaw), quatFromAxisAngle([1, 0, 0], pitches[side]))
        });

        const hipsYaw = bodyYaw + pelvisYaw;
        const rgtP = rightOf(hipsYaw);
        const hipL = add(hips, scale(rgtP, -p.hipWidth / 2));
        const hipR = add(hips, scale(rgtP, p.hipWidth / 2));
        // the ankle sits higher than the sole when the foot is tilted heel-up or toe-up
        const ankle = (f, side) => add(f.pos, [0, p.ankleHeight + 0.09 * Math.abs(Math.sin(pitches[side])), 0]);
        // the knee points mostly where the foot points, but it is tied to the pelvis: it can only turn so far from it
        const poleOf = (f) => forwardOf(hipsYaw + clamp(wrap(f.yaw - hipsYaw) * o.kneeYawShare, -o.maxKneeYaw, o.maxKneeYaw));
        return {
            bodyYaw,
            hips: { pos: hips, yaw: hipsYaw },
            hipsBase: baseHips,
            hipsGround,
            hipJoints: { left: hipL, right: hipR },
            left: footOut(result.left, 'left'),
            right: footOut(result.right, 'right'),
            leftKnee: solveKnee(hipL, ankle(result.left, 'left'), p.thigh, p.shin, poleOf(result.left)),
            rightKnee: solveKnee(hipR, ankle(result.right, 'right'), p.thigh, p.shin, poleOf(result.right)),
            gait: { walking, phase, speed, stepLength, counterYaw, sitting, laying: false },
            fired: result.fired
        };
    }

    function reset() {
        bodyYaw = null;
        feet = null;
        bendSmooth = 0;
        sitting = false;
        sitTimer = 0;
        sitBlend = 0;
        sitAnchor = null;
        lastHeadPos = null;
        vyAvg = 0;
        step = null;
        lastHipsGround = null;
        lastHeadGround = null;
        swingPitch = null;
        pitches = { left: 0, right: 0 };
        walking = false;
        phase = 0;
        blend = 0;
        entry = null;
        stopTimer = 0;
        vSmooth = [0, 0];
        laying = false;
        layTimer = 0;
        layAxis = null;
        layBlend = 0;
        stanceYaw = null;
        pivoting = false;
        balance = [0, 0];
        plant = { left: null, right: null };
    }

    return { update, reset, proportions: p };
}
