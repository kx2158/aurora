import sqliteService from './sqlite.js';

// Everyone the game log has seen join an instance you were in, searchable by name.
// gamelog_join_leave rows are written for every player you share an instance with.

/**
 * @param {string} query part of a display name
 * @param {string} selfName display name to leave out
 * @returns {Promise<Array<{name: string, id: string, count: number, first: string, last: string}>>}
 */
export async function searchMetPeople(query, selfName = '') {
    const q = (query || '').trim();
    if (!q) return [];
    // % and _ are LIKE wildcards, so a name with one in it has to be escaped
    const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
    const out = [];
    await sqliteService.execute(
        (r) => {
            if (!r[0] || r[0] === selfName) return;
            out.push({ name: r[0], id: r[1] || '', count: r[2] || 0, first: r[3], last: r[4] });
        },
        `SELECT display_name, MAX(user_id), COUNT(*), MIN(created_at), MAX(created_at)
         FROM gamelog_join_leave
         WHERE type = 'OnPlayerJoined' AND display_name LIKE @q ESCAPE '\\'
         GROUP BY display_name
         ORDER BY MAX(created_at) DESC
         LIMIT 100`,
        { '@q': `%${escaped}%` }
    );
    return out;
}

/**
 * The most recent places you were with one person.
 * @param {string} name exact display name
 * @returns {Promise<Array<{at: string, location: string, world: string}>>}
 */
export async function loadWhereMet(name) {
    const out = [];
    await sqliteService.execute(
        (r) => {
            out.push({ at: r[0], location: r[1] || '', world: r[2] || '' });
        },
        `SELECT j.created_at, j.location,
                (SELECT l.world_name FROM gamelog_location l WHERE l.location = j.location LIMIT 1)
         FROM gamelog_join_leave j
         WHERE j.type = 'OnPlayerJoined' AND j.display_name = @name
         ORDER BY j.created_at DESC
         LIMIT 8`,
        { '@name': name }
    );
    return out;
}
