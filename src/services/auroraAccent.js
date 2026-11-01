/**
 * Neon accent colour. One colour drives the whole look: app theme, VR panels and the mascots.
 */
import { ref, watch } from 'vue';

import configRepository from './config';

export const DEFAULT_ACCENT = '#ff3d9a';
export const accent = ref(DEFAULT_ACCENT);
export const ACCENT_PRESETS = [
    { name: 'Hot pink', hex: '#ff3d9a' },
    { name: 'Cyan', hex: '#19e3ff' },
    { name: 'Acid green', hex: '#8cff3d' },
    { name: 'Violet', hex: '#9b5cff' },
    { name: 'Orange', hex: '#ff8a1f' },
    { name: 'Red', hex: '#ff3b3b' },
    { name: 'Gold', hex: '#ffd21f' },
    { name: 'Ice', hex: '#9ad7ff' }
];

function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) {
        return [255, 61, 154];
    }
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Hue in the OKLCH colour space, 0-360. Used to re-tint the dark surfaces. */
export function oklchHue(hex) {
    const lin = (c) => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const [r, g, b] = hexToRgb(hex).map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return (Math.atan2(bb, a) * 180) / Math.PI + (Math.atan2(bb, a) < 0 ? 360 : 0);
}

/** Hue in HSL degrees, used to rotate the mascot pictures. */
export function hslHue(hex) {
    const [r, g, b] = hexToRgb(hex).map((x) => x / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (!d) {
        return 0;
    }
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return (h * 60 + 360) % 360;
}

/** CSS filter that turns the pink mascot into the accent colour. */
export function mascotFilter(hex = accent.value) {
    const turn = Math.round(hslHue(hex) - hslHue(DEFAULT_ACCENT));
    return turn ? `hue-rotate(${turn}deg)` : 'none';
}

export const mascotTint = ref('none');

function apply() {
    const hex = accent.value;
    const root = document.documentElement;
    const [r, g, b] = hexToRgb(hex);
    root.style.setProperty('--aurora-pink', hex);
    root.style.setProperty('--aurora-pink-soft', `rgba(${r}, ${g}, ${b}, 0.35)`);
    // 340 is where the original pink theme sits (hot pink is about 17 above that)
    root.style.setProperty('--ah', String(Math.round(oklchHue(hex) - 17)));
    mascotTint.value = mascotFilter(hex);
}

let started = false;
export async function initAccent() {
    if (started) {
        return;
    }
    started = true;
    accent.value = await configRepository.getString('Neon_accent', DEFAULT_ACCENT);
    apply();
    watch(accent, apply);
}

export function setAccent(hex) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) {
        return;
    }
    accent.value = hex.toLowerCase();
    configRepository.setString('Neon_accent', accent.value);
}
