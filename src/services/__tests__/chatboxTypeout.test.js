import { describe, expect, it } from 'vitest';

import { revealText, typewriterPlan } from '../chatboxTypeout';

describe('chatbox typewriter', () => {
    it('reveals the first part of a text', () => {
        expect(revealText('hello', 0)).toBe('');
        expect(revealText('hello', 0.5)).toBe('hel');
        expect(revealText('hello', 1)).toBe('hello');
        expect(revealText('', 0.5)).toBe('');
    });
    it('does not split emoji', () => {
        expect(revealText('a😀b', 0.5)).toBe('a😀');
    });
    it('types, holds, then erases, with updates at least one gap apart', () => {
        const { steps, total } = typewriterPlan({ typeMs: 2000, holdMs: 5000, eraseMs: 2000, gapMs: 1000 });
        expect(steps[0]).toEqual({ at: 0, fraction: 0.5, typing: true });
        expect(steps[1]).toEqual({ at: 1000, fraction: 1 });
        const off = steps.find((s) => s.typing === false);
        expect(off.at).toBe(2000);
        const erase = steps.filter((s) => s.at >= 7000);
        expect(erase.map((s) => s.fraction)).toEqual([0.5, 0]);
        expect(total).toBe(9000);
        for (let i = 1; i < steps.length; i++) {
            expect(steps[i].at - steps[i - 1].at).toBeGreaterThanOrEqual(1000);
        }
    });
    it('keeps at least one chunk when the phase is shorter than the gap', () => {
        const { steps } = typewriterPlan({ typeMs: 500, holdMs: 500, eraseMs: 500, gapMs: 1500 });
        expect(steps.filter((s) => s.fraction === 1).length).toBeGreaterThan(0);
        expect(steps.some((s) => s.fraction === 0)).toBe(true);
    });
});
