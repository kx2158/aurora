/**
 * Auto reject group invites: when on, every group invite that arrives is declined right away,
 * so nothing pops up and nothing stays in the notification list. Lives in config on this machine.
 */
import { ref } from 'vue';

import configRepository from './config';

const KEY = 'Aurora_autoRejectGroupInvites';

export const autoRejectGroupInvites = ref(false);
let loaded = false;

/** Reads the saved switch once. */
export async function loadGroupInviteSetting() {
    if (loaded) return;
    loaded = true;
    autoRejectGroupInvites.value = await configRepository.getBool(KEY, false);
}

/**
 * @param {boolean} on
 */
export async function setAutoRejectGroupInvites(on) {
    autoRejectGroupInvites.value = Boolean(on);
    await configRepository.setBool(KEY, Boolean(on));
}

/**
 * Picks the response that declines an invite, whatever VRChat calls it.
 * @param {{type?: string}[]} responses the notification's responses
 * @returns {string|null} the response type, or null if there is no decline option
 */
export function declineResponseType(responses) {
    if (!Array.isArray(responses)) return null;
    const hit = responses.find((r) => /^(decline|reject|deny|ignore)/i.test(String(r?.type || '')));
    return hit ? hit.type : null;
}
