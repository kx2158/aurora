/** Animated pieces you can put in any chatbox line: {sparkle} {dots} {cursor} {spin}. One frame per send. */
export const ANIM_FRAMES = {
    sparkle: ['\u2727', '\u2726', '\u2728', '\u2726'],
    dots: ['', '.', '..', '...'],
    cursor: ['\u258f', '\u2007'],
    spin: ['\u25d0', '\u25d3', '\u25d1', '\u25d2']
};
const ANIM_RE = /\{(sparkle|dots|cursor|spin)\}/;

/** @returns {boolean} true if any line uses an animated piece */
export function hasAnimation(pages) {
    return (pages || []).some((p) => ANIM_RE.test(String(p)));
}
/** @returns {string} the frame of an animated piece for a counter */
export function animFrame(name, n) {
    const f = ANIM_FRAMES[name];
    return f ? f[n % f.length] : '';
}
