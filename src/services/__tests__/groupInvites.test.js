import { describe, expect, it } from 'vitest';

import { declineResponseType } from '../groupInvites';

describe('declineResponseType', () => {
    it('finds the decline option', () => {
        expect(declineResponseType([{ type: 'accept' }, { type: 'decline' }])).toBe('decline');
        expect(declineResponseType([{ type: 'Reject' }])).toBe('Reject');
    });
    it('returns null when there is none', () => {
        expect(declineResponseType([{ type: 'accept' }])).toBe(null);
        expect(declineResponseType(undefined)).toBe(null);
    });
});
