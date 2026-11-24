/**
 * Keeps your badges hidden. VRChat sometimes shows a badge again (a new one, or after an update),
 * so Aura looks at your badges when you log in, whenever your profile refreshes, and every few
 * minutes, and hides any that are visible. Stealth mode turns this on too.
 */
import { ref, watch } from 'vue';

import { miscRequest } from '../api';
import { useUserStore } from '../stores/user';
import configRepository from './config';
import { stealth } from './stealthMode';

const KEY = 'Aurora_keepBadgesHidden';
export const keepBadgesHidden = ref(false);
let loaded = false;
let running = false;

/**
 * @param {{hidden?: boolean, showcased?: boolean}[]} badges
 * @returns {object[]} the badges that are still visible
 */
export function visibleBadges(badges) {
    return (badges || []).filter((b) => b && (!b.hidden || b.showcased));
}

export async function setKeepBadgesHidden(on) {
    keepBadgesHidden.value = Boolean(on);
    await configRepository.setBool(KEY, Boolean(on));
    if (on) enforceBadges();
}

export async function enforceBadges() {
    if (running || !(keepBadgesHidden.value || stealth.value.on)) return;
    running = true;
    try {
        for (const b of visibleBadges(useUserStore().currentUser?.badges)) {
            try {
                await miscRequest.updateBadge({ badgeId: b.badgeId, hidden: true, showcased: false });
                b.hidden = true;
                b.showcased = false;
            } catch (err) {
                console.error('Could not hide badge', b.badgeId, err);
            }
            await new Promise((r) => setTimeout(r, 500));
        }
    } finally {
        running = false;
    }
}

export async function initBadgeGuard() {
    if (loaded) return;
    loaded = true;
    keepBadgesHidden.value = await configRepository.getBool(KEY, false);
    const user = useUserStore();
    // whenever the badge list changes (login, refresh, a new badge)
    watch(
        () => JSON.stringify((user.currentUser?.badges || []).map((b) => [b.badgeId, b.hidden, b.showcased])),
        () => enforceBadges()
    );
    setInterval(enforceBadges, 5 * 60 * 1000);
    enforceBadges();
}
