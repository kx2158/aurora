/**
 * New friends that do not have a note yet, shown on the Home page so you remember who they are.
 * Everything stays on this machine.
 */
import { ref } from 'vue';

import configRepository from './config';

/** Friends added recently that still have no note: [{ id, name, at }] */
export const pendingNotes = ref([]);

const KEY = 'Aurora_pendingNotes';
let loaded = false;

export async function initPendingNotes() {
    if (loaded) {
        return;
    }
    loaded = true;
    try {
        const list = JSON.parse(await configRepository.getString(KEY, '[]'));
        pendingNotes.value = Array.isArray(list) ? list.slice(0, 50) : [];
    } catch {
        pendingNotes.value = [];
    }
}

function persist() {
    configRepository.setString(KEY, JSON.stringify(pendingNotes.value.slice(0, 50)));
}

/** Called when VRChat reports a new friend. */
export async function queueNewFriend(id, name) {
    if (!id || pendingNotes.value.some((f) => f.id === id)) {
        return;
    }
    await initPendingNotes();
    pendingNotes.value = [{ id, name: name || 'a new friend', at: Date.now() }, ...pendingNotes.value];
    persist();
}

export function clearPending(id) {
    pendingNotes.value = pendingNotes.value.filter((f) => f.id !== id);
    persist();
}
