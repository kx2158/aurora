import { describe, expect, it } from 'vitest';

import { animFrame, hasAnimation } from '../chatboxAnim';

describe('chatbox animation', () => {
    it('spots animated pieces', () => {
        expect(hasAnimation(['hello {dots}'])).toBe(true);
        expect(hasAnimation(['{time} | {world}'])).toBe(false);
    });
    it('cycles frames', () => {
        expect(animFrame('dots', 0)).toBe('');
        expect(animFrame('dots', 3)).toBe('...');
        expect(animFrame('dots', 4)).toBe('');
        expect(animFrame('cursor', 1)).not.toBe(animFrame('cursor', 0));
        expect(animFrame('nope', 2)).toBe('');
    });
});
