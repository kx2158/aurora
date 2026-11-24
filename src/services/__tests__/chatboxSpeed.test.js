import { describe, expect, it } from 'vitest';

import { clampAnim } from '../auroraChatbox';

describe('chatbox animation speed', () => {
    it('can be pushed down to 100 ms, but not lower, and not above five seconds', () => {
        expect(clampAnim(100)).toBe(100);
        expect(clampAnim(10)).toBe(100);
        expect(clampAnim(1200)).toBe(1200);
        expect(clampAnim(99999)).toBe(5000);
        expect(clampAnim('abc')).toBe(100);
    });
});
