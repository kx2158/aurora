/**
 * Robot voice effects for the Aurora mascot. Pure functions on Float32Array samples,
 * so they are cheap, need no audio nodes and can be tested without a browser.
 *
 * bitDepth     1-16   fewer bits = crunchier (bitcrusher)
 * downsample   1-24   hold each sample for N steps = lo-fi / aliasing (sample rate reducer)
 * ringHz       0-300  ring modulator frequency, 0 = off (classic robot / dalek tone)
 * ringMix      0-1    how much ring modulation is blended in
 * glitch       0-1    chance per ~60 ms slice to stutter (repeat a tiny chunk)
 * reverb       0-1    soft room reverb (Aurora voice), 0 = dry
 */
export const FX_PRESETS = {
    clean: { bitDepth: 16, downsample: 1, ringHz: 0, ringMix: 0, glitch: 0, reverb: 0 },
    robot: { bitDepth: 8, downsample: 3, ringHz: 55, ringMix: 0.45, glitch: 0 },
    glitchy: { bitDepth: 6, downsample: 5, ringHz: 90, ringMix: 0.35, glitch: 0.12 }
};

export function applyVoiceFx(input, sampleRate, fx) {
    const { bitDepth, downsample, ringHz, ringMix, glitch, reverb } = { ...FX_PRESETS.clean, ...fx };
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
    return reverb > 0 ? addReverb(out, sampleRate, reverb) : out;
}

/** Small Schroeder reverb: four combs and two all-passes, a soft tail after the words. */
export function addReverb(input, sampleRate, amount) {
    const wet = Math.max(0, Math.min(1, amount));
    const tail = Math.floor(sampleRate * (0.35 + wet * 0.9));
    const out = new Float32Array(input.length + tail);
    out.set(input);
    const combDelays = [0.0297, 0.0371, 0.0411, 0.0437].map((d) => Math.floor(d * sampleRate));
    const feedback = 0.7 + wet * 0.15;
    const damp = 0.35;
    const mix = new Float32Array(out.length);
    for (const delay of combDelays) {
        const buf = new Float32Array(delay);
        let idx = 0;
        let low = 0;
        for (let i = 0; i < out.length; i++) {
            const delayed = buf[idx];
            low = delayed * (1 - damp) + low * damp;
            buf[idx] = out[i] + low * feedback;
            idx = (idx + 1) % delay;
            mix[i] += delayed * 0.25;
        }
    }
    for (const d of [0.005, 0.0017]) {
        const delay = Math.floor(d * sampleRate);
        const buf = new Float32Array(delay);
        let idx = 0;
        for (let i = 0; i < mix.length; i++) {
            const delayed = buf[idx];
            const x = mix[i];
            buf[idx] = x + delayed * 0.5;
            mix[i] = delayed - x * 0.5;
            idx = (idx + 1) % delay;
        }
    }
    const gain = 0.45 * wet;
    let peak = 0.0001;
    for (let i = 0; i < out.length; i++) {
        out[i] = out[i] * (1 - wet * 0.25) + mix[i] * gain;
        peak = Math.max(peak, Math.abs(out[i]));
    }
    if (peak > 0.98) {
        for (let i = 0; i < out.length; i++) out[i] = out[i] * (0.98 / peak);
    }
    return out;
}

/** The Neon look is the old pink theme. Only there does the voice get bitcrushed. */
export function isNeonTheme() {
    try {
        const t = document.documentElement.getAttribute('data-theme');
        return t === 'aurora' || t === 'auroralight';
    } catch {
        return false;
    }
}

/**
 * Voice settings to actually use: Neon keeps the robot crunch, Aurora gets a clean voice with just a
 * soft reverb (the slider). `fx` is the saved bitcrusher setup, `reverb` the Aurora slider.
 */
export function effectiveFx(fx, reverb = 0.25) {
    if (isNeonTheme()) {
        return { ...fx, reverb: 0 };
    }
    return { ...FX_PRESETS.clean, reverb: Math.max(0, Math.min(1, Number(reverb) || 0)) };
}
