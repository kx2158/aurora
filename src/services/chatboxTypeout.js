/**
 * Typewriter preset for the chatbox status line. The status is typed out, stays up for a while, is erased, and the next
 * status is typed. Only the status text is animated; every other chatbox line stays on screen the whole time.
 * VRChat limits chatbox updates (about one per 1.1 s or slower), so letters are revealed in chunks, one chunk per gap.
 * Pure: it only builds the plan, so it can be tested without VRChat.
 */

export const TYPEOUT_DEFAULTS = { typeMs: 2000, holdMs: 5000, eraseMs: 2000 };

export function clampMs(v, fallback, min = 500, max = 30000) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Shows the first part of a text. fraction 0 shows nothing, 1 shows all of it (counted in characters, not split emoji). */
export function revealText(text, fraction) {
    const chars = Array.from(String(text ?? ''));
    const f = Math.min(1, Math.max(0, Number(fraction) || 0));
    return chars.slice(0, Math.ceil(chars.length * f)).join('');
}

/**
 * One full cycle: type, hold, erase. Updates are at least gapMs apart, so a phase of N ms gets floor(N / gapMs) chunks.
 * @param {{typeMs?:number, holdMs?:number, eraseMs?:number, gapMs?:number}} opts
 * @returns {{steps:{at:number, fraction:number, typing?:boolean}[], total:number}}
 *   steps: send the chatbox with the status revealed to `fraction`; `typing` (when present) switches the typing bubble.
 */
export function typewriterPlan({ typeMs, holdMs, eraseMs, gapMs = 1200 } = {}) {
    const type = clampMs(typeMs, TYPEOUT_DEFAULTS.typeMs);
    const hold = clampMs(holdMs, TYPEOUT_DEFAULTS.holdMs);
    const erase = clampMs(eraseMs, TYPEOUT_DEFAULTS.eraseMs);
    const gap = Math.max(1, gapMs);
    const n = Math.max(1, Math.floor(type / gap));
    const m = Math.max(1, Math.floor(erase / gap));
    const steps = [];
    for (let k = 1; k <= n; k++) {
        const step = { at: (k - 1) * gap, fraction: k / n };
        if (k === 1) {
            step.typing = true;
        }
        steps.push(step);
    }
    // bubble goes off when the typing time is over, together with a re-send of the finished text
    const typeEnd = Math.max(type, (n - 1) * gap + gap);
    steps.push({ at: typeEnd, fraction: 1, typing: false });
    const eraseStart = typeEnd + hold;
    for (let j = 1; j <= m; j++) {
        steps.push({ at: eraseStart + (j - 1) * gap, fraction: 1 - j / m });
    }
    return { steps, total: eraseStart + Math.max(erase, m * gap) };
}
