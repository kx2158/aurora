/**
 * Friend alerts: mark a friend, pick what you want to hear about, and Aurora pops a notification for
 * exactly those things, even when the normal notification filter for that event is off.
 * Marks live in config on this machine: { [userId]: ['online', 'boop', ...] }.
 */
import { ref } from 'vue';

import configRepository from './config';

/** What can trigger an alert, in the order the UI shows them. */
export const ALERT_KINDS = ['online', 'offline', 'moves', 'joinsMe', 'boop', 'status'];

/** Which notification / feed / game log type each alert kind comes from. */
const KIND_BY_TYPE = {
    Online: 'online',
    Offline: 'offline',
    GPS: 'moves',
    Status: 'status',
    OnPlayerJoined: 'joinsMe',
    boop: 'boop'
};

const KEY = 'Aurora_friendAlerts';

/** { [userId]: string[] } */
export const alertMarks = ref({});
let loaded = false;

/**
 * @param {unknown} raw parsed config value
 * @returns {Record<string, string[]>} only known kinds, no empty entries
 */
export function cleanMarks(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [id, kinds] of Object.entries(raw)) {
        if (!id.startsWith('usr_') || !Array.isArray(kinds)) continue;
        const keep = ALERT_KINDS.filter((k) => kinds.includes(k));
        if (keep.length) out[id] = keep;
    }
    return out;
}

/**
 * Which alert kind a notification belongs to, or '' when none does.
 * @param {{type?: string}} noty
 * @returns {string}
 */
export function alertKindOf(noty) {
    return KIND_BY_TYPE[noty?.type] || '';
}

/**
 * Whether this event is one the user asked to be alerted about.
 * @param {Record<string, string[]>} marks
 * @param {string} userId
 * @param {{type?: string}} noty
 * @returns {boolean}
 */
export function shouldAlert(marks, userId, noty) {
    if (!userId) return false;
    const kind = alertKindOf(noty);
    if (!kind) return false;
    return !!marks[userId]?.includes(kind);
}

/**
 * Marks after switching one kind on or off for a friend. Returns a new object.
 * @param {Record<string, string[]>} marks
 * @param {string} userId
 * @param {string} kind
 * @param {boolean} on
 */
export function withKind(marks, userId, kind, on) {
    if (!ALERT_KINDS.includes(kind)) return marks;
    const next = { ...marks };
    const set = new Set(next[userId] || []);
    if (on) set.add(kind);
    else set.delete(kind);
    const kinds = ALERT_KINDS.filter((k) => set.has(k));
    if (kinds.length) next[userId] = kinds;
    else delete next[userId];
    return next;
}

export async function loadFriendAlerts() {
    if (loaded) return;
    loaded = true;
    try {
        alertMarks.value = cleanMarks(JSON.parse(await configRepository.getString(KEY, '{}')));
    } catch {
        alertMarks.value = {};
    }
}

function persist() {
    configRepository.setString(KEY, JSON.stringify(alertMarks.value));
}

/** @returns {string[]} the kinds marked for a friend */
export function alertsFor(userId) {
    return alertMarks.value[userId] || [];
}

export function setAlert(userId, kind, on) {
    alertMarks.value = withKind(alertMarks.value, userId, kind, on);
    persist();
}

/** Turn every alert on, or every alert off, for a friend. */
export function setAllAlerts(userId, on) {
    let next = alertMarks.value;
    for (const k of ALERT_KINDS) next = withKind(next, userId, k, on);
    alertMarks.value = next;
    persist();
}

export function isAlertEvent(userId, noty) {
    return shouldAlert(alertMarks.value, userId, noty);
}
