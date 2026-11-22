import { describe, expect, it } from 'vitest';

import {
    SHEET_SIZE,
    cellRect,
    fitRect,
    frameAt,
    gridFor,
    keptAnimation,
    planFrames,
    sheetFileName,
    stickerParams,
    timeline
} from '../stickerSheet.js';

describe('sheet layout', () => {
    it('uses the 2x2, 4x4 and 8x8 grids VRChat plays', () => {
        expect(gridFor(1)).toBe(2);
        expect(gridFor(4)).toBe(2);
        expect(gridFor(5)).toBe(4);
        expect(gridFor(16)).toBe(4);
        expect(gridFor(17)).toBe(8);
        expect(gridFor(64)).toBe(8);
    });
    it('fills rows left to right, then down, inside the 1024 sheet', () => {
        expect(cellRect(0, 4)).toEqual({ x: 0, y: 0, size: 512 });
        expect(cellRect(1, 4)).toEqual({ x: 512, y: 0, size: 512 });
        expect(cellRect(2, 4)).toEqual({ x: 0, y: 512, size: 512 });
        expect(cellRect(9, 16)).toEqual({ x: 256, y: 512, size: 256 });
        const last = cellRect(63, 64);
        expect(last.x + last.size).toBe(SHEET_SIZE);
        expect(last.y + last.size).toBe(SHEET_SIZE);
    });
    it('matches the frame positions Aurora animates emoji with', () => {
        // animated-emoji-2: the second frame sits at -512px 0
        expect(cellRect(1, 2)).toMatchObject({ x: 512, y: 0 });
        // with 8 frames the grid is 4 wide, so frame 5 starts the second row
        expect(cellRect(4, 8)).toMatchObject({ x: 0, y: 256 });
    });
});

describe('fitting a picture into a cell', () => {
    const cell = { x: 0, y: 0, size: 256 };
    it('fill covers the cell and crops the long side', () => {
        const r = fitRect(400, 200, cell, 'cover');
        expect(r.dh).toBeCloseTo(256);
        expect(r.dw).toBeCloseTo(512);
        expect(r.dx).toBeCloseTo(-128);
    });
    it('fit shows everything, centred', () => {
        const r = fitRect(400, 200, cell, 'contain');
        expect(r.dw).toBeCloseTo(256);
        expect(r.dh).toBeCloseTo(128);
        expect(r.dy).toBeCloseTo(64);
    });
    it('moving slides inside the spare room only', () => {
        const left = fitRect(400, 200, cell, 'cover', 1, -1, 0);
        const right = fitRect(400, 200, cell, 'cover', 1, 1, 0);
        // moving left shows the picture's right edge, moving right its left edge
        expect(left.dx + left.dw).toBeCloseTo(256);
        expect(right.dx).toBeCloseTo(0);
        // a picture smaller than the cell slides to the cell's edges
        const small = fitRect(200, 400, cell, 'contain', 1, -1, 0);
        expect(small.dx).toBeCloseTo(0);
    });
});

describe('picking frames', () => {
    it('reads GIF timing, with browsers treating tiny delays as 100 ms', () => {
        const { starts, total } = timeline([50, 0, 50, 5]);
        expect(starts).toEqual([0, 50, 150, 200]);
        expect(total).toBe(300);
        expect(frameAt(starts, 0)).toBe(0);
        expect(frameAt(starts, 149)).toBe(1);
        expect(frameAt(starts, 150)).toBe(2);
        expect(frameAt(starts, 299)).toBe(3);
    });
    it('auto uses every frame of a short GIF and keeps its real speed', () => {
        const { starts, total } = timeline(new Array(12).fill(80));
        const p = planFrames({ totalMs: total, sourceFrames: 12, starts });
        expect(p.count).toBe(12);
        expect(p.fps).toBe(13); // 12 frames over 0.96 s
    });
    it('caps long animations at 64 frames and slows the fps to keep the loop length', () => {
        const { starts, total } = timeline(new Array(200).fill(40));
        const p = planFrames({ totalMs: total, sourceFrames: 200, starts });
        expect(p.count).toBe(64);
        expect(p.fps).toBe(8); // 64 frames over 8 s
    });
    it('only uses the chosen part', () => {
        const p = planFrames({ totalMs: 10000, startMs: 2000, endMs: 3000, count: 10 });
        expect(p.times[0]).toBe(2000);
        expect(p.times[9]).toBe(2900);
        expect(p.fps).toBe(10);
    });
    it('video defaults to 24 frames a second, speed scales the fps within 1 to 64', () => {
        expect(planFrames({ totalMs: 1000 }).count).toBe(24);
        expect(planFrames({ totalMs: 1000, speed: 2 }).fps).toBe(48);
        expect(planFrames({ totalMs: 1000, speed: 10 }).fps).toBe(64);
        expect(planFrames({ totalMs: 60000, count: 4 }).fps).toBe(1);
    });
});

describe('upload settings', () => {
    it('animated stickers carry frames, fps and the loop style', () => {
        expect(stickerParams({ frames: 16, fps: 12, pingpong: true })).toEqual({
            tag: 'sticker',
            maskTag: 'square',
            frames: 16,
            framesOverTime: 12,
            loopStyle: 'pingpong'
        });
        expect(stickerParams({ frames: 1, fps: 1 })).toEqual({ tag: 'sticker', maskTag: 'square' });
    });
    it('notices when VRChat dropped the animation', () => {
        const params = stickerParams({ frames: 16, fps: 12 });
        expect(keptAnimation({ frames: 16, framesOverTime: 12 }, params)).toBe(true);
        expect(keptAnimation({ id: 'file_x' }, params)).toBe(false);
        expect(keptAnimation({ id: 'file_x' }, stickerParams({ frames: 1, fps: 1 }))).toBe(true);
    });
    it('names saved sheets so the emoji upload reads the settings back', () => {
        expect(sheetFileName('dance party.gif', 16, 12, false)).toBe('dance-party_16frames_12fps_linearloopStyle.png');
    });
});
