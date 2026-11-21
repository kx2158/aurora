import { PALETTES, buildParts, drawAvatar, paletteFromTheme } from '../bodyAvatarRender.js';
import { createBodyEstimator } from '../bodyEstimator.js';
import { quatFromYaw } from '../footEstimator.js';

const fakeCtx = () => {
    const calls = { n: 0 };
    const ctx = new Proxy(
        {},
        {
            get: (t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k === '__calls' ? calls : () => { calls.n++; }),
            set: () => true
        }
    );
    return ctx;
};
const pose = (hands = true) => {
    const hand = (x) => ({ pos: [x, 1.1, -0.2], rot: quatFromYaw(0) });
    const input = { head: { pos: [0, 1.65, 0], rot: quatFromYaw(0) }, ...(hands ? { leftHand: hand(-0.3), rightHand: hand(0.3) } : {}) };
    const body = createBodyEstimator({ eyeHeight: 1.65 });
    let out;
    for (let i = 0; i < 30; i++) out = body.update(input, 1 / 90);
    return { out, input };
};

describe('avatar renderer', () => {
    test('a full pose has a head, torso, two legs, feet and two arms', () => {
        const { out, input } = pose();
        const { parts, joints } = buildParts(out, input);
        expect(parts.filter((p) => p.role === 'head').length).toBe(1);
        expect(parts.filter((p) => p.role === 'hand').length).toBe(2);
        expect(joints.length).toBe(8); // hips, chest, two knees, two feet, two elbows
    });
    test('without hands there are no arms but it still draws', () => {
        const { out, input } = pose(false);
        const { parts } = buildParts(out, input);
        expect(parts.some((p) => p.role === 'hand')).toBe(false);
        const ctx = fakeCtx();
        drawAvatar(ctx, { w: 300, h: 300, view: 'front', body: out, input });
        expect(ctx.__calls.n > 20).toBe(true);
    });
    test('every view and both looks draw without throwing', () => {
        const { out, input } = pose();
        for (const view of ['front', 'side', 'top']) {
            for (const style of ['neon', 'clean']) {
                const ctx = fakeCtx();
                drawAvatar(ctx, { w: 300, h: 300, view, body: out, input, style });
                expect(ctx.__calls.n > 50).toBe(true);
            }
        }
    });
    test('the theme palette takes the accent colour and falls back to neon', () => {
        const p = paletteFromTheme((n) => (n === '--a-accent' ? '#123456' : ''));
        expect(p.core).toBe('#123456');
        expect(p.left).toBe(PALETTES.neon.left);
    });
});
