// Aurora preview harness: fake native bridge + in-memory SQLite (sql.js) + a fake logged-in user.
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

window.WINDOWS = false;
window.LINUX = false;

const SQL = await initSqlJs({ locateFile: () => wasmUrl });
const db = new SQL.Database();

function bindArgs(args) {
    if (!args) return undefined;
    const out = {};
    const entries = args instanceof Map ? [...args.entries()] : Object.entries(args);
    for (const [k, v] of entries) {
        const key = /^[@:$]/.test(k) ? k : '@' + k;
        out[key] = typeof v === 'boolean' ? Number(v) : v === undefined ? null : v;
    }
    return out;
}
function query(sql, args) {
    const rows = [];
    try {
        const stmt = db.prepare(sql);
        const b = bindArgs(args);
        if (b) stmt.bind(b);
        while (stmt.step()) rows.push(stmt.get());
        stmt.free();
    } catch (e) {
        console.warn('[preview sql]', e.message, sql.slice(0, 120));
    }
    return rows;
}

const devices = {
    render: [
        { id: 'out-cable', name: 'CABLE Input (VB-Audio Virtual Cable)' },
        { id: 'out-speakers', name: 'Speakers (Realtek Audio)' }
    ],
    capture: [{ id: 'mic-1', name: 'Microphone (Shure MV7)' }]
};
let mixRunning = false;
const fakeUser = { id: 'usr_preview', displayName: 'Xen', status: 'active', statusDescription: 'building things', friends: [], onlineFriends: [], activeFriends: [], offlineFriends: [] };

function native(cls, method, args) {
    if (cls === 'SQLite') {
        if (method === 'Execute') return query(args[0], args[1]);
        if (method === 'ExecuteJson') return JSON.stringify(query(args[0], args[1]));
        if (method === 'ExecuteNonQuery') {
            query(args[0], args[1]);
            return 0;
        }
    }
    if (String(cls).startsWith('AppApi')) {
        switch (method) {
            case 'GetNeonAudioDevices':
                return JSON.stringify(devices);
            case 'GetNeonAudioApps':
                return JSON.stringify(['Spotify', 'Firefox', 'Discord']);
            case 'NeonMusicMicStart':
                mixRunning = true;
                return true;
            case 'NeonMusicMicStatus':
                return JSON.stringify({
                    running: mixRunning,
                    error: '',
                    micPeak: 0.42,
                    musicPeak: 0.61,
                    outPeak: 0.7,
                    info: 'mic 48000 Hz | out CABLE Input'
                });
            case 'GetVersion':
                return 'Aurora 2026.11.08';
            case 'CurrentCulture':
                return 'en-US';
            case 'CurrentLanguage':
                return 'en';
            default:
                return null;
        }
    }
    if (cls === 'VRCXStorage') {
        if (method === 'GetAll') return '{}';
        return '';
    }
    if (cls === 'WebApi') {
        // every VRChat request answers "nothing here", the preview only shows local data
        const url = String(args[0]?.url || '');
        if (/\/auth\/user(\?|$)/.test(url)) {
            return { Item1: 200, Item2: JSON.stringify(fakeUser) };
        }
        if (/\/config(\?|$)/.test(url)) {
            return { Item1: 200, Item2: '{}' };
        }
        return { Item1: 200, Item2: '[]' };
    }
    return null;
}
window.interopApi = {
    callDotNetMethod: async (cls, method, args) => native(cls, method, args || [])
};

// ---- fake history: 120 days of sessions, people, friends ----
const now = Date.now();
const DAY = 86400000;
const iso = (t) => new Date(t).toISOString();
const worlds = [
    ['wrld_a', 'The Great Pug'],
    ['wrld_b', 'Midnight Rooftop'],
    ['wrld_c', 'Movie & Chill'],
    ['wrld_d', 'Japan Shrine'],
    ['wrld_e', 'Void Club'],
    ['wrld_f', 'Cozy Cabin'],
    ['wrld_g', 'Just B Club 3']
];
const people = [
    'Rin', 'Kaito', 'Mika', 'Sol', 'Juno', 'Ezra', 'Nova', 'Lumi', 'Pixel', 'Atlas', 'Wren', 'Echo', 'Sage', 'Indigo'
].map((name, i) => ({ id: `usr_preview${String(i).padStart(4, '0')}`, name }));

let seed = 7;
const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

