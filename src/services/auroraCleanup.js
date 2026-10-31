/**
 * Aurora data cleanup. Removes invite data and low-value log noise from the local database.
 * Nothing here touches favorites, memos/notes, friend log, game log locations, joins and leaves,
 * or moderation data. Each category can be previewed (count) before anything is deleted.
 */
import { dbVars } from './database';

import configRepository from './config';
import sqliteService from './sqlite.js';

const INVITE_TYPES = ['invite', 'requestInvite', 'inviteResponse', 'requestInviteResponse'];
const typeList = INVITE_TYPES.map((t) => `'${t}'`).join(',');

const cutoff = (days) => {
    const d = new Date(Date.now() - Math.max(1, Number(days) || 90) * 86400000);
    return d.toJSON(); // created_at is stored as an ISO string
};

/** Each category is a list of [table, where] pairs. Prefix tables are resolved at call time. */
export function getCleanupCategories(keepDays = 90) {
    const p = dbVars.userPrefix;
    const old = `created_at < '${cutoff(keepDays)}'`;
    return {
        invites: [
            [`${p}_notifications`, `type IN (${typeList})`],
            [`${p}_notifications_v2`, `type IN (${typeList})`]
        ],
        expiredNotifications: [[`${p}_notifications`, 'expired = 1']],
        resourceLoads: [['gamelog_resource_load', '1=1']],
        portalSpawns: [['gamelog_portal_spawn', '1=1']],
        cache: [
            ['cache_avatar', '1=1'],
            ['cache_world', '1=1']
        ],
        oldFeed: [
            [`${p}_feed_gps`, old],
            [`${p}_feed_status`, old],
            [`${p}_feed_bio`, old],
            [`${p}_feed_avatar`, old]
        ]
    };
}

export const CLEANUP_KEYS = ['invites', 'expiredNotifications', 'resourceLoads', 'portalSpawns', 'cache', 'oldFeed'];

async function tableExists(name) {
    let found = false;
    await sqliteService.execute(
        (row) => {
            found = row[0] > 0;
        },
        `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = '${name.replaceAll("'", "''")}'`
    );
    return found;
}

export async function countCategory(key, keepDays) {
    if (!dbVars.userPrefix) {
        return 0; // not logged in yet, user tables do not exist
    }
    let total = 0;
    for (const [table, where] of getCleanupCategories(keepDays)[key] || []) {
        if (!(await tableExists(table))) {
            continue;
        }
        await sqliteService.execute((row) => {
            total += row[0];
        }, `SELECT COUNT(*) FROM ${table} WHERE ${where}`);
    }
    return total;
}

export async function cleanCategories(keys, keepDays) {
    if (!dbVars.userPrefix) {
        return 0;
    }
    const categories = getCleanupCategories(keepDays);
    let removed = 0;
    for (const key of keys) {
        for (const [table, where] of categories[key] || []) {
            if (!(await tableExists(table))) {
                continue;
            }
            let n = 0;
            await sqliteService.execute((row) => {
                n = row[0];
            }, `SELECT COUNT(*) FROM ${table} WHERE ${where}`);
            if (n > 0) {
                await sqliteService.executeNonQuery(`DELETE FROM ${table} WHERE ${where}`);
                removed += n;
            }
        }
    }
    if (removed > 0) {
        await sqliteService.executeNonQuery('VACUUM'); // give the freed space back to the disk
    }
    return removed;
}

export const DEFAULT_SELECTED = ['invites', 'expiredNotifications', 'resourceLoads'];

/** Runs after login when "clean automatically" is on. Never throws. */
export async function runAutoCleanup() {
    try {
        if (!(await configRepository.getBool('Aurora_cleanupAuto', false))) {
            return 0;
        }
        const raw = await configRepository.getString('Aurora_cleanupSelected', '');
        const selected = (raw ? JSON.parse(raw) : DEFAULT_SELECTED).filter((k) => CLEANUP_KEYS.includes(k));
        const keepDays = await configRepository.getInt('Aurora_cleanupKeepDays', 90);
        return await cleanCategories(selected, keepDays);
    } catch (err) {
        console.error('Aurora auto cleanup failed', err);
        return 0;
    }
}
