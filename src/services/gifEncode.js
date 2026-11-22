/**
 * Writes animated GIFs in the browser, and turns an opened video into one. Colours are reduced to a 256 colour
 * palette shared by every frame (median cut); pixels that are mostly see-through become the transparent colour.
 */

function buildPalette(frames, maxColors) {
    const hist = new Uint32Array(32768);
    let seen = 0;
    for (const f of frames) {
        const d = f.data;
        const step = Math.max(1, Math.floor(d.length / 4 / 60000)) * 4;
        for (let i = 0; i < d.length; i += step) {
            if (d[i + 3] < 128) continue;
            hist[((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)]++;
            seen++;
        }
    }
    const colors = [];
    for (let i = 0; i < 32768; i++) {
        if (hist[i]) colors.push({ r: (i >> 10) & 31, g: (i >> 5) & 31, b: i & 31, n: hist[i] });
    }
    if (!colors.length) colors.push({ r: 0, g: 0, b: 0, n: 1 });
    const boxes = [colors];
    while (boxes.length < maxColors) {
        let best = -1;
        let bestN = 0;
        boxes.forEach((b, i) => {
            if (b.length > 1) {
                const n = b.reduce((a, c) => a + c.n, 0);
                if (n > bestN) {
                    bestN = n;
                    best = i;
                }
            }
        });
        if (best < 0) break;
        const box = boxes[best];
        const range = (k) => Math.max(...box.map((c) => c[k])) - Math.min(...box.map((c) => c[k]));
        const rr = range('r');
        const gr = range('g');
        const br = range('b');
        const ch = rr >= gr && rr >= br ? 'r' : gr >= br ? 'g' : 'b';
        box.sort((a, b) => a[ch] - b[ch]);
        let acc = 0;
        let cut = 1;
        for (let i = 0; i < box.length - 1; i++) {
            acc += box[i].n;
            cut = i + 1;
            if (acc >= bestN / 2) break;
        }
        boxes.splice(best, 1, box.slice(0, cut), box.slice(cut));
    }
    return boxes.map((b) => {
        const n = b.reduce((a, c) => a + c.n, 0);
        const avg = (k) => Math.round(((b.reduce((a, c) => a + c[k] * c.n, 0) / n) * 255) / 31);
        return [avg('r'), avg('g'), avg('b')];
    });
}

function lzw(indices, minCode) {
    const clear = 1 << minCode;
    const eoi = clear + 1;
    let codeSize = minCode + 1;
    let next = eoi + 1;
    const dict = new Map();
    const bytes = [];
    let buf = 0;
    let bits = 0;
    const emit = (code) => {
        buf |= code << bits;
        bits += codeSize;
        while (bits >= 8) {
            bytes.push(buf & 255);
            buf >>>= 8;
            bits -= 8;
        }
    };
    emit(clear);
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
        const k = indices[i];
        const key = prefix * 256 + k;
        const found = dict.get(key);
        if (found !== undefined) {
            prefix = found;
            continue;
        }
        emit(prefix);
        if (next === 4096) {
            emit(clear);
            next = eoi + 1;
            codeSize = minCode + 1;
            dict.clear();
        } else {
            if (next >= 1 << codeSize) codeSize++;
            dict.set(key, next++);
        }
        prefix = k;
    }
    emit(prefix);
    emit(eoi);
    if (bits > 0) bytes.push(buf & 255);
    return bytes;
}

/**
 * @param {{ data: Uint8ClampedArray, width: number, height: number }[]} frames same size
 * @param {number} delayMs
 * @returns {Uint8Array}
 */
export function encodeGif(frames, delayMs, loops = 0) {
    const { width, height } = frames[0];
    const transparent = frames.some((f) => {
        for (let i = 3; i < f.data.length; i += 4) if (f.data[i] < 128) return true;
        return false;
    });
    const colorsWanted = transparent ? 255 : 256;
    const palette = buildPalette(frames, colorsWanted);
    const offset = transparent ? 1 : 0;
    const table = new Array(256).fill(0).map((_, i) => palette[i - offset] || [0, 0, 0]);

    const lookup = new Int16Array(32768).fill(-1);
    const nearest = (r, g, b) => {
        const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        let hit = lookup[key];
        if (hit >= 0) return hit;
        const rr = (r >> 3) * 8 + 4;
        const gg = (g >> 3) * 8 + 4;
        const bb = (b >> 3) * 8 + 4;
        let bestD = Infinity;
        hit = offset;
        for (let i = 0; i < palette.length; i++) {
            const p = palette[i];
            const d = (p[0] - rr) ** 2 + (p[1] - gg) ** 2 + (p[2] - bb) ** 2;
            if (d < bestD) {
                bestD = d;
                hit = i + offset;
            }
        }
        lookup[key] = hit;
        return hit;
    };

    const out = [];
    const u16 = (v) => out.push(v & 255, (v >> 8) & 255);
    out.push(...'GIF89a'.split('').map((c) => c.charCodeAt(0)));
    u16(width);
    u16(height);
    out.push(0xf7, 0, 0); // global colour table of 256, no sort
    for (const c of table) out.push(c[0], c[1], c[2]);
    out.push(0x21, 0xff, 11, ...'NETSCAPE2.0'.split('').map((c) => c.charCodeAt(0)), 3, 1);
    u16(loops);
    out.push(0);

    const delay = Math.max(2, Math.round(delayMs / 10));
    for (const f of frames) {
        out.push(0x21, 0xf9, 4, transparent ? 0x09 : 0x04, delay & 255, (delay >> 8) & 255, 0, 0);
        out.push(0x2c);
        u16(0);
        u16(0);
        u16(width);
        u16(height);
        out.push(0);
        const px = new Uint8Array(width * height);
        const d = f.data;
        for (let i = 0, p = 0; i < d.length; i += 4, p++) {
            px[p] = transparent && d[i + 3] < 128 ? 0 : nearest(d[i], d[i + 1], d[i + 2]);
        }
        out.push(8);
        const data = lzw(px, 8);
        for (let i = 0; i < data.length; i += 255) {
            const n = Math.min(255, data.length - i);
            out.push(n);
            for (let j = 0; j < n; j++) out.push(data[i + j]);
        }
        out.push(0);
    }
    out.push(0x3b);
    return Uint8Array.from(out);
}

/**
 * Samples an opened video (anything with frameAt(ms) and totalMs) and writes it as a looping GIF.
 *
 * @param {{ totalMs: number, width: number, height: number, frameAt: (ms: number) => Promise<CanvasImageSource> }} source
 * @param {{ maxSize?: number, fps?: number, maxFrames?: number, maxMs?: number }} [opts]
 * @returns {Promise<Blob>}
 */
export async function videoToGif(source, opts = {}) {
    const { maxSize = 360, fps = 15, maxFrames = 150, maxMs = 12000 } = opts;
    const span = Math.min(source.totalMs, maxMs);
    const count = Math.max(1, Math.min(maxFrames, Math.round((span / 1000) * fps)));
    const scale = Math.min(1, maxSize / Math.max(source.width, source.height));
    const w = Math.max(1, Math.round(source.width * scale));
    const h = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const frames = [];
    for (let i = 0; i < count; i++) {
        const img = await source.frameAt((span * i) / count);
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        frames.push({ data: ctx.getImageData(0, 0, w, h).data, width: w, height: h });
    }
    return new Blob([encodeGif(frames, span / count)], { type: 'image/gif' });
}
