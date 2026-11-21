import { describe, expect, it } from 'vitest';

import { defaultDragSettings, DRAG_LIMITS, dragState, enabledFromStatus, sanitizeDragSettings } from '../spaceDragCore.js';

describe('space drag settings', () => {
    it('falls back to defaults for junk', () => {
        expect(sanitizeDragSettings(null)).toEqual(defaultDragSettings());
        expect(sanitizeDragSettings({ hand: 'foot', multiplier: 'abc' })).toEqual(defaultDragSettings());
    });
    it('clamps the multiplier', () => {
        expect(sanitizeDragSettings({ multiplier: 100 }).multiplier).toBe(DRAG_LIMITS.multiplier[1]);
        expect(sanitizeDragSettings({ multiplier: 0 }).multiplier).toBe(DRAG_LIMITS.multiplier[0]);
        expect(sanitizeDragSettings({ multiplier: NaN }).multiplier).toBe(1);
    });
    it('keeps valid values', () => {
        const s = sanitizeDragSettings({ enabled: true, hand: 'left', multiplier: 2.5, allowVertical: false, comfort: true });
        expect(s).toEqual({ enabled: true, hand: 'left', multiplier: 2.5, allowVertical: false, comfort: true });
    });
});

describe('space drag defaults', () => {
    it('starts on, left hand', () => {
        expect(defaultDragSettings()).toMatchObject({ enabled: true, hand: 'left' });
        expect(sanitizeDragSettings({}).enabled).toBe(true);
        expect(sanitizeDragSettings({ enabled: false }).enabled).toBe(false);
    });
});

describe('space drag SteamVR switch sync', () => {
    const live = { running: true, enabled: false };
    it('adopts a flip made in the dashboard', () => {
        expect(enabledFromStatus(live, { enabled: true }, 10000)).toBe(false);
    });
    it('ignores stale status right after a local change', () => {
        expect(enabledFromStatus(live, { enabled: true }, 500)).toBeNull();
    });
    it('ignores equal values and dead helpers', () => {
        expect(enabledFromStatus(live, { enabled: false }, 10000)).toBeNull();
        expect(enabledFromStatus({ running: false, enabled: false }, { enabled: true }, 10000)).toBeNull();
        expect(enabledFromStatus(null, { enabled: true }, 10000)).toBeNull();
    });
    it('shows off when the helper says disabled', () => {
        const up = { installed: true, running: true, steamVr: true, bound: true, enabled: false };
        expect(dragState(up, { enabled: true })).toBe('off');
    });
});

describe('space drag state', () => {
    const on = { enabled: true };
    const up = { installed: true, running: true, steamVr: true, bound: true };
    it('walks through the states', () => {
        expect(dragState({ installed: false }, on)).toBe('missing');
        expect(dragState(up, { enabled: false })).toBe('off');
        expect(dragState({ ...up, running: false }, on)).toBe('starting');
        expect(dragState({ ...up, steamVr: false }, on)).toBe('no-steamvr');
        expect(dragState({ ...up, bound: false }, on)).toBe('unbound');
        expect(dragState(up, on)).toBe('ready');
        expect(dragState({ ...up, dragging: true }, on)).toBe('dragging');
        expect(dragState({ ...up, error: 'x' }, on)).toBe('error');
    });
});
