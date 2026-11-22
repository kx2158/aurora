/**
 * Reads animated images and videos into frames and draws VRChat spritesheets from them (browser side).
 *
 * GIF, animated WebP and APNG go through the browser's ImageDecoder (Chromium, which Aurora runs in), so every
 * frame and its real duration come out without any extra library. Videos (mp4, webm, mov) are sampled by seeking
 * a hidden <video>. A still image becomes a single frame.
 */
import { readFileAsBase64 } from '../shared/utils/imageUpload';
import { SHEET_SIZE, cellRect, extOf, fitRect, frameAt, guessType, isVideoType, planFrames, timeline } from './stickerSheet';

/** Frames are kept at most this big; a cell on the sheet is at most 512. */
const KEEP = 512;
/** Longer animations are cut here so memory stays sane. */
const MAX_SOURCE_FRAMES = 1500;

function keepSize(w, h) {
    const s = Math.min(1, KEEP / Math.max(w, h));
    return { resizeWidth: Math.max(1, Math.round(w * s)), resizeHeight: Math.max(1, Math.round(h * s)), resizeQuality: 'high' };
}

async function decodeAnimated(file, type) {
    const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type });
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

function waitFor(el, event, timeoutMs = 0) {
    return new Promise((resolve, reject) => {
        let timer = null;
        const ok = () => {
            clearTimeout(timer);
            el.removeEventListener('error', bad);
            resolve();
        };
        const bad = () => {
            clearTimeout(timer);
            el.removeEventListener(event, ok);
            reject(new Error('video could not be read'));
        };
        el.addEventListener(event, ok, { once: true });
        el.addEventListener('error', bad, { once: true });
        if (timeoutMs) {
            timer = setTimeout(() => {
                el.removeEventListener(event, ok);
                el.removeEventListener('error', bad);
                reject(new Error('video timed out'));
            }, timeoutMs);
        }
    });
}

async function decodeVideo(file) {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    try {
        // Aurora's browser engine has no H.264, so most MP4 and MOV files fail here; the caller then tries Windows
        await waitFor(video, 'loadeddata', 8000);
    } catch (err) {
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
        throw err;
    }
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

const CHUNK = 3 * 1024 * 1024;

function nativeApi() {
    return typeof AppApi !== 'undefined' && typeof AppApi.VideoOpen === 'function' ? AppApi : null;
}

/** Videos the browser engine cannot play (H.264 in MP4 or MOV): Windows decodes them and hands back single frames. */
async function decodeVideoNative(file) {
    const api = nativeApi();
    if (!api) throw new Error('no native video reader');
    const token = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
    const close = () => Promise.resolve(api.VideoClose(token)).catch(() => {});
    try {
        if (!(await api.VideoBegin(token))) throw new Error('could not start');
        for (let at = 0; at < file.size; at += CHUNK) {
            if (!(await api.VideoAppend(token, await readFileAsBase64(file.slice(at, at + CHUNK))))) throw new Error('send failed');
        }
        const info = JSON.parse(await api.VideoOpen(token, extOf(file.name) || 'mp4'));
        if (info.error || !(info.durationMs > 0)) throw new Error(info.error || 'empty video');
        let chain = Promise.resolve();
        const grab = (t) =>
            (chain = chain.then(async () => {
                const b64 = await api.VideoFrame(token, t, KEEP);
                if (!b64) throw new Error('frame failed');
                const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
                return createImageBitmap(new Blob([bytes], { type: 'image/png' }));
            }));
        return {
            kind: 'video',
            width: info.width,
            height: info.height,
            totalMs: info.durationMs,
            sourceFrames: null,
            starts: null,
            frames: null,
            frameAt: grab,
            dispose: close
        };
    } catch (err) {
        close();
        throw err;
    }
}

/** Opens a file as a frame source. */
export async function openSource(file) {
    const type = guessType(file.name, file.type);
    if (isVideoType(type)) {
        try {
            return await decodeVideo(file);
        } catch (err) {
            console.warn('sticker maker: the browser could not read this video, trying Windows', err);
        }
        return decodeVideoNative(file);
    }
    if (typeof ImageDecoder !== 'undefined') {
        try {
            if (await ImageDecoder.isTypeSupported(type)) return await decodeAnimated(file, type);
        } catch (err) {
            console.warn('sticker maker: animated decode failed, using a still image', err);
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
