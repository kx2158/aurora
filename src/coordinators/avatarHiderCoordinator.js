import { avatarRequest } from '../api';
import configRepository from '../services/config.js';
import { extractFileId } from '../shared/utils/fileUtils.js';

const CONFIG_KEY = 'AvatarHider_blocked';
const GUARD_INTERVAL_MS = 60 * 1000;

let guardTimer = null;

function hasBackend() {
    return typeof window !== 'undefined' && typeof window.AssetBundleManager !== 'undefined';
}

/**
 * @returns {Promise<Array<{hash: string, name: string, avatarId: string, addedAt: string}>>}
 */
async function getBlockedList() {
    const list = await configRepository.getObject(CONFIG_KEY, []);
    return Array.isArray(list) ? list : [];
}

async function saveBlockedList(list) {
    await configRepository.setObject(CONFIG_KEY, list);
}

/**
 * Re-creates placeholders for every blocked hash. Safe to call repeatedly.
 * @returns {Promise<{locked: number, pending: number, errors: number} | null>}
 */
async function runGuard() {
    if (!hasBackend()) return null;
    try {
        const list = await getBlockedList();
        if (!list.length) return { locked: 0, pending: 0, errors: 0 };
        const res = await window.AssetBundleManager.EnsureBlocked(JSON.stringify(list.map((b) => b.hash)));
        return JSON.parse(res);
    } catch (err) {
        console.error('Avatar hider guard failed', err);
        return null;
    }
}

function startGuard() {
    if (guardTimer || !hasBackend()) return;
    runGuard();
    guardTimer = setInterval(runGuard, GUARD_INTERVAL_MS);
}

/**
 * Cache folder hashes for a list of avatar unityPackages (all variants that VRChat may use).
 * @param {Array<object>} unityPackages
 * @returns {Promise<string[]>}
 */
async function hashesForUnityPackages(unityPackages) {
    const items = [];
    const seen = new Set();
    for (const pkg of unityPackages || []) {
        if (pkg.platform !== 'standalonewindows') continue;
        const id = extractFileId(pkg.assetUrl);
        if (!id) continue;
        for (const variant of ['', 'security', pkg.variant || '']) {
            const key = `${id}|${variant}`;
            if (seen.has(key)) continue;
            seen.add(key);
            items.push({ id, variant });
        }
    }
    if (!items.length) return [];
    const res = JSON.parse(await window.AssetBundleManager.GetAssetIds(JSON.stringify(items)));
    return [...new Set(res.map((r) => r.hash))];
}

/**
 * Fetches an avatar and returns its name and all possible cache hashes.
 * @param {string} avatarId
 */
async function resolveAvatar(avatarId) {
    const args = await avatarRequest.getAvatar({ avatarId });
    const json = args.json;
    return {
        name: json.name || avatarId,
        hashes: await hashesForUnityPackages(json.unityPackages)
    };
}

export {
    getBlockedList,
    saveBlockedList,
    runGuard,
    startGuard,
    hashesForUnityPackages,
    resolveAvatar,
    hasBackend
};
