import sqliteService from './sqlite.js';

// Where you were on which day, read straight from the existing game log, so every
// day VRCX or Aura ever recorded shows up (nothing has to be collected first).
// gamelog_location.created_at is when you joined an instance, `time` is how long you stayed (ms).

export function dayKey(date) {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * First and last day with any recorded location.
 * @returns {Promise<{first: Date|null, last: Date|null}>}
 */
export async function loadBounds() {
    let first = null;
    let last = null;
    await sqliteService.execute(
        (r) => {
            first = r[0] ? new Date(r[0]) : null;
            last = r[1] ? new Date(r[1]) : null;
        },
        `SELECT MIN(created_at), MAX(created_at) FROM gamelog_location WHERE created_at IS NOT NULL`
    );
    if (first && isNaN(first.getTime())) first = null;
    if (last && isNaN(last.getTime())) last = null;
    return { first, last };
}

/**
 * Everything recorded in one calendar month, grouped by local day.
 * @param {number} year
 * @param {number} month 0-11
 * @param {string} selfName display name to leave out of the people list
 * @returns {Promise<Map<string, {key: string, visits: object[], ms: number, worlds: Set<string>, people: Map<string, string>}>>}
 */
export async function loadMonth(year, month, selfName = '') {
    const start = new Date(year, month, 1).toISOString();
    const end = new Date(year, month + 1, 1).toISOString();
    const days = new Map();
    const getDay = (key) => {
        let d = days.get(key);
        if (!d) {
            d = { key, visits: [], ms: 0, worlds: new Set(), people: new Map() };
            days.set(key, d);
        }
        return d;
    };

    await sqliteService.execute(
        (r) => {
            const startAt = new Date(r[0]);
            if (isNaN(startAt.getTime())) return;
            const time = r[4] || 0;
            const d = getDay(dayKey(startAt));
            d.visits.push({
                at: r[0],
                start: startAt,
                end: new Date(startAt.getTime() + time),
                location: r[1] || '',
                worldId: r[2] || '',
                name: r[3] || r[2] || r[1] || '?',
                time,
                group: r[5] || ''
            });
            d.ms += time;
            if (r[2]) d.worlds.add(r[2]);
        },
        `SELECT created_at, location, world_id, world_name, time, group_name
         FROM gamelog_location
         WHERE created_at >= @start AND created_at < @end
         ORDER BY created_at ASC`,
        { '@start': start, '@end': end }
    );

    await sqliteService.execute(
        (r) => {
            const when = new Date(r[0]);
            if (isNaN(when.getTime()) || !r[1] || r[1] === selfName) return;
            const d = days.get(dayKey(when));
            if (!d) return;
            if (!d.people.has(r[1]) || (!d.people.get(r[1]) && r[2])) d.people.set(r[1], r[2] || '');
        },
        `SELECT created_at, display_name, user_id
         FROM gamelog_join_leave
         WHERE type = 'OnPlayerJoined' AND created_at >= @start AND created_at < @end`,
        { '@start': start, '@end': end }
    );

    return days;
}

/**
 * Who was in the instance during one visit.
 * @param {{location: string, start: Date, end: Date}} visit
 * @param {string} selfName
 * @returns {Promise<Array<{name: string, id: string, at: string}>>}
 */
export async function loadVisitPeople(visit, selfName = '') {
    const seen = new Map();
    await sqliteService.execute(
        (r) => {
            if (!r[1] || r[1] === selfName || seen.has(r[1])) return;
            seen.set(r[1], { name: r[1], id: r[2] || '', at: r[0] });
        },
        `SELECT created_at, display_name, user_id
         FROM gamelog_join_leave
         WHERE type = 'OnPlayerJoined' AND location = @location
           AND created_at >= @start AND created_at <= @end
         ORDER BY created_at ASC`,
        {
            '@location': visit.location,
            '@start': visit.start.toISOString(),
            // joins land a moment after you do, and a visit that never got its duration written has time 0
            '@end': new Date(visit.end.getTime() + 2000).toISOString()
        }
    );
    return [...seen.values()];
}

/**
 * The same calendar day in earlier years, so "a year ago today" is one click.
 * @param {Date} date
 * @returns {Promise<Array<{year: number, name: string, time: number}>>}
 */
export async function loadSameDayEarlierYears(date) {
    const pattern = `%-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T%`;
    const out = [];
    await sqliteService.execute(
        (r) => {
            const when = new Date(r[0]);
            if (isNaN(when.getTime()) || when.getFullYear() >= date.getFullYear()) return;
            out.push({ year: when.getFullYear(), name: r[1] || '?', time: r[2] || 0, at: r[0] });
        },
        `SELECT created_at, world_name, time FROM gamelog_location
         WHERE created_at LIKE @p AND world_id LIKE 'wrld_%'
         ORDER BY created_at DESC LIMIT 60`,
        { '@p': pattern }
    );
    return out;
}
