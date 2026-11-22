/**
 * Minimal animated PNG writer. Each frame is encoded by the browser as a normal PNG, then its pixel data
 * is lifted into one APNG stream (acTL, fcTL, IDAT and fdAT chunks).
 */
import { cellRect } from './stickerSheet';

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

let crcTable = null;
function crc32(bytes) {
    if (!crcTable) {
        crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            crcTable[n] = c >>> 0;
        }
    }
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
}

function readChunks(buf) {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const chunks = [];
    let p = 8;
    while (p + 12 <= buf.length) {
        const len = view.getUint32(p);
        const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
        chunks.push({ type, data: buf.subarray(p + 8, p + 8 + len) });
        p += 12 + len;
    }
    return chunks;
}

function u32(...values) {
    const out = new Uint8Array(values.length * 4);
    const view = new DataView(out.buffer);
    values.forEach((v, i) => view.setUint32(i * 4, v));
    return out;
}

/**
 * @param {Uint8Array[]} pngs equally sized PNG files, one per frame
 * @param {number} delayMs time each frame shows
 * @param {number} [loops] 0 loops forever
 * @returns {Uint8Array}
 */
export function buildApng(pngs, delayMs, loops = 0) {
    if (!pngs.length) throw new Error('no frames');
    const parts = [Uint8Array.from(SIGNATURE)];
    let seq = 0;
    const fcTL = (width, height) => {
        const d = new Uint8Array(26);
        const v = new DataView(d.buffer);
        v.setUint32(0, seq++);
        v.setUint32(4, width);
        v.setUint32(8, height);
        v.setUint32(12, 0);
        v.setUint32(16, 0);
        v.setUint16(20, Math.max(1, Math.min(65535, Math.round(delayMs))));
        v.setUint16(22, 1000);
        d[24] = 1; // clear to transparent after the frame
        d[25] = 0; // draw over, no blending
        return chunk('fcTL', d);
    };
    pngs.forEach((png, index) => {
        const chunks = readChunks(png);
        const ihdr = chunks.find((c) => c.type === 'IHDR');
        const idats = chunks.filter((c) => c.type === 'IDAT');
        const view = new DataView(ihdr.data.buffer, ihdr.data.byteOffset, ihdr.data.byteLength);
        const width = view.getUint32(0);
        const height = view.getUint32(4);
        if (index === 0) {
            parts.push(chunk('IHDR', ihdr.data));
            parts.push(chunk('acTL', u32(pngs.length, loops)));
            parts.push(fcTL(width, height));
            for (const c of idats) parts.push(chunk('IDAT', c.data));
        } else {
            parts.push(fcTL(width, height));
            for (const c of idats) {
                const d = new Uint8Array(4 + c.data.length);
                new DataView(d.buffer).setUint32(0, seq++);
                d.set(c.data, 4);
                parts.push(chunk('fdAT', d));
            }
        }
    });
    parts.push(chunk('IEND', new Uint8Array(0)));
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
        out.set(p, o);
        o += p.length;
    }
    return out;
}

/**
 * Cuts a spritesheet into its frames and writes them as one animated PNG.
 *
 * @param {Blob} sheet the 1024 spritesheet
 * @param {number} count frames on the sheet
 * @param {number} fps playback speed
 * @returns {Promise<Blob>}
 */
export async function sheetToApng(sheet, count, fps) {
    const bitmap = await createImageBitmap(sheet);
    const pngs = [];
    for (let i = 0; i < count; i++) {
        const r = cellRect(i, count);
        const c = document.createElement('canvas');
        c.width = r.size;
        c.height = r.size;
        c.getContext('2d').drawImage(bitmap, r.x, r.y, r.size, r.size, 0, 0, r.size, r.size);
        const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
        pngs.push(new Uint8Array(await blob.arrayBuffer()));
    }
    bitmap.close?.();
    return new Blob([buildApng(pngs, 1000 / Math.max(1, fps))], { type: 'image/png' });
}
