/**
 * Pure logic for the space drag card: settings limits and the status-to-badge decision.
 * Mirrors DragSettings.Clamped() in SpaceDrag/Settings.cs, so what the card shows is what the helper uses.
 */
import { forwardOf, rightOf, yawOfRotation } from './footEstimator.js';

export const DRAG_LIMITS = { multiplier: [0.25, 6] };
export const HANDS = ['left', 'right', 'both'];

export const defaultDragSettings = () => ({
    enabled: true,
    hand: 'left',
    multiplier: 1,
    // up and down dragging is off by default: pulling your hand down would lift you
    vertical: false,
    comfort: false
});

const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
};

export function sanitizeDragSettings(input) {
    const d = defaultDragSettings();
    const s = input && typeof input === 'object' ? input : {};
    const [lo, hi] = DRAG_LIMITS.multiplier;
    return {
        enabled: s.enabled === undefined ? d.enabled : s.enabled === true,
        hand: HANDS.includes(s.hand) ? s.hand : d.hand,
        multiplier: Math.min(hi, Math.max(lo, num(s.multiplier, d.multiplier))),
        vertical: s.vertical === true,
        comfort: s.comfort === true
    };
}

/**
 * Turns the AppApi status into one state for the card.
 * 'missing' (build has no helper), 'off', 'starting' (helper not up yet), 'no-steamvr', 'unbound' (SteamVR has no
 * grab binding for it yet), 'ready', 'dragging', 'error'.
 */
export function dragState(status, settings) {
    if (!status) return 'off';
    if (!status.installed) return 'missing';
    if (!status.running) return 'starting';
    if (!settings?.enabled || status.enabled === false) return 'off';
    if (status.error) return 'error';
    if (!status.steamVr) return 'no-steamvr';
    if (status.dragging) return 'dragging';
    if (!status.bound) return 'unbound';
    return 'ready';
}

/**
 * The SteamVR dashboard switch flips "enabled" inside the helper. Returns the value Aurora should adopt, or null
 * when there is nothing to adopt: no live status, same value, or Aurora changed it itself a moment ago (the helper's
 * status lags the settings file by about a second).
 */
export function enabledFromStatus(status, settings, msSinceLocalChange) {
    if (!status || !status.running || typeof status.enabled !== 'boolean') return null;
    if (msSinceLocalChange < 3000) return null;
    return status.enabled === settings?.enabled ? null : status.enabled;
}

/** Arms crossed over the chest: each hand on the other side of the body, at chest height, close in front. */
export function armsCrossed(head, left, right) {
    if (!head || !left || !right) return false;
    const yaw = yawOfRotation(head.rot);
    const r = rightOf(yaw);
    const f = forwardOf(yaw);
    const rel = (h) => [h.pos[0] - head.pos[0], h.pos[1] - head.pos[1], h.pos[2] - head.pos[2]];
    const L = rel(left);
    const R = rel(right);
    const side = (v) => v[0] * r[0] + v[2] * r[2];
    const ahead = (v) => v[0] * f[0] + v[2] * f[2];
    if (!(side(L) > 0.04 && side(R) < -0.04)) return false;
    for (const v of [L, R]) {
        if (v[1] < -0.7 || v[1] > -0.12) return false;
        if (ahead(v) > 0.42 || ahead(v) < -0.15) return false;
    }
    return true;
}

