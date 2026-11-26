/**
 * Group folders: put groups together under a name you choose, so they sit side by side in the
 * Groups tab. The folders themselves only exist on this machine.
 * Stored as [{ id, name, open, visible, ids: [groupId, ...] }].
 * The order of the folders is written to VRChat's in-game group order (your groups list in VRChat),
 * and a folder's visibility switches all its groups between visible and hidden on your profile.
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
        out.push({ id: String(f.id || `f${out.length}-${Date.now()}`), name: f.name.trim().slice(0, 40), open: f.open !== false, visible: f.visible !== false, ids });
    }
    return out;
}

export function addFolder(name) {
    const clean = String(name || '').trim().slice(0, 40);
    if (!clean) return;
    groupFolders.value.push({ id: `f${Date.now()}`, name: clean, open: true, visible: true, ids: [] });
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// loaded on demand so the pure helpers above stay importable without the whole app (tests)
async function deps() {
    const [{ toast }, { groupRequest }, { normalizeGroupOrder }, { useGroupStore }, { useUserStore }] = await Promise.all([
        import('vue-sonner'),
        import('../api'),
        import('../shared/utils/groupOrder'),
        import('../stores/group'),
        import('../stores/user')
    ]);
    return { toast, groupRequest, normalizeGroupOrder, useGroupStore, useUserStore };
}

/** Moves a folder up (-1) or down (1) in the list, then writes the new order to VRChat. */
export async function moveFolder(folderId, dir) {
    const list = groupFolders.value;
    const i = list.findIndex((f) => f.id === folderId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await applyFolderOrder();
}

/**
 * Writes the in-game group order: folders top to bottom (groups inside keep their folder order),
 * then every group without a folder in the order it already had.
 */
export async function applyFolderOrder() {
    const { toast, normalizeGroupOrder, useGroupStore, useUserStore } = await deps();
    const user = useUserStore().currentUser;
    const mine = [...useGroupStore().currentUserGroups.keys()];
    if (!user?.id || !mine.length || typeof AppApi === 'undefined') return false;
    try {
        const { updateInGameGroupOrder } = await import('../coordinators/groupCoordinator');
        await updateInGameGroupOrder();
        const current = normalizeGroupOrder(useGroupStore().inGameGroupOrder, mine);
        const inFolders = [];
        for (const f of groupFolders.value) {
            for (const id of f.ids) if (mine.includes(id) && !inFolders.includes(id)) inFolders.push(id);
        }
        const order = [...inFolders, ...current.filter((id) => !inFolders.includes(id))];
        await AppApi.SetVRChatRegistryKey(`VRC_GROUP_ORDER_${user.id}`, JSON.stringify(order), 3);
        useGroupStore().setInGameGroupOrder(order);
        return true;
    } catch (err) {
        console.error(err);
        toast.error('Could not write the in-game group order');
        return false;
    }
}

/** Shows or hides every group of a folder on your VRChat profile. */
export async function setFolderVisible(folderId, visible) {
    const { toast, groupRequest, useGroupStore, useUserStore } = await deps();
    const f = groupFolders.value.find((x) => x.id === folderId);
    const userId = useUserStore().currentUser?.id;
    if (!f || !userId) return;
    f.visible = visible;
    const mine = useGroupStore().currentUserGroups;
    let failed = 0;
    for (const id of f.ids) {
        if (!mine.has(id)) continue;
        try {
            await groupRequest.setGroupMemberProps(userId, id, { visibility: visible ? 'visible' : 'hidden' });
        } catch {
            failed++;
        }
        await sleep(450);
    }
    if (failed) toast.warning(`${failed} group(s) could not be changed`);
    else toast.success(visible ? `${f.name} is visible again` : `${f.name} hidden on your profile`);
}
