/**
 * App lock helpers for Aurora. The PIN is never stored. Only a salted PBKDF2 hash is.
 * This protects against someone casually opening the app on your PC. It does not
 * encrypt the database files on disk.
 */
const ITERATIONS = 210000;

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));

async function derive(pin, salt, iterations) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPin(pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const bits = await derive(pin, salt, ITERATIONS);
    return JSON.stringify({ v: 1, i: ITERATIONS, s: toHex(salt), h: toHex(bits) });
}

export async function verifyPin(pin, stored) {
    try {
        const { i, s, h } = JSON.parse(stored);
        const got = new Uint8Array(await derive(pin, fromHex(s), i));
        const want = fromHex(h);
        if (got.length !== want.length) {
            return false;
        }
        let diff = 0;
        for (let k = 0; k < got.length; k++) {
            diff |= got[k] ^ want[k]; // constant-time compare
        }
        return diff === 0;
    } catch {
        return false;
    }
}

export function isValidPin(pin) {
    return typeof pin === 'string' && /^[0-9]{4,12}$/.test(pin);
}

/** Seconds to wait after this many failed attempts in a row (0 for the first few). */
export function lockoutSeconds(failures) {
    if (failures < 5) {
        return 0;
    }
    return Math.min(3600, 30 * Math.pow(2, failures - 5));
}
