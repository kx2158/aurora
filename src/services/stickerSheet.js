/**
 * Animated sticker spritesheets, the pure part (no DOM, so it can be tested).
 *
 * VRChat plays animated stickers and emoji from one 1024x1024 sheet: frames left to right, top to bottom, on a
 * 2x2 grid for up to 4 frames, 4x4 for up to 16 and 8x8 for up to 64 (the same layout Aurora's emoji preview uses).
 * The file carries frames, framesOverTime (fps) and optionally loopStyle 'pingpong'.
 */

export const SHEET_SIZE = 1024;
export const MAX_FRAMES = 64;
export const MAX_FPS = 64;
export const DEFAULT_FRAME_MS = 100;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Frames per row for a frame count. */
export function gridFor(count) {
    if (count <= 4) return 2;
    if (count <= 16) return 4;
    return 8;
}

/** Where frame i of count goes on the sheet. */
export function cellRect(i, count) {
    const g = gridFor(count);
    const size = SHEET_SIZE / g;
    return { x: (i % g) * size, y: Math.floor(i / g) * size, size };
}

/**
 * Fits a source of w x h into a square cell. 'cover' fills the cell and crops the overflow, 'contain' shows all
 * of it with transparent bars. zoom > 1 crops further in, offX/offY (-1..1) slide the picture inside the cell.
 */
export function fitRect(w, h, cell, mode = 'cover', zoom = 1, offX = 0, offY = 0) {
    if (!(w > 0 && h > 0)) return { dx: cell.x, dy: cell.y, dw: cell.size, dh: cell.size };
    const base = mode === 'contain' ? Math.min(cell.size / w, cell.size / h) : Math.max(cell.size / w, cell.size / h);
    const s = base * Math.max(0.1, zoom);
    const dw = w * s;
    const dh = h * s;
    const spareX = Math.abs(dw - cell.size) / 2;
    const spareY = Math.abs(dh - cell.size) / 2;
    return {
        dx: cell.x + (cell.size - dw) / 2 + clamp(offX, -1, 1) * spareX,
        dy: cell.y + (cell.size - dh) / 2 + clamp(offY, -1, 1) * spareY,
        dw,
        dh
    };
}

/** Start times (ms) of frames with these durations, plus the total. Missing or tiny durations count as 100 ms, like browsers do. */
export function timeline(durationsMs) {
    const starts = [];
    let t = 0;
    for (const d of durationsMs) {
        starts.push(t);
        t += d > 10 ? d : DEFAULT_FRAME_MS;
    }
    return { starts, total: t };
}

/** Index of the source frame showing at time t. */
export function frameAt(starts, t) {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= t) lo = mid;
        else hi = mid - 1;
    }
    return lo;
}

/**
 * Picks the moments to put on the sheet.
 * totalMs: length of the source. startMs/endMs: the part to use. count: frames wanted (auto when 0: as many as the
 * source has in that part for frame-based sources, or 24 per second for video, at most 64).
 * sourceFrames: how many frames a frame-based source has in total (null for video).
 * Returns { times, count, fps, spanMs }, where fps plays the part back at its real speed (speed > 1 is faster).
 */
export function planFrames({ totalMs, startMs = 0, endMs = null, count = 0, sourceFrames = null, starts = null, speed = 1 }) {
    const total = Math.max(1, totalMs || 1);
    const a = clamp(startMs || 0, 0, total);
    const b = clamp(endMs == null ? total : endMs, a, total);
    const span = Math.max(1, b - a);
    let n = Math.round(count) || 0;
    if (!n) {
        if (sourceFrames != null && starts) {
            const first = frameAt(starts, a);
            const last = frameAt(starts, Math.max(a, b - 1));
            n = last - first + 1;
        } else {
            n = Math.round((span / 1000) * 24);
        }
    }
    n = clamp(n, 1, MAX_FRAMES);
    const times = [];
    for (let i = 0; i < n; i++) times.push(a + (span * i) / n);
    const fps = clamp(Math.round((n / (span / 1000)) * Math.max(0.05, speed)), 1, MAX_FPS);
    return { times, count: n, fps, spanMs: span };
}

/** Upload settings for an animated sticker. */
export function stickerParams({ frames, fps, pingpong = false }) {
    const params = { tag: 'sticker', maskTag: 'square' };
    if (frames > 1) {
        params.frames = clamp(Math.round(frames), 2, MAX_FRAMES);
        params.framesOverTime = clamp(Math.round(fps), 1, MAX_FPS);
        if (pingpong) params.loopStyle = 'pingpong';
    }
    return params;
}

/** Whether the file VRChat sent back still has the animation we asked for. */
export function keptAnimation(file, params) {
    if (!params.frames) return true;
    return Number(file?.frames) === params.frames && Number(file?.framesOverTime) > 0;
}

/** Name for a saved sheet, in the naming scheme Aurora's emoji upload already reads back. */
export function sheetFileName(name, frames, fps, pingpong) {
    const base = (name || 'sticker').replace(/\.[^/.]+$/, '').replace(/[^\w-]+/g, '-').slice(0, 40) || 'sticker';
    return `${base}_${frames}frames_${fps}fps_${pingpong ? 'pingpong' : 'linear'}loopStyle.png`;
}
