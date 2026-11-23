import { describe, expect, it } from 'vitest';

import {
    DAY,
    buildRows,
    changesFileText,
    exportText,
    filterRows,
    hangoutBucket,
    hangoutCounts,
    languageCounts,
    languagesOf,
    matchChanges,
    matchNames,
    parseChangesFile,
    recentChanges,
    mutualBucket,
    organizeFriends,
    suggestUnfriend,
    unfriendScore
} from '../friendInsights';

const NOW = Date.parse('2026-11-22T12:00:00Z');
const ago = (days) => new Date(NOW - days * DAY).toISOString();

function ctx(id, ref, extra = {}) {
    return { id, ref: { displayName: id, ...ref }, ...extra };
}

describe('friendInsights', () => {
    it('reads languages from $languages or tags', () => {
        expect(languagesOf({ $languages: [{ key: 'eng' }, { key: 'slk' }] })).toEqual(['eng', 'slk']);
        expect(languagesOf({ tags: ['language_deu', 'x'] })).toEqual(['deu']);
        expect(languagesOf({})).toEqual([]);
    });

    it('builds rows and hides mutuals for opted out friends', () => {
        const rows = buildRows(
            [
                ctx('a', { $lastSeen: ago(2), $mutualCount: 7, $timeSpent: 1000 }),
                ctx('b', { $lastSeen: ago(2), $mutualCount: 7, $mutualOptedOut: true }),
                { id: 'c' }
            ],
            { now: NOW }
        );
        expect(rows).toHaveLength(2);
        expect(rows[0].mutual).toBe(7);
        expect(rows[1].mutual).toBeNull();
        expect(mutualBucket(rows[1])).toBe('hidden');
        expect(rows[0].daysAway).toBe(2);
    });

    it('buckets by last hangout', () => {
        expect(hangoutBucket({ lastSeen: NOW - 3 * DAY }, NOW)).toBe('week');
        expect(hangoutBucket({ lastSeen: NOW - 20 * DAY }, NOW)).toBe('month');
        expect(hangoutBucket({ lastSeen: NOW - 400 * DAY }, NOW)).toBe('old');
        expect(hangoutBucket({ lastSeen: 0 }, NOW)).toBe('old');
    });

    it('buckets by mutual count', () => {
        expect(mutualBucket({ mutual: 0 })).toBe('none');
        expect(mutualBucket({ mutual: 3 })).toBe('few');
        expect(mutualBucket({ mutual: 10 })).toBe('some');
        expect(mutualBucket({ mutual: 40 })).toBe('many');
    });

    it('scores a long gone stranger high and protects favorites', () => {
        const base = { lastSeen: NOW - 500 * DAY, timeSpent: 0, joinCount: 0, mutual: 0, since: NOW - 800 * DAY };
        const r = unfriendScore(base, NOW);
        expect(r.score).toBeGreaterThanOrEqual(90);
        expect(r.reasons).toContain('inactive_year');
        expect(unfriendScore({ ...base, favorite: true }, NOW).score).toBe(0);
        expect(unfriendScore({ ...base, hasMemo: true }, NOW).score).toBe(0);
        expect(unfriendScore({ ...base, since: NOW - 5 * DAY }, NOW).score).toBe(0);
    });

    it('does not suggest an active friend', () => {
        const rows = buildRows(
            [
                ctx('close', { $lastSeen: ago(1), $timeSpent: 50 * 3600000, $joinCount: 90, $mutualCount: 30 }),
                ctx('gone', { $lastSeen: ago(600), $timeSpent: 0, $mutualCount: 0, date_joined: '2020-01-01' })
            ],
            { now: NOW }
        );
        const out = suggestUnfriend(rows, { now: NOW });
        expect(out.map((x) => x.row.id)).toEqual(['gone']);
    });

    it('filters and sorts', () => {
        const rows = buildRows(
            [
                ctx('anna', { $lastSeen: ago(2), $languages: [{ key: 'eng' }], $mutualCount: 20 }),
                ctx('bob', { $lastSeen: ago(200), $languages: [{ key: 'deu' }], $mutualCount: 0 }),
                ctx('cy', { $lastSeen: ago(10), $mutualCount: 3 })
            ],
            { now: NOW }
        );
        expect(filterRows(rows, { now: NOW }).map((r) => r.id)).toEqual(['anna', 'cy', 'bob']);
        expect(filterRows(rows, { language: 'deu', now: NOW }).map((r) => r.id)).toEqual(['bob']);
        expect(filterRows(rows, { language: 'none', now: NOW }).map((r) => r.id)).toEqual(['cy']);
        expect(filterRows(rows, { mutual: 'none', now: NOW }).map((r) => r.id)).toEqual(['bob']);
        expect(filterRows(rows, { search: 'AN', now: NOW }).map((r) => r.id)).toEqual(['anna']);
        expect(filterRows(rows, { sort: 'mutual', now: NOW })[0].id).toBe('anna');
        expect(hangoutCounts(rows, NOW).week).toBe(1);
        expect(languageCounts(rows)[0].count).toBe(1);
    });

    it('matches a typed list of usernames', () => {
        const rows = buildRows([ctx('Anna', {}), ctx('Bob', {}), ctx('bob', {}), ctx('Cy', {})], { now: NOW });
        const r = matchNames(rows, ' anna ,CY, nobody, bob,\nanna');
        expect(r.matched.map((x) => x.id)).toEqual(['Anna', 'Cy']);
        expect(r.missing).toEqual(['nobody']);
        expect(r.ambiguous).toEqual(['bob']);
    });

    it('exports names with their bios', () => {
        const rows = buildRows([ctx('Anna', { bio: 'hi\r\nthere' }), ctx('Bob', {})], { now: NOW });
        const text = exportText(rows);
        expect(text).toContain('Anna\nhi\nthere');
        expect(text).toContain('Bob\n(no bio)');
    });
    it('never scores, suggests or matches a locked friend', () => {
        const ctxs = [ctx('gone', { $lastSeen: ago(900), $mutualCount: 0 }), ctx('safe', { $lastSeen: ago(900), $mutualCount: 0 })];
        const rows = buildRows(ctxs, { now: NOW, locked: new Set(['safe']) });
        expect(rows.find((r) => r.id === 'safe').locked).toBe(true);
        expect(unfriendScore(rows.find((r) => r.id === 'safe'), NOW).score).toBe(0);
        expect(suggestUnfriend(rows, { now: NOW }).map((x) => x.row.id)).toEqual(['gone']);
        const m = matchNames(rows, 'gone, safe');
        expect(m.matched.map((r) => r.id)).toEqual(['gone']);
        expect(m.skippedLocked).toEqual(['safe']);
    });

    it('organizes friends into keep, maybe and cut', () => {
        const rows = buildRows(
            [
                ctx('stranger', { $lastSeen: ago(900), $mutualCount: 0 }),
                ctx('pal', { $lastSeen: ago(1), $mutualCount: 20, $timeSpent: 10 * 3600000, $joinCount: 30 }),
                ctx('locked', { $lastSeen: ago(900), $mutualCount: 0 })
            ],
            { now: NOW, locked: new Set(['locked']) }
        );
        const out = organizeFriends(rows, { now: NOW });
        expect(out.cut.map((x) => x.row.id)).toEqual(['stranger']);
        expect(out.keep.map((x) => x.row.id)).toEqual(['locked', 'pal']);
        expect(out.maybe).toEqual([]);
    });

    it('lists recent changes, latest per person, inside the window', () => {
        const h = [
            { type: 'Friend', userId: 'usr_a', displayName: 'A', created_at: ago(1) },
            { type: 'Unfriend', userId: 'usr_b', displayName: 'B', created_at: ago(2) },
            { type: 'Friend', userId: 'usr_b', displayName: 'B', created_at: ago(40) },
            { type: 'Unfriend', userId: 'usr_c', displayName: 'C', created_at: ago(60) },
            { type: 'DisplayName', userId: 'usr_d', displayName: 'D', created_at: ago(1) }
        ];
        const un = recentChanges(h, { types: ['Unfriend'], days: 30, now: NOW });
        expect(un.map((e) => e.userId)).toEqual(['usr_b']);
        expect(recentChanges(h, { types: ['Unfriend'], days: 0, now: NOW }).map((e) => e.userId)).toEqual([
            'usr_b',
            'usr_c'
        ]);
        expect(recentChanges(h, { days: 30, now: NOW }).map((e) => e.userId)).toEqual(['usr_a', 'usr_b']);
    });

    it('round trips a changes file and matches friends by id', () => {
        const id1 = 'usr_11111111-1111-1111-1111-111111111111';
        const id2 = 'usr_22222222-2222-2222-2222-222222222222';
        const text = changesFileText(
            [
                { userId: id1, name: 'One', type: 'Unfriend', at: NOW },
                { userId: id2, name: 'Two', type: 'Friend', at: NOW }
            ],
            NOW
        );
        const entries = parseChangesFile(text);
        expect(entries.map((e) => e.type)).toEqual(['Unfriend', 'Friend']);
        const rows = buildRows([ctx(id1, {}), ctx(id2, {}), ctx('usr_other', {})], { now: NOW });
        const m = matchChanges(rows, entries, ['Unfriend']);
        expect(m.matched.map((r) => r.id)).toEqual([id1]);
        expect(m.notFriends).toBe(0);
        expect(matchChanges([], entries, ['Unfriend']).notFriends).toBe(1);
    });

    it('reads a plain list of user ids and ignores junk', () => {
        const id = 'usr_33333333-3333-3333-3333-333333333333';
        expect(parseChangesFile(`hello ${id}, ${id}\nnope`).map((e) => e.userId)).toEqual([id]);
        expect(parseChangesFile('{"app":"other"}')).toEqual([]);
        expect(parseChangesFile('')).toEqual([]);
    });
});
