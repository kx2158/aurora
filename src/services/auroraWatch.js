/**
 * Instance watch: a quiet helper for hosts and group staff.
 *
 * When someone joins the instance you are in, Aurora looks at who they are and flags:
 *   - people you have blocked or muted yourself
 *   - people on your watch list (with the note you wrote for them)
 *   - brand new accounts (younger than N days, when VRChat shares the join date)
 *   - visitors (the lowest trust rank)
 * Flagged joins show a notice in the app, on the VR wrist and in the desktop overlay, with a
 * shortcut to their profile. Aurora never moderates anyone by itself: what to do stays your call.
 * Everything stays on this machine.
 */
import { ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import { showUserDialog } from '../coordinators/userCoordinator';
import { useLocationStore } from '../stores/location';
import { useModerationStore } from '../stores/moderation';
import { useUserStore } from '../stores/user';
import configRepository from './config';

const KEY = 'Aurora_instanceWatch';

/** settings and the watch list: { enabled, blocked, watch, newAccounts, newDays, visitors, people: [{ id, name, note }] } */
export const instanceWatch = ref({
    enabled: true,
    blocked: true,
    watch: true,
    newAccounts: true,
    newDays: 30,
    visitors: false,
    people: []
});

/** The latest flagged join, for the wrist and the overlay: { id, name, text, at } */
export const watchAlert = ref(null);

let loaded = false;

export async function initInstanceWatch() {
    if (loaded) {
        return;
    }
    loaded = true;
    try {
        const saved = JSON.parse(await configRepository.getString(KEY, ''));
        if (saved && typeof saved === 'object') {
            instanceWatch.value = { ...instanceWatch.value, ...saved, people: Array.isArray(saved.people) ? saved.people : [] };
        }
    } catch {
        // first run, defaults are fine
    }
    watch(instanceWatch, () => configRepository.setString(KEY, JSON.stringify(instanceWatch.value)), { deep: true });
}

export function isWatched(id) {
    return instanceWatch.value.people.some((p) => p.id === id);
}

export function addWatched(id, name, note = '') {
    if (!id || isWatched(id)) {
        return;
    }
    instanceWatch.value.people = [...instanceWatch.value.people, { id, name: name || id, note }];
}

export function removeWatched(id) {
    instanceWatch.value.people = instanceWatch.value.people.filter((p) => p.id !== id);
}

export function toggleWatched(id, name) {
    if (isWatched(id)) {
        removeWatched(id);
    } else {
        addWatched(id, name);
    }
}

/** Days since the account was made, or -1 when VRChat did not tell us. */
function accountAge(user) {
    const joined = user?.date_joined;
    if (!joined) {
        return -1;
    }
    const t = Date.parse(joined);
    return Number.isNaN(t) ? -1 : Math.floor((Date.now() - t) / 86400000);
}

/**
 * Everything worth knowing about one person in the instance.
 * Each flag: { key, label, alert } where alert means it is worth a notice when they join.
 */
export function flagsFor(id) {
    const out = [];
    if (!id) {
        return out;
    }
    const s = instanceWatch.value;
    let user = null;
    try {
        user = useUserStore().cachedUsers.get(id) || null;
    } catch {
        // stores not ready
    }
    try {
        const mod = useModerationStore().getUserModerations(id);
        if (mod.isBlocked) {
            out.push({ key: 'blocked', label: 'You blocked them', alert: s.blocked });
        } else if (mod.isMuted) {
            out.push({ key: 'muted', label: 'You muted them', alert: false });
        }
    } catch {
        // no moderation data yet
    }
    const watched = s.people.find((p) => p.id === id);
    if (watched) {
        out.push({ key: 'watch', label: watched.note ? `Watch: ${watched.note}` : 'On your watch list', alert: s.watch });
    }
    const age = accountAge(user);
    if (age >= 0 && age < (Number(s.newDays) || 30)) {
        out.push({ key: 'new', label: age === 0 ? 'Account made today' : `Account ${age} days old`, alert: s.newAccounts });
    }
    if (user?.$trustLevel === 'Visitor') {
        out.push({ key: 'visitor', label: 'Visitor rank', alert: s.visitors });
    }
    return out;
}

/** Everyone in your instance right now, newest first, with their flags (for the overlay). */
export function herePeople() {
    let list = [];
    try {
        const users = useUserStore().cachedUsers;
        list = [...useLocationStore().lastLocation.playerList.values()].map((p) => {
            const u = users.get(p.userId);
            return {
                id: p.userId,
                name: p.displayName || u?.displayName || p.userId,
                since: p.joinTime || 0,
                trust: u?.$trustLevel || '',
                friend: !!u?.isFriend,
                watched: isWatched(p.userId),
                flags: flagsFor(p.userId).map((f) => ({ key: f.key, label: f.label }))
            };
        });
    } catch {
        // not in an instance yet
    }
    return list.sort((a, b) => b.since - a.since).slice(0, 80);
}

/** Someone joined your instance (from the game log). Old lines replayed at startup are ignored. */
export function watchPlayerJoined(id, name, when) {
    if (!id || !instanceWatch.value.enabled) {
        return;
    }
    const at = Date.parse(when) || Date.now();
    if (Date.now() - at > 90000) {
        return;
    }
    // give VRChat a moment to send their profile (join date, trust rank)
    setTimeout(() => {
        if (!useLocationStore().lastLocation.playerList.has(id)) {
            return;
        }
        const flags = flagsFor(id).filter((f) => f.alert);
        if (!flags.length) {
            return;
        }
        const text = flags.map((f) => f.label).join(' / ');
        watchAlert.value = { id, name: name || id, text, at: Date.now() };
        toast.warning(`${name || 'Someone'} joined`, {
            description: text,
            duration: 12000,
            action: { label: 'Profile', onClick: () => showUserDialog(id) }
        });
    }, 4000);
}

/** Opens someone's profile in the main window (from the overlays). */
export function openProfile(id) {
    try {
        AppApi.FocusWindow();
    } catch {
        // the browser preview has no window to focus
    }
    showUserDialog(id);
}
