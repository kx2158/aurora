import { describe, expect, it } from 'vitest';

import { cleanDecisions, withDecision } from '../decisionNotes';

describe('decisionNotes', () => {
    it('keeps a mark and a note', () => {
        const a = withDecision({ friend: {}, group: {} }, 'friend', 'usr_1', { m: 'cut', n: 'never talk' });
        expect(a.friend.usr_1).toEqual({ m: 'cut', n: 'never talk' });
    });
    it('does not change the object it was given', () => {
        const base = { friend: {}, group: {} };
        withDecision(base, 'group', 'grp_1', { m: 'keep' });
        expect(base.group).toEqual({});
    });
    it('removes an entry once mark and note are both empty', () => {
        let a = withDecision({ friend: {}, group: {} }, 'group', 'grp_1', { m: 'keep', n: 'x' });
        a = withDecision(a, 'group', 'grp_1', { m: '', n: '' });
        expect(a.group.grp_1).toBeUndefined();
    });
    it('cleans broken stored data', () => {
        const c = cleanDecisions({ friend: { a: { m: 'bogus', n: 5 }, b: { m: 'keep', n: 'ok' }, c: 3 }, group: 'x' });
        expect(c.friend).toEqual({ b: { m: 'keep', n: 'ok' } });
        expect(c.group).toEqual({});
    });
});
