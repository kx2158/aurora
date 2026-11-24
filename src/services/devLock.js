import { ref } from 'vue';

import configRepository from './config.js';

// Only the SHA-256 of the developer password is kept here, never the password itself.
const HASH = '3e01110b5bdf3e1a01f2346ceb648476ead254be59b1590077f5a5ab8877f369';
const KEY = 'Aura_devUnlocked';

export const devUnlocked = ref(false);

async function sha256(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function initDevLock() {
    devUnlocked.value = (await configRepository.getString(KEY, '')) === HASH;
}

/** @returns {Promise<boolean>} true when the password was right */
export async function tryUnlock(password) {
    if ((await sha256(String(password))) !== HASH) return false;
    devUnlocked.value = true;
    await configRepository.setString(KEY, HASH);
    return true;
}

export async function lockDev() {
    devUnlocked.value = false;
    await configRepository.setString(KEY, '');
}
