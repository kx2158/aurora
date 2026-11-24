/**
 * Group folders: put groups together under a name you choose, so they sit side by side in the
 * Groups tab. Folders only exist on this machine, VRChat never hears about them.
 * Stored as [{ id, name, open, ids: [groupId, ...] }].
 */
import { ref, watch } from 'vue';

import configRepository from './config';

const KEY = 'Aurora_groupFolders';

export const groupFolders = ref([]);
let loaded = false;

export async function initGroupFolders() {
    if (loaded) return;
    loaded = true;
    try {
        groupFolders.value = cleanFolders(JSON.parse(await configRepository.getString(KEY, '[]')));
    } catch {
        groupFolders.value = [];
    }
    watch(groupFolders, () => configRepository.setString(KEY, JSON.stringify(groupFolders.value)), { deep: true });
}

/**
 * @param {unknown} raw parsed config value
 * @returns {{id: string, name: string, open: boolean, ids: string[]}[]} only valid folders
 */
export function cleanFolders(raw) {
    if (!Array.isArray(raw)) return [];
    const taken = new Set();
    const out = [];
    for (const f of raw) {
        if (!f || typeof f.name !== 'string' || !f.name.trim()) continue;
        const ids = (Array.isArray(f.ids) ? f.ids : []).filter((id) => typeof id === 'string' && !taken.has(id));
        ids.forEach((id) => taken.add(id));
        out.push({ id: String(f.id || `f${out.length}-${Date.now()}`), name: f.name.trim().slice(0, 40), open: f.open !== false, ids });
    }
    return out;
}

export function addFolder(name) {
    const clean = String(name || '').trim().slice(0, 40);
    if (!clean) return;
    groupFolders.value.push({ id: `f${Date.now()}`, name: clean, open: true, ids: [] });
}

export function removeFolder(folderId) {
    groupFolders.value = groupFolders.value.filter((f) => f.id !== folderId);
}

/** Moves a group into a folder, or out of all folders when folderId is empty. */
export function moveGroup(groupId, folderId) {
    for (const f of groupFolders.value) {
        f.ids = f.ids.filter((id) => id !== groupId);
    }
    const target = groupFolders.value.find((f) => f.id === folderId);
    if (target) target.ids.push(groupId);
}

export function folderOf(groupId) {
    return groupFolders.value.find((f) => f.ids.includes(groupId))?.id || '';
}

/**
 * Splits groups into their folders (in folder order) and the loose rest.
 * @param {{id: string}[]} groups already filtered and sorted
 * @param {{id: string, name: string, open: boolean, ids: string[]}[]} folders
 * @returns {{folder: object|null, groups: object[]}[]} folders first, loose groups last
 */
export function sectionsFor(groups, folders) {
    const used = new Set();
    const sections = [];
    for (const folder of folders) {
        const inside = groups.filter((g) => folder.ids.includes(g.id));
        inside.forEach((g) => used.add(g.id));
        sections.push({ folder, groups: inside });
    }
    sections.push({ folder: null, groups: groups.filter((g) => !used.has(g.id)) });
    return sections;
}
