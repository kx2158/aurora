/**
 * Keep / get rid of marks with a short note, for friends and for groups.
 * { friend: { [id]: { m: 'keep' | 'cut', n: 'note' } }, group: { ... } } kept on this machine only.
 */
import { ref } from 'vue';

import configRepository from './config';

const KEY = 'Aurora_decisions';
export const decisions = ref({ friend: {}, group: {} });
let loaded = false;

const MARKS = ['keep', 'cut'];

/** Drop anything malformed so a bad config value can never break the page. */
export function cleanDecisions(raw) {
    const out = { friend: {}, group: {} };
    for (const kind of Object.keys(out)) {
        const src = raw && typeof raw === 'object' ? raw[kind] : null;
        if (!src || typeof src !== 'object') continue;
        for (const [id, v] of Object.entries(src)) {
            if (!v || typeof v !== 'object') continue;
            const m = MARKS.includes(v.m) ? v.m : '';
            const n = typeof v.n === 'string' ? v.n.slice(0, 500) : '';
            if (m || n) out[kind][id] = { m, n };
        }
    }
    return out;
}

/** Immutable update. An entry with no mark and no note is removed. */
export function withDecision(all, kind, id, patch) {
    const cur = all[kind]?.[id] || { m: '', n: '' };
    const next = { m: cur.m, n: cur.n, ...patch };
    const bucket = { ...all[kind] };
    if (next.m || next.n) bucket[id] = next;
    else delete bucket[id];
    return { ...all, [kind]: bucket };
}

export async function initDecisions() {
    if (loaded) return;
    loaded = true;
    try {
        decisions.value = cleanDecisions(JSON.parse(await configRepository.getString(KEY, '{}')));
    } catch {
        decisions.value = cleanDecisions(null);
    }
}

export function getDecision(kind, id) {
    return decisions.value[kind]?.[id] || { m: '', n: '' };
}

export function setDecision(kind, id, patch) {
    decisions.value = withDecision(decisions.value, kind, id, patch);
    configRepository.setString(KEY, JSON.stringify(decisions.value));
}
