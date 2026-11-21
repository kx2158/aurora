/**
 * Pure logic for the space drag card: settings limits and the status-to-badge decision.
 * Mirrors DragSettings.Clamped() in SpaceDrag/Settings.cs, so what the card shows is what the helper uses.
 */
export const DRAG_LIMITS = { multiplier: [0.25, 6] };
export const HANDS = ['left', 'right', 'both'];

export const defaultDragSettings = () => ({
    enabled: true,
    hand: 'left',
    multiplier: 1,
    allowVertical: true,
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
        allowVertical: s.allowVertical === undefined ? d.allowVertical : s.allowVertical === true,
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
