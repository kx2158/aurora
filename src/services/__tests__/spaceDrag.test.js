import { describe, expect, it } from 'vitest';

import { defaultDragSettings, DRAG_LIMITS, dragState, sanitizeDragSettings } from '../spaceDragCore.js';

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
