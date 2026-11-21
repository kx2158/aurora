/**
 * The password lock on Aurora's body estimation. Unlock it once and it stays unlocked on this PC.
 * Only the SHA-256 of the password is in the code. It is a gate for the UI, not real security.
 */
import { ref } from 'vue';

import configRepository from './config';

const KEY = 'Aurora_body_unlocked';
export const PASSWORD_HASH = '3a0e99b8dbdba687cf16b0633122fb38a9cd70ced36530fb405de6f78c4f59c4';

export const bodyUnlocked = ref(false);

let loaded = false;

export async function sha256Hex(text) {
    const bytes = new TextEncoder().encode(String(text));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function initBodyLock() {
    if (loaded) return;
    loaded = true;
    bodyUnlocked.value = await configRepository.getBool(KEY, false);
}

/** True when the password is right, and from then on the body tools are unlocked. */
export async function tryUnlock(password) {
    let ok = false;
    try {
        ok = (await sha256Hex(String(password).trim())) === PASSWORD_HASH;
    } catch {
        ok = false;
    }
    if (ok) {
        bodyUnlocked.value = true;
        await configRepository.setBool(KEY, true);
    }
    return ok;
}

export async function lockBody() {
    bodyUnlocked.value = false;
    await configRepository.setBool(KEY, false);
}
