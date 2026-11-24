import { describe, expect, it } from 'vitest';

import { typeoutDuration, typeoutSteps } from '../chatboxTypeout';

describe('chatbox type-out', () => {
    it('clears, shows the typing bubble, then adds one word per gap', () => {
        const steps = typeoutSteps('hello big world', { typingMs: 5000, gapMs: 1000 });
        expect(steps[0]).toEqual({ at: 0, kind: 'clear' });
        expect(steps[1]).toMatchObject({ kind: 'typing', on: true, at: 0 });
        expect(steps[2]).toMatchObject({ kind: 'typing', on: false, at: 5000 });
        const texts = steps.filter((s) => s.kind === 'text');
        expect(texts.map((s) => s.text)).toEqual(['hello', 'hello big', 'hello big world']);
        expect(texts.map((s) => s.at)).toEqual([5000, 6000, 7000]);
        expect(typeoutDuration(steps)).toBe(7000);
    });
    it('ends on exactly the finished text', () => {
        const last = typeoutSteps('a  b\nc').filter((s) => s.kind === 'text').pop();
        expect(last.text).toBe('a  b\nc');
    });
    it('handles empty text', () => {
        expect(typeoutSteps('').filter((s) => s.kind === 'text')).toEqual([]);
    });
});
