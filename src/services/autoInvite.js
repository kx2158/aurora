/**
 * Auto invite: pick friends, and the moment one of them comes online while you are in an instance,
 * Aurora sends them an invite to it. Each person has their own limit (how many invites at most),
 * so nobody gets pinged forever. Everything stays on this machine.
 */
import { ref, watch } from 'vue';
import { toast } from 'vue-sonner';

import { notificationRequest, queryRequest } from '../api';
import { isRealInstance, parseLocation } from '../shared/utils';
import { useGameStore } from '../stores/game';
import { useLocationStore } from '../stores/location';
import configRepository from './config';

const KEY = 'Aurora_autoInvite';
export const DEFAULT_MAX = 3;

/** { enabled, people: [{ id, name, max, sent }] } */
export const autoInvite = ref({ enabled: false, people: [] });
let loaded = false;

export async function initAutoInvite() {
    if (loaded) return;
    loaded = true;
    try {
        const saved = JSON.parse(await configRepository.getString(KEY, ''));
        if (saved && typeof saved === 'object') {
            autoInvite.value = {
                enabled: Boolean(saved.enabled),
                people: Array.isArray(saved.people) ? saved.people : []
            };
        }
    } catch {
        // first run
    }
    watch(autoInvite, () => configRepository.setString(KEY, JSON.stringify(autoInvite.value)), { deep: true });
}

/** Gives picked people their defaults. */
export function normalizePeople(list) {
    for (const p of list) {
        if (!Number.isFinite(p.max) || p.max < 1) p.max = DEFAULT_MAX;
        if (!Number.isFinite(p.sent) || p.sent < 0) p.sent = 0;
    }
}

/**
 * @param {{max?: number, sent?: number}|undefined} person
 * @returns {boolean} true while this person still has invites left
 */
export function hasInvitesLeft(person) {
    if (!person) return false;
    const max = Number.isFinite(person.max) && person.max >= 1 ? person.max : DEFAULT_MAX;
    return (person.sent || 0) < max;
}

export function resetCount(person) {
    person.sent = 0;
}

/** A friend came online (from the friend presence code). */
export async function autoInviteFriendOnline(userId) {
    await initAutoInvite();
    if (!autoInvite.value.enabled) return;
    const person = autoInvite.value.people.find((p) => p.id === userId);
    if (!hasInvitesLeft(person)) return;
    if (!useGameStore().isGameRunning) return;

    const { lastLocation, lastLocationDestination } = useLocationStore();
    let location = lastLocation.location;
    if (location === 'traveling') location = lastLocationDestination;
    if (!location || !isRealInstance(location)) return;
    // already with you, no need to invite
    if (lastLocation.friendList?.has?.(userId) || lastLocation.playerList?.has?.(userId)) return;

    const L = parseLocation(location);
    try {
        const args = await queryRequest.fetch('world.location', { worldId: L.worldId });
        await notificationRequest.sendInvite({ instanceId: L.tag, worldId: L.tag, worldName: args.ref.name }, userId);
        person.sent = (person.sent || 0) + 1;
        toast.success(`Invited ${person.name} (${person.sent}/${person.max || DEFAULT_MAX})`);
    } catch (err) {
        console.error('Auto invite failed', err);
    }
}
