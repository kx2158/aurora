const MUSIC_WORDS = /\b(music|dj|live set|concert|rave|club|techno|house|trance|dnb|drum ?and ?bass|set|party|gig|band|festival)\b/i;

/** True for calendar events that are about music: VRChat's own category first, a few keywords as backup. */
export function isMusicEvent(e) {
    if (String(e?.category || '').toLowerCase() === 'music') return true;
    return MUSIC_WORDS.test(`${e?.title || ''} ${e?.description || ''}`);
}

/**
 * Upcoming and running music events, soonest first.
 * @param {Array} list calendar events with startsAt / endsAt
 * @param {number} now
 */
export function upcomingMusic(list, now = Date.now(), limit = 14) {
    const seen = new Set();
    return (list || [])
        .filter((e) => e && e.id && isMusicEvent(e) && Date.parse(e.endsAt || e.startsAt) >= now)
        .filter((e) => (seen.has(e.id) ? false : seen.add(e.id)))
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
        .slice(0, limit)
        .map((e) => {
            const start = Date.parse(e.startsAt);
            return {
                id: e.id,
                title: e.title,
                start,
                live: start <= now,
                when: new Date(start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
                day: new Date(start).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit' })
            };
        });
}
