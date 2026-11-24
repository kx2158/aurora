import { describe, expect, it } from 'vitest';

import { DEFAULT_MAX, hasInvitesLeft } from '../autoInvite';

describe('hasInvitesLeft', () => {
    it('counts against the limit', () => {
        expect(hasInvitesLeft({ max: 2, sent: 1 })).toBe(true);
        expect(hasInvitesLeft({ max: 2, sent: 2 })).toBe(false);
    });
    it('falls back to the default limit', () => {
        expect(hasInvitesLeft({ id: 'usr_1' })).toBe(true);
        expect(hasInvitesLeft({ sent: DEFAULT_MAX })).toBe(false);
    });
    it('is false for nobody', () => {
        expect(hasInvitesLeft(undefined)).toBe(false);
    });
});