window.__seedPreview = async function seedPreview(prefix) {
    for (let d = 120; d >= 0; d--) {
        if (rnd() < 0.25) continue;
        const sessions = 1 + Math.floor(rnd() * 3);
        for (let s = 0; s < sessions; s++) {
            const w = worlds[Math.floor(Math.pow(rnd(), 1.6) * worlds.length)];
            const day = new Date(now - d * DAY);
            day.setHours(18 + Math.floor(rnd() * 6), Math.floor(rnd() * 60), 0, 0);
            const start = day.getTime() + s * 2 * 3600000;
            if (start > now) continue;
            const time = Math.floor((20 + rnd() * 140) * 60000);
            const loc = `${w[0]}:${1000 + d}~private`;
            query(
                'INSERT OR IGNORE INTO gamelog_location (created_at, location, world_id, world_name, time, group_name) VALUES (@a,@b,@c,@d,@e,@f)',
                { a: iso(start), b: loc, c: w[0], d: w[1], e: time, f: '' }
            );
            for (const p of people) {
                if (rnd() < 0.2 + (people.indexOf(p) < 5 ? 0.4 : 0)) {
                    const t = Math.floor(time * (0.3 + rnd() * 0.7));
                    query(
                        'INSERT OR IGNORE INTO gamelog_join_leave (created_at, type, display_name, location, user_id, time) VALUES (@a,@b,@c,@d,@e,@f)',
                        { a: iso(start + 60000), b: 'OnPlayerJoined', c: p.name, d: loc, e: p.id, f: 0 }
                    );
                    query(
                        'INSERT OR IGNORE INTO gamelog_join_leave (created_at, type, display_name, location, user_id, time) VALUES (@a,@b,@c,@d,@e,@f)',
                        { a: iso(start + 60000 + t), b: 'OnPlayerLeft', c: p.name, d: loc, e: p.id, f: t }
                    );
                }
            }
        }
        for (let k = 0; k < 6; k++) {
            const p = people[Math.floor(rnd() * people.length)];
            const at = new Date(now - d * DAY);
            at.setHours(Math.floor(Math.pow(rnd(), 0.5) * 24), Math.floor(rnd() * 60));
            if (at.getTime() > now) continue;
            query(
                `INSERT INTO ${prefix}_feed_online_offline (created_at, user_id, display_name, type, location, world_name, time, group_name) VALUES (@a,@b,@c,'Online','','',0,'')`,
                { a: iso(at.getTime()), b: p.id, c: p.name }
            );
        }
    }
    // a mutual friend graph with three loose circles of friends
    people.forEach((p, i) => {
        query(`INSERT OR IGNORE INTO ${prefix}_mutual_graph_friends (friend_id) VALUES (@a)`, { a: p.id });
        query(`INSERT OR IGNORE INTO ${prefix}_mutual_graph_meta (friend_id, last_fetched_at, opted_out) VALUES (@a,@b,0)`, {
            a: p.id,
            b: iso(now - DAY)
        });
        people.forEach((q, j) => {
            if (j <= i) return;
            const same = i % 3 === j % 3;
            if (rnd() < (same ? 0.75 : 0.08)) {
                query(`INSERT OR IGNORE INTO ${prefix}_mutual_graph_links (friend_id, mutual_id) VALUES (@a,@b)`, { a: p.id, b: q.id });
                query(`INSERT OR IGNORE INTO ${prefix}_mutual_graph_links (friend_id, mutual_id) VALUES (@a,@b)`, { a: q.id, b: p.id });
            }
        });
    });
    people.forEach((p, i) => {
        query(
            `INSERT INTO ${prefix}_friend_log_history (created_at, type, user_id, display_name, previous_display_name, trust_level, previous_trust_level, friend_number) VALUES (@a,'Friend',@b,@c,'','','',@d)`,
            { a: iso(now - (110 - i * 7) * DAY), b: p.id, c: p.name, d: i + 1 }
        );
    });
    return people;
};

await import('./app.js');

// ---- log in a fake user once the app has started ----
const { database } = await import('./services/database/index.js');
const { watchState } = await import('./services/watchState.js');
const { router } = await import('./plugins/router.js');
const { reactive } = await import('vue');
const { AppDebug } = await import('./services/appConfig.js');
AppDebug.dontLogMeOut = true;

await new Promise((r) => setTimeout(r, 1500));
await database.initTables();
await database.initUserTables('usr_preview');
const { dbVars } = await import('./services/database/index.js');
const friendsList = await window.__seedPreview(dbVars.userPrefix);

const stores = window.$pinia;
try {
    stores.user.currentUser = {
        ...stores.user.currentUser,
        id: 'usr_preview',
        displayName: 'Xen',
        status: 'active',
        statusDescription: 'building things',
        friends: friendsList.map((p) => p.id)
    };
} catch (e) {
    console.warn('[preview] user', e);
}
function populateFriends() {
friendsList.forEach((p, i) => {
    const ref = {
        id: p.id,
        displayName: p.name,
        status: i % 3 === 0 ? 'join me' : 'active',
        statusDescription: ['in a club', 'chilling', 'afk for a bit', ''][i % 4],
        location: 'private',
        tags: i === 9 || i === 11 ? ['language_ces'] : i === 3 ? ['language_slk', 'language_eng'] : ['language_eng'],
        $userColour: '#cccccc'
    };
    try {
        stores.user.cachedUsers.set(p.id, ref);
    } catch {
        // ignore
    }
    stores.friend.friends.set(
        p.id,
        reactive({ id: p.id, state: i < 7 ? 'online' : 'offline', isVIP: false, ref, name: p.name, pendingOffline: false, $nickName: '' })
    );
});
}
populateFriends();
// the preview has no real VRChat account, so never log the fake user out
try {
    stores.auth.handleLogoutEvent = async () => console.warn('[preview] logout blocked');
    stores.auth.logout = async () => console.warn('[preview] logout blocked');
} catch (e) {
    console.warn('[preview] auth', e);
}
watchState.isFriendsLoaded = true;
watchState.isLoggedIn = true;
await router.push({ name: 'home' });
await new Promise((r) => setTimeout(r, 3000));
// the login flow may have reset the list, fill it again
populateFriends();
// two example status rules so the Automations page has something to show
try {
    const sr = await import('./services/auroraStatusRules.js');
    await sr.initStatusRules();
    sr.statusRules.value.rules = [
        sr.newRule({ people: friendsList.slice(0, 2).map((p) => ({ id: p.id, name: p.name })), onlineDesc: 'come hang' }),
        sr.newRule({ people: [{ id: friendsList[4].id, name: friendsList[4].name }], onlineStatus: 'ask me', joinedStatus: 'busy', waitMin: 20 })
    ];
    sr.statusRules.value.avoid.people = [{ id: friendsList[9].id, name: friendsList[9].name }];
    sr.statusRules.value.avoid.langs = ['ces', 'slk'];
    for (const f of friendsList.slice(0, 7)) await sr.statusRuleFriendChange(f.id, true);
    await sr.statusRuleFriendChange(friendsList[0].id, true);
} catch (e) {
    console.warn('[preview] rules', e);
}
window.__previewReady = true;
