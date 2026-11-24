/**
 * "Type-out" preset for the chatbox: when the status changes, the old text is cleared, the typing bubble shows for a while,
 * then the new status appears word by word. VRChat limits chatbox updates, so each step is one gap apart (words, not letters).
 * Pure: it only builds the list of steps, so it can be tested without VRChat.
 *
 * @param {string} text the finished status
 * @param {{typingMs?:number, gapMs?:number}} opts
 * @returns {{at:number, kind:'clear'|'typing'|'text', on?:boolean, text?:string}[]}
 */
export function typeoutSteps(text, { typingMs = 5000, gapMs = 1200 } = {}) {
    const full = String(text ?? '');
    const steps = [
        { at: 0, kind: 'clear' },
        { at: 0, kind: 'typing', on: true },
        { at: typingMs, kind: 'typing', on: false }
    ];
    // split after each run of spaces/new lines so the pieces rebuild the exact text
    const words = full.match(/\S+\s*/g) || [];
    let shown = '';
    words.forEach((w, i) => {
        shown += w;
        steps.push({ at: typingMs + i * gapMs, kind: 'text', text: shown.trimEnd() });
    });
    return steps;
}

/** How long the whole type-out takes, so the rotation can wait for it. */
export function typeoutDuration(steps) {
    return steps.length ? steps[steps.length - 1].at : 0;
}
