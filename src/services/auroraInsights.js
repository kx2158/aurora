/**
 * Numbers for the Insights page. Everything is read from the local database that Aurora already keeps
 * (game log, friend feed, friend log), nothing is sent anywhere.
 */
import { dbVars } from './database';
import sqliteService from './sqlite.js';

const DAY = 86400000;
const HOUR = 3600000;

function rangeStart(rangeDays) {
    return rangeDays ? new Date(Date.now() - rangeDays * DAY).toISOString() : '1970-01-01T00:00:00.000Z';
}

function dayKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function rowsOf(sql, params, map) {
    const out = [];
    await sqliteService.execute((r) => out.push(map(r)), sql, params);
    return out;
}

/**
 * @param {object} opts
 * @param {number} opts.rangeDays 0 means all time
 * @param {Set<string>} opts.friendIds ids of your current friends
 * @param {number} opts.friendCount how many friends you have now
 */
export async function loadInsights({ rangeDays = 30, friendIds = new Set(), friendCount = 0 } = {}) {
    const since = rangeStart(rangeDays);
    const now = Date.now();

    // ---- time in VRChat ----
    const sessions = await rowsOf(
        `SELECT created_at, world_id, world_name, time FROM gamelog_location WHERE created_at >= @since`,
        { '@since': since },
        (r) => ({ at: new Date(r[0]).getTime(), world: r[1], name: r[2], time: Number(r[3]) || 0 })
    );

    // per day, last N days (30 when "all time" so the chart stays readable)
    const dayCount = rangeDays && rangeDays <= 90 ? rangeDays : 30;
    const perDay = new Map();
    for (let i = dayCount - 1; i >= 0; i--) {
        perDay.set(dayKey(new Date(now - i * DAY)), 0);
    }
    // weekday x hour heat map, minutes
    const heat = Array.from({ length: 7 }, () => new Array(24).fill(0));
    const worlds = new Map();
    let total = 0;
    let longest = 0;

    for (const s of sessions) {
        if (!s.at || !s.time) {
            continue;
        }
        total += s.time;
        longest = Math.max(longest, s.time);
        const key = dayKey(new Date(s.at));
        if (perDay.has(key)) {
            perDay.set(key, perDay.get(key) + s.time);
        }
        // spread the session over the hours it covered
        let t = s.at;
        let left = Math.min(s.time, 24 * HOUR);
        while (left > 0) {
            const d = new Date(t);
            const nextHour = new Date(d);
            nextHour.setMinutes(60, 0, 0);
            const chunk = Math.min(left, nextHour.getTime() - t);
            const weekday = (d.getDay() + 6) % 7; // Monday first
            heat[weekday][d.getHours()] += chunk / 60000;
            left -= chunk;
            t += chunk;
        }
        if (s.world && String(s.world).startsWith('wrld_')) {
            const w = worlds.get(s.world) || { id: s.world, name: s.name || s.world, time: 0, visits: 0 };
            w.time += s.time;
            w.visits += 1;
            if (s.name) {
                w.name = s.name;
            }
            worlds.set(s.world, w);
        }
    }

    const topWorlds = [...worlds.values()].sort((a, b) => b.time - a.time);

    // ---- people ----
    const together = await rowsOf(
        `SELECT user_id, MAX(display_name), SUM(time), COUNT(DISTINCT location)
         FROM gamelog_join_leave
         WHERE type = 'OnPlayerLeft' AND created_at >= @since AND user_id LIKE 'usr_%'
         GROUP BY user_id ORDER BY SUM(time) DESC LIMIT 200`,
        { '@since': since },
        (r) => ({ id: r[0], name: r[1], time: Number(r[2]) || 0, instances: Number(r[3]) || 0 })
    );
    const topFriends = together.filter((p) => friendIds.has(p.id)).slice(0, 10);

    const metRows = await rowsOf(
        `SELECT substr(created_at, 1, 10), COUNT(DISTINCT user_id)
         FROM gamelog_join_leave
         WHERE type = 'OnPlayerJoined' AND created_at >= @since AND user_id LIKE 'usr_%'
         GROUP BY substr(created_at, 1, 10)`,
        { '@since': new Date(now - dayCount * DAY).toISOString() },
        (r) => ({ day: r[0], n: Number(r[1]) || 0 })
    );
    const metMap = new Map(metRows.map((r) => [r.day, r.n]));
    const peopleMet = [...perDay.keys()].map((k) => metMap.get(k) || 0);

    // when your friends come online, by hour of the day
    const onlineByHour = new Array(24).fill(0);
    if (dbVars.userPrefix) {
        const rows = await rowsOf(
            `SELECT created_at FROM ${dbVars.userPrefix}_feed_online_offline WHERE type = 'Online' AND created_at >= @since`,
            { '@since': since },
            (r) => new Date(r[0])
        );
        for (const d of rows) {
            if (!Number.isNaN(d.getTime())) {
                onlineByHour[d.getHours()] += 1;
            }
        }
    }

    // friend count over time: walk back from today through the friend log
    const growth = [];
    if (dbVars.userPrefix) {
        const events = await rowsOf(
            `SELECT created_at, type FROM ${dbVars.userPrefix}_friend_log_history
             WHERE type IN ('Friend', 'Unfriend') ORDER BY created_at DESC`,
            {},
            (r) => ({ at: new Date(r[0]).getTime(), type: r[1] })
        );
        const points = rangeDays ? Math.min(365, Math.max(14, rangeDays)) : 365;
        let count = friendCount;
        let i = 0;
        for (let d = 0; d < points; d++) {
            const dayEnd = new Date(now - d * DAY);
            dayEnd.setHours(23, 59, 59, 999);
            // undo events that happened after the end of this day
            while (i < events.length && events[i].at > dayEnd.getTime()) {
                count += events[i].type === 'Friend' ? -1 : 1;
                i++;
            }
            growth.push({ day: dayKey(dayEnd), n: Math.max(0, count) });
        }
        growth.reverse();
    }

    return {
        total,
        longest,
        sessions: sessions.length,
        days: [...perDay.keys()],
        perDay: [...perDay.values()],
        heat,
        topWorlds: topWorlds.slice(0, 8),
        worldCount: topWorlds.length,
        topFriends,
        peopleMet,
        uniquePeople: together.length,
        onlineByHour,
        growth
    };
}
