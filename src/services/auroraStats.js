import sqliteService from './sqlite.js';

// Playtime and world history, computed from the existing game log so a fresh
// install of Neon picks up everything that was already recorded.
export async function loadStats() {
    const rows = [];
    await sqliteService.execute(
        (r) => rows.push({ at: r[0], world: r[1], name: r[2], time: r[3] || 0 }),
        `SELECT created_at, world_id, world_name, time FROM gamelog_location ORDER BY created_at DESC`
    );

    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const day = 86400000;
    let total = 0;
    let today = 0;
    let week = 0;
    let longest = 0;
    const worlds = new Map();
    const days = new Map();

    for (const r of rows) {
        const end = new Date(r.at).getTime();
        if (!end || !r.time) continue;
        total += r.time;
        longest = Math.max(longest, r.time);
        if (end >= startOfDay.getTime()) today += r.time;
        if (end >= now - 7 * day) week += r.time;
        const key = new Date(end).toDateString();
        days.set(key, (days.get(key) || 0) + r.time);
    }
    for (const r of rows) {
        if (!r.world || !String(r.world).startsWith('wrld_')) continue;
        const w = worlds.get(r.world) || { id: r.world, name: r.name || r.world, visits: 0, time: 0, last: r.at };
        w.visits += 1;
        w.time += r.time;
        if (r.at > w.last) w.last = r.at;
        if (r.name) w.name = r.name;
        worlds.set(r.world, w);
    }

    const list = [...worlds.values()];
    const recent = [...list].sort((a, b) => (a.last < b.last ? 1 : -1));
    const top = [...list].sort((a, b) => b.time - a.time);

    // last 7 days, oldest first, for the bar strip
    const bars = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now - i * day);
        bars.push({ label: d.toLocaleDateString([], { weekday: 'short' }), ms: days.get(d.toDateString()) || 0 });
    }

    // consecutive days with any playtime, counting back from today (or yesterday)
    let streak = 0;
    for (let i = days.has(new Date(now).toDateString()) ? 0 : 1; i < 4000; i++) {
        if (days.has(new Date(now - i * day).toDateString())) streak++;
        else break;
    }

    // people met in the last 24 hours (excluding yourself is not needed: joins of others only matter)
    const met = [];
    await sqliteService.execute(
        (r) => met.push({ name: r[0], id: r[1], n: r[2], last: r[3] }),
        `SELECT display_name, user_id, COUNT(DISTINCT location), MAX(created_at)
         FROM gamelog_join_leave
         WHERE type = 'OnPlayerJoined' AND created_at >= @since AND user_id LIKE 'usr_%'
         GROUP BY user_id ORDER BY MAX(created_at) DESC LIMIT 8`,
        { '@since': new Date(now - day).toISOString() }
    );

    // the same calendar day in earlier years
    const memories = [];
    const md = new Date(now);
    const pattern = `%-${String(md.getMonth() + 1).padStart(2, '0')}-${String(md.getDate()).padStart(2, '0')}T%`;
    await sqliteService.execute(
        (r) => memories.push({ at: r[0], id: r[1], name: r[2], time: r[3] || 0 }),
        `SELECT created_at, world_id, world_name, time FROM gamelog_location
         WHERE created_at LIKE @p AND created_at < @y AND world_id LIKE 'wrld_%'
         ORDER BY time DESC LIMIT 5`,
        { '@p': pattern, '@y': new Date(startOfDay.getTime()).toISOString() }
    );

    return {
        met,
        memories,
        total,
        today,
        week,
        longest,
        streak,
        sessions: rows.length,
        worldCount: list.length,
        recent: recent.slice(0, 8),
        top: top.slice(0, 5),
        bars
    };
}

export function fmtDuration(ms) {
    const m = Math.floor((ms || 0) / 60000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 100) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
    return `${h}h`;
}
