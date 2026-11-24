import { describe, expect, it } from 'vitest';

import { clampAnim } from '../auroraChatbox';

describe('chatbox animation speed', () => {
    it('stays between 1 and 5 seconds', () => {
        expect(clampAnim(100)).toBe(1000);
        expect(clampAnim(10)).toBe(1000);
        expect(clampAnim(1200)).toBe(1200);
        expect(clampAnim(99999)).toBe(5000);
        expect(clampAnim('abc')).toBe(1200);
    });
});

describe('chatbox background marker', () => {
    it('adds the marker only when asked, and stays inside 144 characters', async () => {
        const { withBackgroundSetting, NO_BG_SUFFIX } = await import('../auroraChatbox');
        expect(withBackgroundSetting('hi', false)).toBe('hi');
        expect(withBackgroundSetting('hi', true)).toBe('hi' + NO_BG_SUFFIX);
        expect(withBackgroundSetting('x'.repeat(200), true).length).toBe(144);
        expect(withBackgroundSetting('x'.repeat(200), false).length).toBe(144);
    });
});

describe('chatbox padding', () => {
    it('puts spaces in front and still fits 144 characters with the marker', async () => {
        const { withBackgroundSetting, NO_BG_SUFFIX } = await import('../auroraChatbox');
        expect(withBackgroundSetting('hi', false, 3)).toBe('   hi');
        expect(withBackgroundSetting('x'.repeat(200), true, 5).length).toBe(144);
        expect(withBackgroundSetting('hi', true, 2)).toBe('  hi' + NO_BG_SUFFIX);
    });
});
