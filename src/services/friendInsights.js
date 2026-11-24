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
 * Age verification as VRChat reports it: "18+" (verified adult), "verified" (verified, age not shared as 18+),
 * "hidden", or nothing known. Friend lists often leave the field out until a profile has been opened.
 * @returns {'18plus'|'verified'|'hidden'|'unknown'}
 */
export function ageOf(ref) {
    const status = ref?.ageVerificationStatus;
    if (status === '18+') return '18plus';
    if (status === 'verified') return 'verified';
    if (status === 'hidden') return 'hidden';
    if (ref?.ageVerified) return 'verified';
    return 'unknown';
}

/** @returns {'pc'|'android'|'ios'|''} */
export function platformOf(ref) {
    const p = String(ref?.last_platform || ref?.platform || '').toLowerCase();
    if (p.includes('windows') || p === 'pc') return 'pc';
    if (p.includes('android')) return 'android';
    if (p.includes('ios')) return 'ios';
    return '';
}

/**
 * One flat row per friend.
 * @param {Array<{id:string, ref:object}>} ctxs
 * @param {{favorites?: Set<string>, now?: number}} opts
 */
export function buildRows(ctxs, { favorites = new Set(), locked = new Set(), now = Date.now() } = {}) {
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
            locked: locked.has(ctx.id),
            hasMemo: !!(ref.$memo || ref.note),
            bio: typeof ref.bio === 'string' ? ref.bio : '',
            age: ageOf(ref),
            trustName: ref.$trustLevel || '',
            presence: ref.status || '',
            platform: platformOf(ref)
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
 * Locked friends, favorites, anyone with a memo and brand new friends always score 0: those are decisions you made.
 * @param {object} row from buildRows
 * @param {number} now
 * @returns {{score:number, reasons:string[]}}
 */
export function unfriendScore(row, now = Date.now()) {
    if (row.locked || row.favorite || row.hasMemo) return { score: 0, reasons: [] };
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
 * The small organizer: sorts every friend into keep, maybe or cut with the same score as the
 * suggestions. No model, no network, so the answer is the same every time and every call is instant.
 * Locked friends are always keep and come first. Cut needs a high score, maybe is the grey zone.
 * @param {object[]} rows from buildRows
 * @param {{now?:number, cut?:number, maybe?:number}} opts
 * @returns {{keep:object[], maybe:object[], cut:object[]}} each entry is { row, score, reasons }
 */
export function organizeFriends(rows, { now = Date.now(), cut = 70, maybe = 40 } = {}) {
    const out = { keep: [], maybe: [], cut: [] };
    for (const row of rows) {
        const { score, reasons } = unfriendScore(row, now);
        const item = { row, score, reasons };
        if (row.locked) out.keep.push(item);
        else if (score >= cut) out.cut.push(item);
        else if (score >= maybe) out.maybe.push(item);
        else out.keep.push(item);
    }
    out.keep.sort((a, b) => Number(b.row.locked) - Number(a.row.locked) || (b.row.timeSpent || 0) - (a.row.timeSpent || 0));
    out.maybe.sort((a, b) => b.score - a.score);
    out.cut.sort((a, b) => b.score - a.score || (a.row.lastSeen || 0) - (b.row.lastSeen || 0));
    return out;
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
        if (f.age && f.age !== 'all' && r.age !== f.age) return false;
        if (f.trust && f.trust !== 'all' && (r.trustName || 'none') !== f.trust) return false;
        if (f.status && f.status !== 'all' && (r.presence || 'none') !== f.status) return false;
        if (f.platform && f.platform !== 'all' && (r.platform || 'none') !== f.platform) return false;
        if (f.mark && f.mark !== 'all') {
            if (f.mark === 'favorite' && !r.favorite) return false;
            if (f.mark === 'notfavorite' && r.favorite) return false;
            if (f.mark === 'memo' && !r.hasMemo) return false;
            if (f.mark === 'nomemo' && r.hasMemo) return false;
            if (f.mark === 'locked' && !r.locked) return false;
        }
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
 * Case and surrounding spaces are ignored. Names that match more than one friend are reported, not guessed. Locked friends are never matched.
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
    const skippedLocked = [];
    for (const raw of String(text || '').split(/[,\n;]+/)) {
        const name = raw.trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const hits = byName.get(key);
        if (!hits) missing.push(name);
        else if (hits.length > 1) ambiguous.push(name);
        else if (hits[0].locked) skippedLocked.push(name);
        else matched.push(hits[0]);
    }
    return { matched, missing, ambiguous, skippedLocked };
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

/**
 * Your recent friend changes, newest first, one per person (their latest change in the window).
 * @param {Array<{type:string,userId:string,displayName?:string,created_at?:string}>} history newest first
 * @param {{types?:string[], days?:number, now?:number}} opts days 0 means all time
 * @returns {Array<{userId:string,name:string,type:string,at:number}>}
 */
export function recentChanges(history, { types = ['Unfriend', 'Friend'], days = 30, now = Date.now() } = {}) {
    const since = days > 0 ? now - days * DAY : 0;
    const seen = new Set();
    const out = [];
    for (const h of history || []) {
        if (h.type !== 'Friend' && h.type !== 'Unfriend') continue;
        if (!h.userId) continue;
        const at = toMs(h.created_at);
        if (since && at < since) continue;
        if (seen.has(h.userId)) continue;
        seen.add(h.userId);
        if (types.includes(h.type)) out.push({ userId: h.userId, name: h.displayName || h.userId, type: h.type, at });
    }
    return out.sort((a, b) => b.at - a.at);
}

/**
 * The file you hand to a friend.
 * @param {Array<{userId:string,name:string,type:string,at:number}>} entries
 * @param {number} now
 */
export function changesFileText(entries, now = Date.now()) {
    return JSON.stringify(
        {
            app: 'aurora-friend-changes',
            version: 1,
            exportedAt: new Date(now).toISOString(),
            entries: entries.map((e) => ({
                userId: e.userId,
                name: e.name,
                type: e.type,
                at: e.at ? new Date(e.at).toISOString() : null
            }))
        },
        null,
        2
    );
}

/**
 * Reads a changes file. Accepts the JSON above, or any text with VRChat user ids (usr_...) in it,
 * which counts as a list of unfriended people.
 * @param {string} text
 * @returns {Array<{userId:string,name:string,type:string,at:number}>}
 */
export function parseChangesFile(text) {
    const src = String(text || '');
    try {
        const data = JSON.parse(src);
        if (data && data.app === 'aurora-friend-changes' && Array.isArray(data.entries)) {
            return data.entries
                .filter((e) => e && typeof e.userId === 'string' && /^usr_[0-9a-f-]+$/i.test(e.userId))
                .map((e) => ({
                    userId: e.userId,
                    name: typeof e.name === 'string' ? e.name : e.userId,
                    type: e.type === 'Friend' ? 'Friend' : 'Unfriend',
                    at: toMs(e.at)
                }));
        }
    } catch {
        // not JSON, fall through to the plain id list
    }
    const ids = [...new Set(src.match(/usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [])];
    return ids.map((userId) => ({ userId, name: userId, type: 'Unfriend', at: 0 }));
}

/**
 * Which of your friends are in a changes file.
 * @param {object[]} rows from buildRows
 * @param {Array<{userId:string,type:string}>} entries
 * @param {string[]} types which kind of change to act on
 * @returns {{matched:object[], notFriends:number}}
 */
export function matchChanges(rows, entries, types = ['Unfriend']) {
    const wanted = new Set(entries.filter((e) => types.includes(e.type)).map((e) => e.userId));
    const matched = rows.filter((r) => wanted.has(r.id));
    return { matched, notFriends: wanted.size - matched.length };
}

/**
 * How many friends have each value of a row field, biggest first. Empty values count as "none".
 * @param {object[]} rows
 * @param {string} key a row field such as "age" or "trustName"
 * @returns {Array<{key:string,count:number}>}
 */
export function countBy(rows, key) {
    const map = new Map();
    for (const r of rows) {
        const k = r[key] || 'none';
        map.set(k, (map.get(k) || 0) + 1);
    }
    return [...map.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count);
}
