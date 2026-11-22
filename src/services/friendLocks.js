/**
 * Locked friends: a lock protects a friend from every cleanup tool in the Friends manager.
 * Locked friends are never suggested, never selected by "select all" or a typed list, and
 * cannot be unfriended until you unlock them. Stored on this machine only.
 */
import { ref } from 'vue';

import configRepository from './config';

export const lockedIds = ref(new Set());

const KEY = 'Aurora_lockedFriends';
let loaded = false;

export async function initFriendLocks() {
    if (loaded) {
        return;
    }
    loaded = true;
    try {
        const list = JSON.parse(await configRepository.getString(KEY, '[]'));
        lockedIds.value = new Set(Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []);
    } catch {
        lockedIds.value = new Set();
    }
}

function persist() {
    configRepository.setString(KEY, JSON.stringify([...lockedIds.value]));
}

export function isLocked(id) {
    return lockedIds.value.has(id);
}

export function setLocked(id, locked) {
    if (!id) {
        return;
    }
    const next = new Set(lockedIds.value);
    if (locked) next.add(id);
    else next.delete(id);
    lockedIds.value = next;
    persist();
}

/** Lock or unlock many at once, one write. */
export function setManyLocked(ids, locked) {
    const next = new Set(lockedIds.value);
    for (const id of ids) {
        if (!id) continue;
        if (locked) next.add(id);
        else next.delete(id);
    }
    lockedIds.value = next;
    persist();
}
