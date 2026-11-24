/** Small pure helpers for stealth mode, kept apart so they can be tested on their own. */

export const GAP_MS = 450; // be gentle with VRChat's rate limit

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs the steps one after another, each in its own try, and collects what failed.
 * @param {{name: string, run: () => Promise<unknown>}[]} steps
 * @returns {Promise<{step: string, error: string}[]>} the failed steps
 */
export async function runSteps(steps, gap = GAP_MS) {
    const failed = [];
    for (const s of steps) {
        try {
            await s.run();
        } catch (err) {
            failed.push({ step: s.name, error: String(err?.message || err) });
        }
        if (gap) await sleep(gap);
    }
    return failed;
}

/**
 * Keeps only what has to change: items whose current value differs from the hidden value.
 * @template T
 * @param {T[]} items
 * @param {(item: T) => boolean} isAlreadyHidden
 * @returns {T[]} the items that still need hiding
 */
export function needsHiding(items, isAlreadyHidden) {
    return items.filter((i) => !isAlreadyHidden(i));
}

