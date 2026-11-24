import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const vr = readFileSync(new URL('../../vr/Vr.vue', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('../auroraVrBridge.js', import.meta.url), 'utf8');

/** the body of neonCommand, where the SteamVR dashboard's buttons land */
function neonBody() {
    const start = bridge.indexOf('export function neonCommand');
    const end = bridge.indexOf('export async function initVrBridge');
    return bridge.slice(start, end);
}

describe('SteamVR dashboard buttons', () => {
    it('every button the dashboard sends has a handler in the app', () => {
        const dash = vr.slice(vr.indexOf('const dashGroups'), vr.indexOf('const musicLine'));
        const sent = new Set([...dash.matchAll(/cmd: '([A-Za-z0-9]+)'/g)].map((m) => m[1]));
        // the music row and the height slider send their own commands
        for (const c of ['mPrev', 'mPlay', 'mNext', 'heightNormal']) sent.add(c);
        const body = neonBody();
        const missing = [...sent].filter((c) => !body.includes(`case '${c}'`));
        expect(missing).toEqual([]);
        expect(sent.has('dragToggle')).toBe(true);
        expect(sent.has('dragReset')).toBe(true);
    });
});
