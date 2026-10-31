/**
 * Robot voice effects for the Aurora mascot. Pure functions on Float32Array samples,
 * so they are cheap, need no audio nodes and can be tested without a browser.
 *
 * bitDepth     1-16   fewer bits = crunchier (bitcrusher)
 * downsample   1-24   hold each sample for N steps = lo-fi / aliasing (sample rate reducer)
 * ringHz       0-300  ring modulator frequency, 0 = off (classic robot / dalek tone)
 * ringMix      0-1    how much ring modulation is blended in
 * glitch       0-1    chance per ~60 ms slice to stutter (repeat a tiny chunk)
 */
export const FX_PRESETS = {
    clean: { bitDepth: 16, downsample: 1, ringHz: 0, ringMix: 0, glitch: 0 },
    robot: { bitDepth: 8, downsample: 3, ringHz: 55, ringMix: 0.45, glitch: 0 },
    glitchy: { bitDepth: 6, downsample: 5, ringHz: 90, ringMix: 0.35, glitch: 0.12 }
};

export function applyVoiceFx(input, sampleRate, fx) {
    const { bitDepth, downsample, ringHz, ringMix, glitch } = { ...FX_PRESETS.clean, ...fx };
    const out = new Float32Array(input.length);
    const levels = Math.pow(2, Math.max(1, Math.min(16, bitDepth)) - 1);
    const hold = Math.max(1, Math.round(downsample));
    let held = 0;

    for (let i = 0; i < input.length; i++) {
        if (i % hold === 0) {
            held = Math.round(input[i] * levels) / levels; // quantize + sample-and-hold
        }
        let s = held;
        if (ringHz > 0 && ringMix > 0) {
            const ring = s * Math.sin((2 * Math.PI * ringHz * i) / sampleRate);
            s = s * (1 - ringMix) + ring * ringMix * 1.6;
        }
        out[i] = Math.max(-1, Math.min(1, s));
    }

    if (glitch > 0) {
        const slice = Math.floor(sampleRate * 0.06);
        const chunk = Math.floor(sampleRate * 0.012);
        for (let start = slice; start + slice < out.length; start += slice) {
            if (Math.random() < glitch) {
                for (let j = 0; j < slice; j++) {
                    out[start + j] = out[start + (j % chunk)];
                }
            }
        }
    }
    return out;
}
