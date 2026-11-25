import { watch } from 'vue';
import { toast } from 'vue-sonner';

import { favoriteRequest, groupRequest, playerModerationRequest, userRequest } from '../api';
import { router } from '../plugins/router';
import { useUserStore } from '../stores/user';
import { watchState } from '../services/watchState';
import configRepository from '../services/config.js';

const SNAPSHOTS_KEY = 'AccountSync_snapshots';
const LAST_USER_KEY = 'AccountSync_lastUserId';
const PROMPT_KEY = 'AccountSync_promptOnSwitch';
const SNAPSHOT_DELAY_MS = 10 * 1000;
const SNAPSHOT_INTERVAL_MS = 30 * 60 * 1000;
const WRITE_DELAY_MS = 1200; // be gentle with VRChat's rate limits

let snapshotTimer = null;
let started = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function describeError(err) {
    return err?.message || String(err);
}

// #region snapshots

/**
 * @returns {Promise<Record<string, object>>} snapshots keyed by user id
 */
export async function getSnapshots() {
    const all = await configRepository.getObject(SNAPSHOTS_KEY, {});
    return all && typeof all === 'object' ? all : {};
}

export async function deleteSnapshot(userId) {
    const all = await getSnapshots();
    delete all[userId];
    await configRepository.setObject(SNAPSHOTS_KEY, all);
}

export async function getPromptOnSwitch() {
    return configRepository.getBool(PROMPT_KEY, true);
}

export async function setPromptOnSwitch(value) {
    await configRepository.setBool(PROMPT_KEY, !!value);
}

async function fetchAllFavorites(type) {
    const out = [];
    const n = 100;
    for (let offset = 0; offset < 1000; offset += n) {
        const { json } = await favoriteRequest.getFavorites({ n, offset, type });
        if (!Array.isArray(json)) break;
        out.push(...json);
        if (json.length < n) break;
    }
    return out;
}

/**
 * Saves what this account currently has (profile, groups, blocks/mutes, favorite worlds and avatars)
 * so it can be copied onto another account later.
 * @returns {Promise<object>} the snapshot
 */
export async function captureSnapshot() {
    const userStore = useUserStore();
    const user = userStore.currentUser;
    if (!user?.id) throw new Error('Not logged in');

    const snapshot = {
        userId: user.id,
        displayName: user.displayName,
        takenAt: new Date().toISOString(),
        profile: {
            bio: user.bio ?? '',
            bioLinks: Array.isArray(user.bioLinks) ? user.bioLinks : [],
            status: user.status ?? '',
            statusDescription: user.statusDescription ?? '',
            pronouns: user.pronouns ?? ''
        },
        groups: [],
        moderations: [],
        favoriteWorlds: [],
        favoriteAvatars: [],
        errors: []
    };

    try {
        const { json } = await groupRequest.getGroups({ userId: user.id });
        snapshot.groups = (Array.isArray(json) ? json : []).map((g) => ({
            id: g.groupId ?? g.id,
            name: g.name,
            shortCode: g.shortCode,
            isRepresenting: !!g.isRepresenting
        }));
    } catch (err) {
        snapshot.errors.push(`groups: ${describeError(err)}`);
    }

    try {
        const { json } = await playerModerationRequest.getPlayerModerations();
        snapshot.moderations = (Array.isArray(json) ? json : []).map((m) => ({
            type: m.type,
            userId: m.targetUserId,
            displayName: m.targetDisplayName
        }));
    } catch (err) {
        snapshot.errors.push(`moderations: ${describeError(err)}`);
    }

    for (const [type, key] of [
        ['world', 'favoriteWorlds'],
        ['avatar', 'favoriteAvatars']
    ]) {
        try {
            const list = await fetchAllFavorites(type);
            snapshot[key] = list.map((f) => ({
                id: f.favoriteId,
                group: Array.isArray(f.tags) ? f.tags[0] : f.tags
            }));
        } catch (err) {
            snapshot.errors.push(`${type} favorites: ${describeError(err)}`);
        }
    }

    const all = await getSnapshots();
    // keep the old part of a section if fetching it failed this time
    const previous = all[user.id];
    if (previous) {
        if (snapshot.errors.some((e) => e.startsWith('groups'))) snapshot.groups = previous.groups || [];
        if (snapshot.errors.some((e) => e.startsWith('moderations'))) {
            snapshot.moderations = previous.moderations || [];
        }
        if (snapshot.errors.some((e) => e.startsWith('world'))) {
            snapshot.favoriteWorlds = previous.favoriteWorlds || [];
        }
        if (snapshot.errors.some((e) => e.startsWith('avatar'))) {
            snapshot.favoriteAvatars = previous.favoriteAvatars || [];
        }
    }
    all[user.id] = snapshot;
    await configRepository.setObject(SNAPSHOTS_KEY, all);
    return snapshot;
}

