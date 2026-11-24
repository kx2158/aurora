import { ref } from 'vue';

import { userRequest } from '../api';
import configRepository from './config.js';

const KEY = 'Aura_ageCache';
const GAP_MS = 1200;

/** userId -> 'ageVerificationStatus' string ('18+', 'verified', 'hidden', or 'none') */
export const ageCache = ref({});
export const ageFetching = ref(false);
let loaded = false;

export async function initAgeCache() {
    if (loaded) return;
    loaded = true;
    try {
        ageCache.value = JSON.parse(await configRepository.getString(KEY, '{}')) || {};
    } catch {
        ageCache.value = {};
    }
}

/** Friends whose age status is not known yet and has never been fetched. */
export function missingIds(ids, cache) {
    return ids.filter((id) => !(id in cache));
}

/** Applies a cached status to a row that VRChat's friend list left blank. */
export function withCachedAge(row, cache) {
    if (row.age !== 'unknown') return row;
    const s = cache[row.id];
    if (s === '18+') return { ...row, age: '18plus' };
    if (s === 'verified') return { ...row, age: 'verified' };
    if (s === 'hidden') return { ...row, age: 'hidden' };
    return row;
}

/**
 * One look-up per friend, ever. Friends that already have a cached answer are skipped, so after the first run
 * only new friends cost a request. A failed request is not cached, so it is tried again next time.
 */
export async function fetchMissingAges(ids) {
    await initAgeCache();
    if (ageFetching.value) return;
    const todo = missingIds(ids, ageCache.value);
    if (!todo.length) return;
    ageFetching.value = true;
    try {
        for (const id of todo) {
            try {
                const args = await userRequest.getUser({ userId: id });
                const s = args?.json?.ageVerificationStatus;
                const status = s === '18+' || s === 'verified' || s === 'hidden' ? s : args?.json?.ageVerified ? 'verified' : 'none';
                ageCache.value = { ...ageCache.value, [id]: status };
                configRepository.setString(KEY, JSON.stringify(ageCache.value));
            } catch (err) {
                console.error('age lookup failed', err);
                break;
            }
            await new Promise((r) => setTimeout(r, GAP_MS));
        }
    } finally {
        ageFetching.value = false;
    }
}
