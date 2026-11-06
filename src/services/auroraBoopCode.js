/**
 * Secret boops between two Neons.
 * A VRChat boop only carries a default emoji, so the emoji IS the code: a shared passphrase scrambles
 * which emoji means which line. Anyone else just sees an ordinary boop.
 * Both sides need the same passphrase, and the receiver has to list the sender as trusted.
 */
import { ref } from 'vue';

import { miscRequest } from '../api';
import { photonEmojis } from '../shared/constants/photon.js';
import configRepository from './config';
import { pushNews } from './auroraNews';
import { hashPin, verifyPin } from './auroraSecurity';

const KEY = 'Neon_boopCode';
const UNLOCK_KEY = 'Neon_boopsUnlocked';
const PASS_KEY = 'Neon_boopsPass';
/** Salted hash of the default password. The boop tools stay completely hidden until it is typed in. */
const DEFAULT_PASS_HASH = '{"v":1,"i":210000,"s":"5a77e19209afe93a6814be01d8441ed8","h":"77d3419e80c0559d8230971568a9a99ef78fa90767018f151ffe2d1644532d3d"}';

/** true once the boop tools were unlocked with the password */
export const boopsUnlocked = ref(false);

export async function initBoopsLock() {
    boopsUnlocked.value = (await configRepository.getString(UNLOCK_KEY, 'false')) === 'true';
}

/** Returns true (and shows the boop tools) when the text is the password. */
export async function tryUnlockBoops(text) {
    const pass = String(text || '').trim();
    if (!pass) return false;
    const stored = await configRepository.getString(PASS_KEY, '');
    if (!(await verifyPin(pass, stored || DEFAULT_PASS_HASH))) return false;
    boopsUnlocked.value = true;
    configRepository.setString(UNLOCK_KEY, 'true');
    return true;
}

export function lockBoops() {
    boopsUnlocked.value = false;
    configRepository.setString(UNLOCK_KEY, 'false');
}

export async function changeBoopsPassword(next) {
    const pass = String(next || '').trim();
    if (pass.length < 6) return false;
    configRepository.setString(PASS_KEY, await hashPin(pass));
    return true;
}

/** Shared default soundboard. Same order on both sides, so keep it as is unless you both change it. */
export const BOOP_LINES = [
    'Sit up straight, gorgeous.',
    'Posture check. You look even better sitting tall.',
    'Someone is thinking about you.',
    'Hey cutie, drink some water.',
    'Shoulders back, pretty.',
    'Hi you. Yes, you.',
    'Sit up straight and smile for me.',
    'Aurora says you are adorable.',
    'Come sit a little closer.',
    'Sending you a tiny kiss.',
    'Stretch break. Then back to me.',
    'You are doing great, sweetheart.'
];

export const boopCode = ref({ enabled: false, passphrase: '', trusted: [], target: 'RinXIIX', lines: [...BOOP_LINES] });
let loaded = false;

export async function initBoopCode() {
    if (loaded) return;
    loaded = true;
    try {
        const saved = JSON.parse(await configRepository.getString(KEY, '{}'));
        boopCode.value = { ...boopCode.value, ...saved };
        if (!Array.isArray(boopCode.value.lines) || !boopCode.value.lines.length) boopCode.value.lines = [...BOOP_LINES];
    } catch {
        // keep defaults
    }
}

export function saveBoopCode() {
    configRepository.setString(KEY, JSON.stringify(boopCode.value));
}

function emojiId(name) {
    return `default_${name.replace(/ /g, '_').toLowerCase()}`;
}

function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function rng(seed) {
    let a = seed;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** The scrambled emoji order for a passphrase: position i is the emoji that means line i. */
function scrambled(passphrase) {
    const list = photonEmojis.map(emojiId);
    const rand = rng(hash(`neon:${passphrase}`));
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
let lastSend = 0;

/** Send line number `index` as a boop to `userId`. Returns an error string or ''. */
export async function sendBoopLine(userId, index) {
    await initBoopCode();
    const pass = boopCode.value.passphrase.trim();
    if (!pass) return 'passphrase';
    if (!userId) return 'user';
    if (Date.now() - lastSend < 3000) return 'slow';
    const code = scrambled(pass)[index];
    if (!code) return 'line';
    lastSend = Date.now();
    try {
        await miscRequest.sendBoop({ userId, emojiId: code });
        return '';
    } catch (e) {
        console.error('Neon boop', e);
        return 'failed';
    }
}

/** Called for every incoming notification. Speaks the line when it is a trusted sender's code. */
export async function boopCodeReceived(notification) {
    if (notification?.type !== 'boop') return;
    await initBoopCode();
    const c = boopCode.value;
    const pass = c.passphrase.trim();
    if (!c.enabled || !pass) return;
    const trusted = c.trusted.some((n) => same(n, notification.senderUsername) || same(n, notification.senderUserId));
    if (!trusted) return;
    const id = notification.details?.emojiId;
    const index = scrambled(pass).indexOf(id);
    if (index < 0 || index >= c.lines.length) return;
    pushNews({ kind: 'prank', title: '', text: c.lines[index] });
}