// #endregion

// #region applying

/**
 * Copies parts of a saved snapshot onto the account that is logged in right now.
 *
 * @param {string} sourceUserId account whose snapshot to copy from
 * @param {{profile?: boolean, groups?: boolean, moderations?: boolean, favoriteWorlds?: boolean, favoriteAvatars?: boolean}} what
 * @param {{onProgress?: function(string): void, signal?: AbortSignal}} [options]
 * @returns {Promise<object>} summary per section
 */
export async function applySnapshot(sourceUserId, what, { onProgress, signal } = {}) {
    const userStore = useUserStore();
    const me = userStore.currentUser;
    if (!me?.id) throw new Error('Not logged in');
    if (me.id === sourceUserId) throw new Error('Pick a different account than the one you are logged into');

    const snapshots = await getSnapshots();
    const snap = snapshots[sourceUserId];
    if (!snap) throw new Error('No saved data for that account');

    const log = (msg) => onProgress?.(msg);
    const cancelled = () => signal?.aborted;
    const summary = {};

    // profile
    if (what.profile && !cancelled()) {
        log('Copying profile...');
        try {
            await userRequest.saveCurrentUser({ ...snap.profile });
            summary.profile = { ok: true };
        } catch (err) {
            summary.profile = { ok: false, error: describeError(err) };
        }
    }

    // groups
    if (what.groups && !cancelled()) {
        const result = { joined: 0, requested: 0, already: 0, failed: [] };
        summary.groups = result;
        let mine = new Set();
        try {
            const { json } = await groupRequest.getGroups({ userId: me.id });
            mine = new Set((Array.isArray(json) ? json : []).map((g) => g.groupId ?? g.id));
        } catch (err) {
            log(`Could not read this account's groups: ${describeError(err)}`);
        }
        let index = 0;
        for (const g of snap.groups || []) {
            if (cancelled()) break;
            index++;
            if (mine.has(g.id)) {
                result.already++;
                continue;
            }
            log(`Groups ${index}/${snap.groups.length}: ${g.name || g.id}`);
            try {
                const { json } = await groupRequest.joinGroup({ groupId: g.id });
                if (json?.membershipStatus === 'requested' || json?.membershipStatus === 'invited') {
                    result.requested++;
                } else {
                    result.joined++;
                    mine.add(g.id);
                }
            } catch (err) {
                result.failed.push(`${g.name || g.id}: ${describeError(err)}`);
            }
            await sleep(WRITE_DELAY_MS);
        }
        const represented = (snap.groups || []).find((g) => g.isRepresenting);
        if (represented && mine.has(represented.id) && !cancelled()) {
            try {
                await groupRequest.setGroupRepresentation(represented.id, { isRepresenting: true });
            } catch (err) {
                result.failed.push(`Representing ${represented.name || represented.id}: ${describeError(err)}`);
            }
        }
    }

    // blocks, mutes, avatar hiding
    if (what.moderations && !cancelled()) {
        const result = { added: 0, already: 0, failed: [] };
        summary.moderations = result;
        const existing = new Set();
        try {
            const { json } = await playerModerationRequest.getPlayerModerations();
            for (const m of Array.isArray(json) ? json : []) existing.add(`${m.type}:${m.targetUserId}`);
        } catch (err) {
            log(`Could not read this account's blocks: ${describeError(err)}`);
        }
        let index = 0;
        for (const m of snap.moderations || []) {
            if (cancelled()) break;
            index++;
            if (existing.has(`${m.type}:${m.userId}`)) {
                result.already++;
                continue;
            }
            log(`Blocks and mutes ${index}/${snap.moderations.length}: ${m.displayName || m.userId}`);
            try {
                await playerModerationRequest.sendPlayerModeration({ moderated: m.userId, type: m.type });
                result.added++;
            } catch (err) {
                result.failed.push(`${m.displayName || m.userId}: ${describeError(err)}`);
            }
            await sleep(WRITE_DELAY_MS);
        }
    }

    // favorite worlds / avatars
    for (const [flag, key, type, label] of [
        ['favoriteWorlds', 'favoriteWorlds', 'world', 'Favorite worlds'],
        ['favoriteAvatars', 'favoriteAvatars', 'avatar', 'Favorite avatars']
    ]) {
        if (!what[flag] || cancelled()) continue;
        const result = { added: 0, already: 0, failed: [] };
        summary[key] = result;
        const existing = new Set();
        try {
            for (const f of await fetchAllFavorites(type)) existing.add(f.favoriteId);
        } catch (err) {
            log(`Could not read this account's ${type} favorites: ${describeError(err)}`);
        }
        let index = 0;
        for (const f of snap[key] || []) {
            if (cancelled()) break;
            index++;
            if (existing.has(f.id)) {
                result.already++;
                continue;
            }
            log(`${label} ${index}/${snap[key].length}`);
            try {
                await favoriteRequest.addFavorite({ type, favoriteId: f.id, tags: f.group });
                result.added++;
            } catch (err) {
                result.failed.push(`${f.id}: ${describeError(err)}`);
            }
            await sleep(WRITE_DELAY_MS);
        }
    }

    if (cancelled()) summary.cancelled = true;
    return summary;
}

