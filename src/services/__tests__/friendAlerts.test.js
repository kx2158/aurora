import { describe, expect, it } from 'vitest';

import { ALERT_KINDS, alertKindOf, cleanMarks, shouldAlert, withKind } from '../friendAlerts';

describe('friendAlerts', () => {
    it('maps events to alert kinds', () => {
        expect(alertKindOf({ type: 'Online' })).toBe('online');
        expect(alertKindOf({ type: 'Offline' })).toBe('offline');
        expect(alertKindOf({ type: 'GPS' })).toBe('moves');
        expect(alertKindOf({ type: 'OnPlayerJoined' })).toBe('joinsMe');
        expect(alertKindOf({ type: 'boop' })).toBe('boop');
        expect(alertKindOf({ type: 'Status' })).toBe('status');
        expect(alertKindOf({ type: 'Avatar' })).toBe('');
        expect(alertKindOf(undefined)).toBe('');
    });

    it('only alerts for marked friends and marked kinds', () => {
        const marks = { usr_a: ['online', 'boop'] };
        expect(shouldAlert(marks, 'usr_a', { type: 'Online' })).toBe(true);
        expect(shouldAlert(marks, 'usr_a', { type: 'boop' })).toBe(true);
        expect(shouldAlert(marks, 'usr_a', { type: 'Offline' })).toBe(false);
        expect(shouldAlert(marks, 'usr_b', { type: 'Online' })).toBe(false);
        expect(shouldAlert(marks, '', { type: 'Online' })).toBe(false);
    });

    it('switches kinds on and off without touching the original', () => {
        const a = {};
        const b = withKind(a, 'usr_a', 'boop', true);
        const c = withKind(b, 'usr_a', 'online', true);
        expect(a).toEqual({});
        expect(c.usr_a).toEqual(['online', 'boop']);
        const d = withKind(c, 'usr_a', 'online', false);
        expect(d.usr_a).toEqual(['boop']);
        expect('usr_a' in withKind(d, 'usr_a', 'boop', false)).toBe(false);
        expect(withKind(a, 'usr_a', 'nonsense', true)).toBe(a);
    });

    it('cleans stored marks', () => {
        const out = cleanMarks({
            usr_ok: ['boop', 'bogus', 'online'],
            nope: ['online'],
            usr_empty: [],
            usr_bad: 'online'
        });
        expect(out).toEqual({ usr_ok: ['online', 'boop'] });
        expect(cleanMarks(null)).toEqual({});
        expect(cleanMarks([])).toEqual({});
        expect(ALERT_KINDS.length).toBe(6);
    });
});
