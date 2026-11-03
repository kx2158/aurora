/**
 * Status rules: switch your VRChat status while chosen people are online, and put it back afterwards.
 * Everything stays on this machine.
 */
import { ref } from 'vue';

import { userRequest } from '../api';
import { useUserStore } from '../stores/user';
import configRepository from './config';

export const rules = ref({ enabled: false, ids: [], status: 'busy', desc: '', restore: true });
let loaded = false;
let before = null;
const online = new Set();

export async function initStatusRules() {
    if (loaded) return;
    loaded = true;
    try {
        const saved = JSON.parse(await configRepository.getString('Neon_statusRules', '{}'));
        rules.value = { ...rules.value, ...saved };
    } catch {
        // keep defaults
    }
}

export function saveRules() {
    configRepository.setString('Neon_statusRules', JSON.stringify(rules.value));
}

export function addWatched(id, name) {
    if (!id || rules.value.ids.some((w) => w.id === id)) return;
    rules.value.ids = [...rules.value.ids, { id, name: name || id }];
    saveRules();
}

export function removeWatched(id) {
    rules.value.ids = rules.value.ids.filter((w) => w.id !== id);
    online.delete(id);
    saveRules();
}

const isWatched = (id) => rules.value.ids.some((w) => w.id === id);

async function apply() {
    const me = useUserStore().currentUser;
    if (!me?.id) return;
    if (online.size > 0) {
        if (!before) before = { status: me.status, statusDescription: me.statusDescription || '' };
        if (me.status === rules.value.status) return;
        const params = { status: rules.value.status };
        if (rules.value.desc) params.statusDescription = rules.value.desc;
        await userRequest.saveCurrentUser(params).catch(() => {});
    } else if (before) {
        const prev = before;
        before = null;
        if (rules.value.restore) await userRequest.saveCurrentUser(prev).catch(() => {});
    }
}

/** Called by the friend presence code when a friend comes online or goes offline. */
export async function statusRuleFriendChange(id, isOnline) {
    await initStatusRules();
    if (!rules.value.enabled || !isWatched(id)) return;
    if (isOnline) online.add(id);
    else online.delete(id);
    await apply();
}
