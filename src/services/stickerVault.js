/**
 * Sticker vault: Aurora keeps its own copies of stickers on this computer, so VRChat's 18 slots only limit
 * what is live, not what you own. Stored stickers can be put on the account or swapped out, and ones marked
 * locked are put back automatically if they vanish from the account.
 */
const DB = 'aurora-sticker-vault';
const STORE = 'stickers';

function open() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function run(mode, fn) {
    const db = await open();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            const result = fn(tx.objectStore(STORE));
            tx.oncomplete = () => resolve(result?.result);
            tx.onerror = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

export const listVault = () => run('readonly', (s) => s.getAll());
export const saveVault = (record) => run('readwrite', (s) => s.put(record));
export const removeVault = (key) => run('readwrite', (s) => s.delete(key));

export function newKey() {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Upload settings that recreate a file the way it was made. */
export function paramsFor(file) {
    const animated = Number(file.frames) > 1;
    const tags = file.tags || [];
    const isEmoji = tags.includes('emojianimated') || tags.includes('emoji');
    const params = { tag: isEmoji ? (animated ? 'emojianimated' : 'emoji') : 'sticker', maskTag: 'square' };
    if (isEmoji) params.animationStyle = file.animationStyle || 'stop';
    if (animated) {
        params.frames = Number(file.frames);
        params.framesOverTime = Number(file.framesOverTime) || 10;
        if (file.loopStyle === 'pingpong') params.loopStyle = 'pingpong';
    }
    return params;
}

/**
 * Re-uploads every locked stored sticker that is no longer on the account.
 *
 * @param {Set<string>} presentIds file ids VRChat currently lists
 * @param {(record: object) => Promise<string>} reupload uploads the stored copy, returns the new file id
 * @returns {Promise<number>} how many were put back
 */
export async function restoreMissing(presentIds, reupload) {
    let restored = 0;
    for (const record of await listVault()) {
        if (!record.locked || !record.fileId || presentIds.has(record.fileId)) continue;
        try {
            const fileId = await reupload(record);
            await saveVault({ ...record, fileId, restoredAt: Date.now() });
            restored++;
        } catch (err) {
            console.error('sticker vault: could not put a sticker back', err);
        }
    }
    return restored;
}
