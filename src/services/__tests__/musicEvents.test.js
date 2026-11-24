import { describe, expect, it } from 'vitest';

import { isMusicEvent, upcomingMusic } from '../musicEvents';

const NOW = Date.parse('2026-11-24T12:00:00Z');
const ev = (id, title, startsAt, endsAt, category = '') => ({ id, title, startsAt, endsAt, category });

describe('music events', () => {
    it('recognises the music category and common music words', () => {
        expect(isMusicEvent({ category: 'music', title: 'x' })).toBe(true);
        expect(isMusicEvent({ category: 'other', title: 'Friday DJ night' })).toBe(true);
        expect(isMusicEvent({ category: 'other', title: 'Avatar swap' })).toBe(false);
    });
    it('keeps running and upcoming events, soonest first, without repeats or finished ones', () => {
        const list = [
            ev('b', 'Later', '2026-11-25T20:00:00Z', '2026-11-25T22:00:00Z', 'music'),
            ev('a', 'Running now', '2026-11-24T11:00:00Z', '2026-11-24T13:00:00Z', 'music'),
            ev('a', 'Running now', '2026-11-24T11:00:00Z', '2026-11-24T13:00:00Z', 'music'),
            ev('c', 'Over', '2026-11-23T11:00:00Z', '2026-11-23T13:00:00Z', 'music')
        ];
        const out = upcomingMusic(list, NOW);
        expect(out.map((e) => e.id)).toEqual(['a', 'b']);
        expect(out[0].live).toBe(true);
    });
});
