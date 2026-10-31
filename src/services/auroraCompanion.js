/**
 * Neon the floating companion: settings and the "add a note for your new friend" reminders.
 * Everything stays on this machine.
 */
import { ref } from 'vue';

import configRepository from './config';

export const companionEnabled = ref(true);
export const noteReminders = ref(true);
/** 'roam' floats around the whole app, 'dock' rests next to the info dock. */
export const companionHome = ref('roam');
/** Friends added recently that still have no note: [{ id, name, at }] */
export const pendingNotes = ref([]);

const KEY = 'Aurora_pendingNotes';
let loaded = false;

export async function initCompanion() {
    if (loaded) {
        return;
    }
    loaded = true;
    companionEnabled.value = await configRepository.getBool('Aurora_companionEnabled', true);
    noteReminders.value = await configRepository.getBool('Aurora_noteReminders', true);
    companionHome.value = await configRepository.getString('Neon_companionHome', 'roam');
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

export function setCompanionEnabled(value) {
    companionEnabled.value = value;
    configRepository.setBool('Aurora_companionEnabled', value);
}

export function setNoteReminders(value) {
    noteReminders.value = value;
    configRepository.setBool('Aurora_noteReminders', value);
}

/** Called when VRChat reports a new friend. */
export async function queueNewFriend(id, name) {
    if (!id || pendingNotes.value.some((f) => f.id === id)) {
        return;
    }
    await initCompanion();
    pendingNotes.value = [{ id, name: name || 'a new friend', at: Date.now() }, ...pendingNotes.value];
    persist();
}

export function clearPending(id) {
    pendingNotes.value = pendingNotes.value.filter((f) => f.id !== id);
    persist();
}

export function setCompanionHome(value) {
    companionHome.value = value === 'dock' ? 'dock' : 'roam';
    configRepository.setString('Neon_companionHome', companionHome.value);
}
