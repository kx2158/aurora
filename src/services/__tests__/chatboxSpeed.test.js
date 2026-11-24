import { describe, expect, it } from 'vitest';

import { clampAnim } from '../auroraChatbox';

describe('chatbox animation speed', () => {
    it('never goes below what VRChat allows, nor above five seconds', () => {
        expect(clampAnim(100)).toBe(1000);
        expect(clampAnim(1200)).toBe(1200);
        expect(clampAnim(99999)).toBe(5000);
        expect(clampAnim('abc')).toBe(1200);
    });
});
