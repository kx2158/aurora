import { buildTrackerMessages, encodeOscBundle, encodeOscMessage, toUnityEuler, toUnityPosition, TRACKER_ORDER } from '../vrchatTrackers.js';
import { createBodyEstimator } from '../bodyEstimator.js';
import { quatFromYaw } from '../footEstimator.js';

describe('vrchat trackers', () => {
    test('positions flip z', () => {
        expect(toUnityPosition([1, 2, -3])).toEqual([1, 2, 3]);
    });
    test('identity rotation is zero degrees', () => {
        const e = toUnityEuler([0, 0, 0, 1]);
        expect(Math.abs(e[0]) + Math.abs(e[1]) + Math.abs(e[2]) < 1e-6).toBe(true);
    });
    test('a turn to the left in SteamVR is a negative turn in Unity', () => {
        const e = toUnityEuler(quatFromYaw(Math.PI / 2));
        expect(Math.abs(e[1] + 90) < 1e-6).toBe(true);
    });
    test('eight trackers is the most, and the head goes with them', () => {
        expect(TRACKER_ORDER.length).toBe(8);
        const body = createBodyEstimator({ eyeHeight: 1.65 });
        const head = { pos: [0, 1.65, 0], rot: quatFromYaw(0) };
        const hand = (x) => ({ pos: [x, 1.1, -0.2], rot: quatFromYaw(0) });
        let out;
        for (let i = 0; i < 30; i++) out = body.update({ head, leftHand: hand(-0.3), rightHand: hand(0.3) }, 1 / 90);
        const messages = buildTrackerMessages(out, head);
        expect(messages.length).toBe(18); // 8 trackers and the head, position and rotation each
        const slots = new Set(messages.map((m) => m.address.split('/')[3]));
        expect(slots.size).toBe(9);
        expect(slots.has('8') && slots.has('head')).toBe(true);
    });
    test('an arm without a hand leaves its elbow out', () => {
        const body = createBodyEstimator({ eyeHeight: 1.65 });
        const head = { pos: [0, 1.65, 0], rot: quatFromYaw(0) };
        const out = body.update({ head }, 1 / 90);
        expect(buildTrackerMessages(out, head).length).toBe(14);
    });
    test('osc messages are padded to four bytes and carry big endian floats', () => {
        const m = encodeOscMessage('/tracking/trackers/1/position', [1, 2, 3]);
        expect(m.length % 4).toBe(0);
        const view = new DataView(m.buffer);
        expect(view.getFloat32(m.length - 12, false)).toBe(1);
        expect(view.getFloat32(m.length - 4, false)).toBe(3);
    });
    test('a bundle starts with #bundle and every element has its size in front', () => {
        const msgs = [
            { address: '/a', values: [1] },
            { address: '/bb', values: [1, 2] }
        ];
        const b = encodeOscBundle(msgs);
        expect(String.fromCharCode(...b.slice(0, 7))).toBe('#bundle');
        const view = new DataView(b.buffer);
        const first = view.getInt32(16, false);
        expect(first).toBe(encodeOscMessage('/a', [1]).length);
        expect(view.getInt32(20 + first, false)).toBe(encodeOscMessage('/bb', [1, 2]).length);
    });
});
