/**
 * Reads animated images and videos into frames and draws VRChat spritesheets from them (browser side).
 *
 * GIF, animated WebP and APNG go through the browser's ImageDecoder (Chromium, which Aurora runs in), so every
 * frame and its real duration come out without any extra library. Videos (mp4, webm, mov) are sampled by seeking
 * a hidden <video>. A still image becomes a single frame.
 */
import { SHEET_SIZE, cellRect, fitRect, frameAt, planFrames, timeline } from './stickerSheet';

/** Frames are kept at most this big; a cell on the sheet is at most 512. */
const KEEP = 512;
/** Longer animations are cut here so memory stays sane. */
const MAX_SOURCE_FRAMES = 1500;

function keepSize(w, h) {
    const s = Math.min(1, KEEP / Math.max(w, h));
    return { resizeWidth: Math.max(1, Math.round(w * s)), resizeHeight: Math.max(1, Math.round(h * s)), resizeQuality: 'high' };
}

async function decodeAnimated(file) {
    const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: file.type });
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    const n = Math.min(track ? track.frameCount : 1, MAX_SOURCE_FRAMES);
    const frames = [];
    const durations = [];
    let width = 0;
    let height = 0;
    for (let i = 0; i < n; i++) {
        let result;
        try {
            result = await decoder.decode({ frameIndex: i, completeFramesOnly: true });
        } catch {
            break;
        }
        const vf = result.image;
        width = vf.displayWidth;
        height = vf.displayHeight;
        frames.push(await createImageBitmap(vf, keepSize(width, height)));
        durations.push(vf.duration ? vf.duration / 1000 : 0);
        vf.close();
    }
    decoder.close();
    if (!frames.length) throw new Error('no frames');
    const { starts, total } = timeline(durations);
    return {
        kind: frames.length > 1 ? 'animated' : 'still',
        width,
        height,
        totalMs: total,
        sourceFrames: frames.length,
        starts,
        frames,
        async frameAt(t) {
            return frames[frameAt(starts, t)];
        },
        dispose() {
            for (const f of frames) f.close?.();
        }
    };
}

async function decodeStill(file) {
    const bmp = await createImageBitmap(file);
    const small = await createImageBitmap(bmp, keepSize(bmp.width, bmp.height));
    const { width, height } = bmp;
    bmp.close();
    return {
        kind: 'still',
        width,
        height,
        totalMs: 1000,
        sourceFrames: 1,
        starts: [0],
        frames: [small],
        async frameAt() {
            return small;
        },
        dispose() {
            small.close();
        }
    };
}

function waitFor(el, event) {
    return new Promise((resolve, reject) => {
        const ok = () => {
            el.removeEventListener('error', bad);
            resolve();
        };
        const bad = () => {
            el.removeEventListener(event, ok);
            reject(new Error('video could not be read'));
        };
        el.addEventListener(event, ok, { once: true });
        el.addEventListener('error', bad, { once: true });
    });
}

async function decodeVideo(file) {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    await waitFor(video, 'loadeddata');
    const totalMs = Number.isFinite(video.duration) ? video.duration * 1000 : 1000;
    const width = video.videoWidth;
    const height = video.videoHeight;
    let chain = Promise.resolve();
    // seeks have to happen one after another
    const grab = (t) =>
        (chain = chain.then(async () => {
            const target = Math.min(Math.max(0, t / 1000), Math.max(0, video.duration - 0.001));
            if (Math.abs(video.currentTime - target) > 0.0005) {
                const done = waitFor(video, 'seeked');
                video.currentTime = target;
                await done;
            }
            return createImageBitmap(video, keepSize(width, height));
        }));
    return {
        kind: 'video',
        width,
        height,
        totalMs,
        sourceFrames: null,
        starts: null,
        frames: null,
        frameAt: grab,
        dispose() {
            video.removeAttribute('src');
            video.load();
            URL.revokeObjectURL(url);
        }
    };
}

/** Opens a file as a frame source. */
export async function openSource(file) {
    const type = file.type || '';
    if (type.startsWith('video/')) return decodeVideo(file);
    if (typeof ImageDecoder !== 'undefined') {
        try {
            if (await ImageDecoder.isTypeSupported(type)) return await decodeAnimated(file);
        } catch {
            // fall through to a still image
        }
    }
    return decodeStill(file);
}

/**
 * Draws the sheet. opts: { startMs, endMs, count, speed, fit, zoom, offX, offY, background }.
 * Returns { canvas, plan }.
 */
export async function renderSheet(source, opts = {}) {
    const plan = planFrames({
        totalMs: source.totalMs,
        startMs: opts.startMs,
        endMs: opts.endMs,
        count: opts.count,
        sourceFrames: source.sourceFrames,
        starts: source.starts,
        speed: opts.speed
    });
    const canvas = document.createElement('canvas');
    canvas.width = SHEET_SIZE;
    canvas.height = SHEET_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    for (let i = 0; i < plan.count; i++) {
        const cell = cellRect(i, plan.count);
        const img = await source.frameAt(plan.times[i]);
        ctx.save();
        ctx.beginPath();
        ctx.rect(cell.x, cell.y, cell.size, cell.size);
        ctx.clip();
        if (opts.background) {
            ctx.fillStyle = opts.background;
            ctx.fillRect(cell.x, cell.y, cell.size, cell.size);
        }
        const r = fitRect(img.width, img.height, cell, opts.fit, opts.zoom, opts.offX, opts.offY);
        ctx.drawImage(img, r.dx, r.dy, r.dw, r.dh);
        ctx.restore();
        if (source.kind === 'video') img.close();
    }
    return { canvas, plan };
}

/** PNG blob of a canvas. */
export function canvasBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png failed'))), 'image/png'));
}