// #endregion

// #region switch detection

async function onLoggedIn() {
    const userStore = useUserStore();
    const me = userStore.currentUser;
    if (!me?.id) return;

    const previousId = await configRepository.getString(LAST_USER_KEY, '');
    await configRepository.setString(LAST_USER_KEY, me.id);

    if (previousId && previousId !== me.id && (await getPromptOnSwitch())) {
        const snapshots = await getSnapshots();
        const from = snapshots[previousId];
        if (from) {
            toast(`You switched from ${from.displayName} to ${me.displayName}`, {
                description: 'Copy your groups, profile and more from the other account?',
                duration: 60 * 1000,
                action: {
                    label: 'Copy...',
                    onClick: () => router.push({ name: 'account-sync', query: { from: previousId } })
                }
            });
        }
    }

    // take a fresh snapshot of this account once its data has loaded, then keep it fresh
    clearInterval(snapshotTimer);
    setTimeout(() => {
        if (watchState.isLoggedIn) captureSnapshot().catch((err) => console.error('Account snapshot failed', err));
    }, SNAPSHOT_DELAY_MS);
    snapshotTimer = setInterval(() => {
        if (watchState.isLoggedIn) captureSnapshot().catch((err) => console.error('Account snapshot failed', err));
    }, SNAPSHOT_INTERVAL_MS);
}

export function startAccountSync() {
    if (started) return;
    started = true;
    watch(
        () => watchState.isLoggedIn,
        (isLoggedIn) => {
            if (isLoggedIn) {
                onLoggedIn().catch((err) => console.error('Account sync start failed', err));
            } else {
                clearInterval(snapshotTimer);
                snapshotTimer = null;
            }
        },
        { immediate: true }
    );
}

// #endregion
