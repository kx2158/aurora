/**
 * Pure logic for the space drag card: settings limits and the status-to-badge decision.
 * Mirrors DragSettings.Clamped() in SpaceDrag/Settings.cs, so what the card shows is what the helper uses.
 */
export const DRAG_LIMITS = { multiplier: [0.25, 6] };
export const HANDS = ['left', 'right', 'both'];

export const defaultDragSettings = () => ({
    enabled: false,
    hand: 'both',
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
        enabled: s.enabled === true,
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
    if (!settings?.enabled) return 'off';
    if (!status.running) return 'starting';
    if (status.error) return 'error';
    if (!status.steamVr) return 'no-steamvr';
    if (status.dragging) return 'dragging';
    if (!status.bound) return 'unbound';
    return 'ready';
}
