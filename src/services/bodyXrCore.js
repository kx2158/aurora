/**
 * Turns the Quest body tracking joints (from the BodyXr helper) into hints for the estimator.
 *
 * The headset's joints live in its own OpenXR space, which is not SteamVR's space. So only the shape of the arm is used:
 * the offset from the shoulder joint to the elbow joint, turned by the yaw that makes the headset's own pose line up
 * with SteamVR's head pose. That tells the estimator which way the real elbow points. Everything else (positions,
 * legs) is left to the estimator.
 */
import { quatFromYaw, rotate, vec, yawOfRotation } from './footEstimator.js';

const { sub, clamp, wrap } = vec;

/** Joints older than this (ms) are ignored. */
export const XR_MAX_AGE = 400;

/**
 * data: what AppApi.ReadBodyXr returned (parsed). steamHead: { rot } the SteamVR head pose.
 * Returns { leftElbow, rightElbow, weight } (offsets in SteamVR's directions, meters) or null when there is nothing usable.
 */
export function buildXrHint(data, steamHead) {
    if (!data || data.state !== 5 || !data.joints || !Array.isArray(data.view) || !steamHead?.rot) return null;
    if (!(data.ageMs <= XR_MAX_AGE)) return null;
    const viewRot = data.view.slice(3, 7);
    if (![...viewRot, ...steamHead.rot].every(Number.isFinite)) return null;
    const dy = wrap(yawOfRotation(steamHead.rot) - yawOfRotation(viewRot));
    const turn = quatFromYaw(dy);
    const out = {};
    for (const side of ['left', 'right']) {
        const s = data.joints[side + 'Shoulder'];
        const e = data.joints[side + 'Elbow'];
        if (!s || !e) continue;
        const off = sub(e.slice(0, 3), s.slice(0, 3));
        if (!off.every(Number.isFinite)) continue;
        out[side + 'Elbow'] = rotate(turn, off);
    }
    if (!out.leftElbow && !out.rightElbow) return null;
    const conf = Number.isFinite(data.confidence) ? clamp(data.confidence, 0, 1) : 0.5;
    return { ...out, weight: 0.8 * conf };
}
