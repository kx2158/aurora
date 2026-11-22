/**
 * Friends manager: turns Aurora's raw friend data into rows, groups and an unfriend score.
 * Pure functions only, so it can be tested without the app.
 */

export const DAY = 86400000;

/** Hangout buckets, by how long ago you were last in the same place (or the friend was last seen). */
export const HANGOUT_BUCKETS = [
    { key: 'week', max: 7 * DAY },
    { key: 'month', max: 30 * DAY },
    { key: 'quarter', max: 90 * DAY },
    { key: 'half', max: 180 * DAY },
    { key: 'year', max: 365 * DAY },
    { key: 'old', max: Infinity }
];

export const MUTUAL_BUCKETS = [
    { key: 'none', test: (n) => n === 0 },
    { key: 'few', test: (n) => n >= 1 && n <= 4 },
    { key: 'some', test: (n) => n >= 5 && n <= 14 },
    { key: 'many', test: (n) => n >= 15 }
];

/**
 * @param {string|number|undefined} v ISO string or ms
 * @returns {number} ms since epoch, 0 when unknown
 */
export function toMs(v) {
    if (!v) return 0;
    if (typeof v === 'number') return v;
    const n = Date.parse(v);
    return Number.isNaN(n) ? 0 : n;
}

/**
 * @param {object} ref a friend's user object
 * @returns {string[]} language keys like "eng"
 */
export function languagesOf(ref) {
    if (Array.isArray(ref?.$languages) && ref.$languages.length) {
        return ref.$languages.map((l) => l.key).filter(Boolean);
    }
    const out = [];
    for (const tag of ref?.tags || []) {
        if (typeof tag === 'string' && tag.startsWith('language_')) out.push(tag.slice(9));
    }
    return out;
}

/**
 * One flat row per friend.
 * @param {Array<{id:string, ref:object}>} ctxs
 * @param {{favorites?: Set<string>, now?: number}} opts
 */
export function buildRows(ctxs, { favorites = new Set(), now = Date.now() } = {}) {
    const rows = [];
    for (const ctx of ctxs) {
        const ref = ctx.ref;
        if (!ref) continue;
        const lastSeen = toMs(ref.$lastSeen) || toMs(ref.last_login) || toMs(ref.last_activity);
        const optedOut = !!ref.$mutualOptedOut;
        const mutual = optedOut ? null : Number.isFinite(ref.$mutualCount) ? ref.$mutualCount : null;
        const since = toMs(ref.$friendSince) || toMs(ref.date_joined);
        rows.push({
            id: ctx.id,
            name: ref.displayName || ctx.id,
            photo: ref.currentAvatarThumbnailImageUrl || ref.profilePicOverrideThumbnail || ref.userIcon || '',
            status: ref.status || '',
            lastSeen,
            daysAway: lastSeen ? Math.floor((now - lastSeen) / DAY) : null,
            timeSpent: ref.$timeSpent || 0,
            joinCount: ref.$joinCount || 0,
            mutual,
            mutualOptedOut: optedOut,
            languages: languagesOf(ref),
            trust: ref.$trustLevel || '',
            trustSort: ref.$trustSortNum || 0,
            friendNumber: ref.$friendNumber || 0,
            since,
            favorite: favorites.has(ctx.id) || !!ctx.isVIP,
            hasMemo: !!(ref.$memo || ref.note),
            bio: typeof ref.bio === 'string' ? ref.bio : ''
        });
    }
    return rows;
}

/**
 * @param {{lastSeen:number}} row
 * @param {number} now
 * @returns {string} bucket key
 */
export function hangoutBucket(row, now = Date.now()) {
    if (!row.lastSeen) return 'old';
    const age = now - row.lastSeen;
    for (const b of HANGOUT_BUCKETS) if (age <= b.max) return b.key;
    return 'old';
}

export function mutualBucket(row) {
    if (row.mutual === null) return 'hidden';
    return MUTUAL_BUCKETS.find((b) => b.test(row.mutual)).key;
}

/**
 * How likely it is that you no longer need this friend, 0 to 100, with the reasons that raised it.
 * Favorites, anyone with a memo and brand new friends always score 0: those are decisions you made.
 * @param {object} row from buildRows
 * @param {number} now
 * @returns {{score:number, reasons:string[]}}
 */
