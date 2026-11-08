/**
 * Aurora accent colour. One colour drives the whole look: app theme, charts and the VR panels.
 */
import { ref, watch } from 'vue';

import configRepository from './config';

export const DEFAULT_ACCENT = '#ff3d9a';
export const GRAY_ACCENT = '#b4b4b4';
/** Aurora's own default: plain gray. DEFAULT_ACCENT stays the Neon pink. */
export const AURORA_ACCENT = GRAY_ACCENT;
export const accent = ref(AURORA_ACCENT);
export const ACCENT_PRESETS = [
    { name: 'Grayscale', hex: GRAY_ACCENT },
    { name: 'Violet aurora', hex: '#a48cff' },
    { name: 'Glacier', hex: '#7cc4ff' },
    { name: 'Arctic teal', hex: '#3dd6c6' },
    { name: 'Borealis green', hex: '#4fe3a0' },
    { name: 'Pale lime', hex: '#c8f06e' },
    { name: 'Rose dawn', hex: '#ff8fb3' },
    { name: 'Moonlight', hex: '#d9dde6' },
    { name: 'Hot pink', hex: '#ff3d9a' },
    { name: 'Orange', hex: '#ff8a1f' },
    { name: 'Gold', hex: '#ffd21f' },
    { name: 'Red', hex: '#ff3b3b' }
];

function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) {
        return [255, 61, 154];
    }
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Lightness, chroma and hue in the OKLCH colour space. */
export function oklch(hex) {
    const lin = (c) => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const [r, g, b] = hexToRgb(hex).map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    const h = (Math.atan2(B, A) * 180) / Math.PI;
    return { l: L, c: Math.sqrt(A * A + B * B), h: h < 0 ? h + 360 : h };
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




function apply() {
    const hex = accent.value;
    const root = document.documentElement;
    const [r, g, b] = hexToRgb(hex);
    root.style.setProperty('--aurora-pink', hex);
    root.style.setProperty('--aurora-pink-soft', `rgba(${r}, ${g}, ${b}, 0.35)`);
    // 340 is where the original pink theme sits (hot pink is about 17 above that)
    root.style.setProperty('--ah', String(Math.round(oklchHue(hex) - 17)));
    // Aurora themes read the hue directly
    root.style.setProperty('--axh', String(Math.round(oklchHue(hex))));
    // how colourful the accent is: grayscale is 0, pale colours give a soft tint, vivid ones full colour
    const chroma = oklch(hex).c;
    root.style.setProperty('--axk', chroma < 0.008 ? '0' : String(Math.min(1.2, chroma / 0.13).toFixed(3)));
}

let started = false;
export async function initAccent() {
    if (started) {
        return;
    }
    started = true;
    // one time: everyone goes back to the gray base (it can be changed any time in Settings)
    if (!(await configRepository.getBool('Aurora_accentV4', false))) {
        await configRepository.setString('Neon_accent', AURORA_ACCENT);
        await configRepository.setBool('Aurora_accentV4', true);
    }
    accent.value = await configRepository.getString('Neon_accent', AURORA_ACCENT);
    apply();
    watch(accent, apply);
}

let saveTimer = null;
export function setAccent(hex) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) {
        return;
    }
    accent.value = hex.toLowerCase();
    // the colour wheel sends many colours while dragging, save once it settles
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => configRepository.setString('Neon_accent', accent.value), 400);
}