export function unfriendScore(row, now = Date.now()) {
    if (row.favorite || row.hasMemo) return { score: 0, reasons: [] };
    if (row.since && now - row.since < 30 * DAY) return { score: 0, reasons: [] };

    const reasons = [];
    let score = 0;

    if (!row.lastSeen) {
        score += 30;
        reasons.push('never_seen');
    } else {
        const days = (now - row.lastSeen) / DAY;
        if (days > 365) {
            score += 45;
            reasons.push('inactive_year');
        } else if (days > 180) {
            score += 32;
            reasons.push('inactive_half');
        } else if (days > 90) {
            score += 18;
            reasons.push('inactive_quarter');
        }
    }

    if (row.timeSpent === 0 && row.joinCount === 0) {
        score += 30;
        reasons.push('never_together');
    } else if (row.timeSpent < 30 * 60000) {
        score += 20;
        reasons.push('barely_together');
    } else if (row.timeSpent < 2 * 3600000) {
        score += 8;
    }

    if (row.mutual === 0) {
        score += 15;
        reasons.push('no_mutuals');
    } else if (row.mutual !== null && row.mutual <= 2) {
        score += 6;
    }

    return { score: Math.min(100, score), reasons };
}

/**
 * Friends worth a look, strongest first.
 * @param {object[]} rows
 * @param {{min?:number, now?:number}} opts
 */
export function suggestUnfriend(rows, { min = 50, now = Date.now() } = {}) {
    return rows
        .map((row) => ({ row, ...unfriendScore(row, now) }))
        .filter((x) => x.score >= min)
        .sort((a, b) => b.score - a.score || (a.row.lastSeen || 0) - (b.row.lastSeen || 0));
}

/**
 * @param {object[]} rows
 * @returns {Array<{key:string, count:number}>} languages by number of friends
 */
export function languageCounts(rows) {
    const map = new Map();
    for (const r of rows) {
        const langs = r.languages.length ? r.languages : ['none'];
        for (const k of langs) map.set(k, (map.get(k) || 0) + 1);
    }
    return [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

const SORTS = {
    seen: (a, b) => (b.lastSeen || 0) - (a.lastSeen || 0),
    seen_old: (a, b) => (a.lastSeen || Infinity) - (b.lastSeen || Infinity),
    time: (a, b) => b.timeSpent - a.timeSpent,
    mutual: (a, b) => (b.mutual ?? -1) - (a.mutual ?? -1),
    name: (a, b) => a.name.localeCompare(b.name),
    oldest: (a, b) => (a.since || Infinity) - (b.since || Infinity)
};

/**
 * @param {object[]} rows
 * @param {{search?:string, hangout?:string, language?:string, mutual?:string, sort?:string, now?:number}} f
 */
export function filterRows(rows, f = {}) {
    const now = f.now ?? Date.now();
    const q = (f.search || '').trim().toLowerCase();
    const out = rows.filter((r) => {
        if (q && !r.name.toLowerCase().includes(q)) return false;
        if (f.hangout && f.hangout !== 'all' && hangoutBucket(r, now) !== f.hangout) return false;
        if (f.language && f.language !== 'all') {
            if (f.language === 'none' ? r.languages.length : !r.languages.includes(f.language)) return false;
        }
        if (f.mutual && f.mutual !== 'all' && mutualBucket(r) !== f.mutual) return false;
        return true;
    });
    return out.sort(SORTS[f.sort] || SORTS.seen);
}

/** Counts per hangout bucket, for the stat tiles. */
export function hangoutCounts(rows, now = Date.now()) {
    const counts = Object.fromEntries(HANGOUT_BUCKETS.map((b) => [b.key, 0]));
    for (const r of rows) counts[hangoutBucket(r, now)]++;
    return counts;
}

/**
 * Match a typed list ("name1, name2, name3" or one per line) against friends by display name.
 * Case and surrounding spaces are ignored. Names that match more than one friend are reported, not guessed.
 * @param {object[]} rows
 * @param {string} text
 * @returns {{matched:object[], missing:string[], ambiguous:string[]}}
 */
export function matchNames(rows, text) {
    const byName = new Map();
    for (const r of rows) {
        const k = r.name.trim().toLowerCase();
        if (!byName.has(k)) byName.set(k, []);
        byName.get(k).push(r);
    }
    const seen = new Set();
    const matched = [];
    const missing = [];
    const ambiguous = [];
    for (const raw of String(text || '').split(/[,\n;]+/)) {
        const name = raw.trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const hits = byName.get(key);
        if (!hits) missing.push(name);
        else if (hits.length > 1) ambiguous.push(name);
        else matched.push(hits[0]);
    }
    return { matched, missing, ambiguous };
}

/**
 * A plain text file of names and bios, one block per friend.
 * @param {object[]} rows
 * @returns {string}
 */
export function exportText(rows) {
    const blocks = rows.map((r) => {
        const bio = r.bio.replace(/\r\n?/g, '\n').trim();
        return bio ? `${r.name}\n${bio}` : `${r.name}\n(no bio)`;
    });
    return blocks.join('\n\n----------\n\n') + '\n';
}
