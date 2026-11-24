/**
 * Neon chatbox: puts a live line of text in the VRChat chatbox over OSC.
 * Written from scratch against the public VRChat OSC docs. No code from other chatbox apps.
 * VRChat limits: 144 characters, and it asks apps to send no faster than about every 1.5 seconds.
 */
import { ref, watch } from 'vue';

import configRepository from './config';
import { animFrame, hasAnimation } from './chatboxAnim';
import { clampMs, revealText, TYPEOUT_DEFAULTS, typewriterPlan } from './chatboxTypeout';
import { useFriendStore, useGameStore, useLocationStore } from '../stores';

export const chatboxEnabled = ref(false);
export const chatboxTemplate = ref('{time} | {world} | {friends} friends online');
export const chatboxInterval = ref(5);
export const chatboxNotify = ref(false);
// the two control characters VRChat reads as "draw this text without the bubble behind it"
export const NO_BG_SUFFIX = '\u0003\u001f';
export const chatboxNoBg = ref(false);
export const chatboxTypingIndicator = ref(true);
export const chatboxLive = ref(false);
export const chatboxTypeout = ref(false);
export const chatboxTypeMs = ref(TYPEOUT_DEFAULTS.typeMs);
export const chatboxHoldMs = ref(TYPEOUT_DEFAULTS.holdMs);
export const chatboxEraseMs = ref(TYPEOUT_DEFAULTS.eraseMs);
let twTimers = [];
let twActive = false;
let liveTimer = null;
let liveAt = 0;
export const chatboxPad = ref(0);
/** Spaces in front of the text, then the no-background marker when that is on; always within 144 characters. */
export function withBackgroundSetting(text, noBg, pad = chatboxPad.value) {
    const lead = ' '.repeat(Math.max(0, Math.min(30, Number(pad) || 0)));
    const room = 144 - (noBg ? NO_BG_SUFFIX.length : 0);
    const body = (lead + String(text ?? '')).slice(0, room);
    return noBg ? body + NO_BG_SUFFIX : body;
}
export const chatboxPreview = ref('');
/** Pages rotate every interval, like a slideshow of lines. */
export const chatboxPages = ref(['{time} | {world} | {friends} friends online']);
export const chatboxPageIndex = ref(0);
/** Where each page sits: 'top' and 'bottom' are always shown, 'rotate' pages take turns in the middle. */
export const chatboxPageSlots = ref(['rotate']);
/** Counts ticks, used to pick which rotating item is shown. */
export const rotateCounter = ref(0);
/** Latest snapshot from the PC: window, app, music, cpu, ram, battery, idleSeconds. */
export const sysInfo = ref({});
export const afkMinutes = ref(5);
let composer = null;
/** The integrations module plugs itself in here so this file does not import it back. */
export function registerComposer(fn) {
    composer = fn;
}
let sysTimer = null;
const startedAt = Date.now();

let loaded = false;
let timer = null;
let lastSent = '';
let lastSentAt = 0;
let nudgeTimer = null;
// VRChat rate-limits chatbox updates (about 5 per 5 seconds, and stricter since 2024), so under about 1.1 s updates may be dropped
// and can earn a "timed out for spam" pause. It is still allowed on purpose: the speed is a setting, 1.2 s by default, 1 s at the lowest.
export const ANIM_MIN_MS = 1000;
export const ANIM_MAX_MS = 5000;
export const chatboxAnimMs = ref(1200);
const MIN_GAP = () => chatboxAnimMs.value;
// a message you send through Aurora stays up at least this long before anything else replaces it
export const HOLD_MS = 7000;
let holdUntil = 0;

let animTimer = null;
let frame = 0;

export async function initChatbox() {
    if (loaded) {
        return;
    }
    loaded = true;
    chatboxEnabled.value = await configRepository.getBool('Neon_chatboxEnabled', false);
    chatboxTemplate.value = await configRepository.getString('Neon_chatboxTemplate', chatboxTemplate.value);
    chatboxInterval.value = await configRepository.getInt('Neon_chatboxInterval', 5);
    chatboxNotify.value = await configRepository.getBool('Neon_chatboxNotify', false);
    try {
        const pages = JSON.parse(await configRepository.getString('Neon_chatboxPages', '[]'));
        chatboxPages.value = Array.isArray(pages) && pages.length ? pages.map(String).slice(0, 12) : [chatboxTemplate.value];
    } catch {
        chatboxPages.value = [chatboxTemplate.value];
    }
    try {
        const slots = JSON.parse(await configRepository.getString('Neon_chatboxPageSlots', '[]'));
        chatboxPageSlots.value = chatboxPages.value.map((_, i) => (['top', 'bottom', 'rotate'].includes(slots?.[i]) ? slots[i] : 'rotate'));
    } catch {
        chatboxPageSlots.value = chatboxPages.value.map(() => 'rotate');
    }
    afkMinutes.value = await configRepository.getInt('Neon_afkMinutes', 5);
    chatboxPad.value = await configRepository.getInt('Aurora_chatboxPad', 0);
    chatboxTypeout.value = await configRepository.getBool('Aurora_chatboxTypeout', false);
    chatboxTypeMs.value = clampMs(await configRepository.getInt('Aurora_chatboxTypeMs', TYPEOUT_DEFAULTS.typeMs), TYPEOUT_DEFAULTS.typeMs);
    chatboxHoldMs.value = clampMs(await configRepository.getInt('Aurora_chatboxHoldMs', TYPEOUT_DEFAULTS.holdMs), TYPEOUT_DEFAULTS.holdMs);
    chatboxEraseMs.value = clampMs(await configRepository.getInt('Aurora_chatboxEraseMs', TYPEOUT_DEFAULTS.eraseMs), TYPEOUT_DEFAULTS.eraseMs);
    chatboxLive.value = await configRepository.getBool('Aurora_chatboxLive', false);
    chatboxNoBg.value = await configRepository.getBool('Aurora_chatboxNoBg', false);
    chatboxTypingIndicator.value = await configRepository.getBool('Aurora_chatboxTyping', true);
    chatboxAnimMs.value = clampAnim(await configRepository.getInt('Aurora_chatboxAnimMs', 1200));
    watch([chatboxEnabled, chatboxInterval, chatboxAnimMs], restart);
    startSysInfo();
    restart();
}

export function clampAnim(v) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(ANIM_MAX_MS, Math.max(ANIM_MIN_MS, n)) : 1200;
}
export function setChatboxAnimMs(v) {
    chatboxAnimMs.value = clampAnim(v);
    configRepository.setInt('Aurora_chatboxAnimMs', chatboxAnimMs.value);
}

export function setChatboxTypeout(v) {
    chatboxTypeout.value = !!v;
    configRepository.setBool('Aurora_chatboxTypeout', chatboxTypeout.value);
    if (loaded) {
        restart();
    }
}
/** Sets how long the typewriter types, holds and erases (milliseconds). */
export function setTypewriterTimes(kind, v) {
    const target = { type: chatboxTypeMs, hold: chatboxHoldMs, erase: chatboxEraseMs }[kind];
    const key = { type: 'Aurora_chatboxTypeMs', hold: 'Aurora_chatboxHoldMs', erase: 'Aurora_chatboxEraseMs' }[kind];
    if (!target) {
        return;
    }
    target.value = clampMs(v, target.value);
    configRepository.setInt(key, target.value);
    if (loaded) {
        startTypewriter();
    }
}
export function setChatboxPad(v) {
    chatboxPad.value = Math.max(0, Math.min(30, Math.round(Number(v) || 0)));
    configRepository.setInt('Aurora_chatboxPad', chatboxPad.value);
    lastSent = '';
}
export function setChatboxLive(v) {
    chatboxLive.value = !!v;
    configRepository.setBool('Aurora_chatboxLive', chatboxLive.value);
}
export function setChatboxNoBg(v) {
    chatboxNoBg.value = !!v;
    configRepository.setBool('Aurora_chatboxNoBg', chatboxNoBg.value);
    lastSent = '';
}
export function setChatboxTypingIndicator(v) {
    chatboxTypingIndicator.value = !!v;
    configRepository.setBool('Aurora_chatboxTyping', chatboxTypingIndicator.value);
}

export function setChatboxEnabled(v) {
    chatboxEnabled.value = v;
    configRepository.setBool('Neon_chatboxEnabled', v);
}
export function setChatboxTemplate(v) {
    chatboxTemplate.value = String(v).slice(0, 300);
    configRepository.setString('Neon_chatboxTemplate', chatboxTemplate.value);
}
export function setChatboxInterval(v) {
    chatboxInterval.value = Math.min(60, Math.max(3, Number(v) || 5));
    configRepository.setInt('Neon_chatboxInterval', chatboxInterval.value);
}
export function setChatboxPages(pages, slots) {
    chatboxPages.value = pages.map((p) => String(p).slice(0, 300)).slice(0, 12);
    if (!chatboxPages.value.length) {
        chatboxPages.value = [''];
    }
    const old = slots || chatboxPageSlots.value;
    chatboxPageSlots.value = chatboxPages.value.map((_, i) => (['top', 'bottom', 'rotate'].includes(old[i]) ? old[i] : 'rotate'));
    configRepository.setString('Neon_chatboxPageSlots', JSON.stringify(chatboxPageSlots.value));
    chatboxPageIndex.value = 0;
    configRepository.setString('Neon_chatboxPages', JSON.stringify(chatboxPages.value));
    lastSent = '';
}

/** Sends one line right now (for the manual box). */
export function sendChatboxNow(text, typingFirst = false) {
    clearTimeout(liveTimer);
    const line = String(text || '').slice(0, 144);
    if (!line) {
        return;
    }
    AppApi.SendOscChatbox(withBackgroundSetting(renderChatbox(line), chatboxNoBg.value), true, chatboxNotify.value, 9000);
    // keep this message on screen: nothing else (rotation, animation, nudges) may replace it for a while
    holdUntil = Date.now() + HOLD_MS;
    lastSentAt = Date.now();
    lastSent = '';
    if (typingFirst) {
        AppApi.SendOscTyping(false, 9000);
    }
}

/**
 * Live typing: the text in the box goes to VRChat as it is typed. VRChat limits updates, so it goes out at most once per
 * animation-speed gap, and the newest text is always sent last (trailing send), never an old half-word.
 */
export function liveTypeSend(text) {
    clearTimeout(liveTimer);
    const t = String(text ?? '');
    if (!t.trim()) {
        return;
    }
    const send = () => {
        liveAt = Date.now();
        holdUntil = Date.now() + HOLD_MS;
        lastSent = '';
        try {
            AppApi.SendOscChatbox(withBackgroundSetting(t, chatboxNoBg.value), true, false, 9000);
        } catch (e) {
            console.error('live typing failed', e);
        }
    };
    const wait = chatboxAnimMs.value - (Date.now() - liveAt);
    if (wait <= 0) {
        send();
    } else {
        liveTimer = setTimeout(send, wait);
    }
}

export function setTyping(on) {
    if (on && !chatboxTypingIndicator.value) {
        return;
    }
    try {
        AppApi.SendOscTyping(!!on, 9000);
    } catch (e) {
        console.error(e);
    }
}

export function setAfkMinutes(v) {
    afkMinutes.value = Math.min(120, Math.max(1, Number(v) || 5));
    configRepository.setInt('Neon_afkMinutes', afkMinutes.value);
}

async function refreshSysInfo() {
    try {
        sysInfo.value = JSON.parse((await AppApi.GetNeonSystemInfo()) || '{}');
    } catch {
        sysInfo.value = {};
    }
}
function startSysInfo() {
    clearInterval(sysTimer);
    refreshSysInfo();
    sysTimer = setInterval(refreshSysInfo, 3000);
}

export function setChatboxNotify(v) {
    chatboxNotify.value = v;
    configRepository.setBool('Neon_chatboxNotify', v);
}

function formatUptime(ms) {
    const m = Math.floor(ms / 60000);
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Fills the template with live values. Unknown {words} stay as they are. */
export function renderChatbox(template) {
    const loc = useLocationStore().lastLocation;
    const now = new Date();
    const values = {
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: now.toLocaleDateString(),
        world: loc?.name || 'offline',
        players: String(loc?.playerList?.size ?? 0),
        friends: String(useFriendStore().onlineFriendCount ?? 0),
        uptime: formatUptime(Date.now() - startedAt),
        window: String(sysInfo.value.window || '').slice(0, 40),
        app: sysInfo.value.app || '',
        song: sysInfo.value.song || '',
        artist: sysInfo.value.artist || '',
        music: sysInfo.value.musicPlaying && sysInfo.value.song ? `\u266a ${sysInfo.value.artist ? sysInfo.value.artist + ' - ' : ''}${sysInfo.value.song}` : '',
        cpu: sysInfo.value.cpu != null ? `${sysInfo.value.cpu}%` : '',
        ram: sysInfo.value.ram != null ? `${sysInfo.value.ram}%` : '',
        battery: sysInfo.value.battery != null ? `${sysInfo.value.battery}%${sysInfo.value.charging ? '+' : ''}` : '',
        afk: (sysInfo.value.idleSeconds || 0) >= afkMinutes.value * 60 ? 'AFK' : '',
        sparkle: animFrame('sparkle', frame),
        dots: animFrame('dots', frame),
        cursor: animFrame('cursor', frame),
        spin: animFrame('spin', frame)
    };
    return String(template).replace(/\{(\w+)\}/g, (m, key) => (key in values ? values[key] : m)).slice(0, 144);
}

/**
 * Something changed that should show right away (a new song, play or pause): send the current text now,
 * without moving the rotation on, or as soon as VRChat's rate limit allows.
 */
export function chatboxNudge() {
    clearTimeout(nudgeTimer);
    const wait = Math.max(MIN_GAP() - (Date.now() - lastSentAt), holdUntil - Date.now());
    nudgeTimer = setTimeout(() => tick(false), Math.max(0, wait));
}

function stopTypewriter() {
    twTimers.forEach(clearTimeout);
    twTimers = [];
    if (twActive) {
        twActive = false;
        setTyping(false);
    }
}

/** Typewriter preset: the status is typed, held, erased, then the next one is typed. Every other line stays on screen. */
function startTypewriter() {
    stopTypewriter();
    if (!chatboxEnabled.value || !chatboxTypeout.value) {
        return;
    }
    twActive = true;
    twCycle();
}

function twCycle() {
    if (!twActive) {
        return;
    }
    const plan = typewriterPlan({ typeMs: chatboxTypeMs.value, holdMs: chatboxHoldMs.value, eraseMs: chatboxEraseMs.value, gapMs: chatboxAnimMs.value });
    const counter = rotateCounter.value;
    twTimers = plan.steps.map((st) => setTimeout(() => twStep(st, counter), st.at));
    twTimers.push(
        setTimeout(() => {
            rotateCounter.value++;
            twCycle();
        }, plan.total)
    );
}

function twStep(st, counter) {
    let text;
    if (composer) {
        text = composer(counter, st.fraction);
    } else {
        const pages = chatboxPages.value;
        text = revealText(renderChatbox(pages[counter % pages.length] || ''), st.fraction);
    }
    chatboxPreview.value = text;
    if (!chatboxEnabled.value || !useGameStore().isGameRunning) {
        return;
    }
    if (st.typing !== undefined) {
        setTyping(st.typing);
    }
    if (Date.now() < holdUntil || text === lastSent) {
        return;
    }
    lastSent = text;
    lastSentAt = Date.now();
    try {
        // an erased status with nothing else on screen is sent as a single space so the old text goes away
        AppApi.SendOscChatbox(withBackgroundSetting(text || ' ', chatboxNoBg.value), true, chatboxNotify.value && st.fraction === 1 && st.typing !== false, 9000);
    } catch (e) {
        console.error('typewriter failed', e);
    }
}

function tick(advance = true) {
    if (twActive || Date.now() < holdUntil) {
        return; // the typewriter drives the chatbox, or a message you sent is still on screen
    }
    // with integrations plugged in, pinned lines stay and the rotating ones take turns
    // a nudge re-sends the item that is showing now, it does not skip ahead
    const counter = advance ? rotateCounter.value : Math.max(0, rotateCounter.value - 1);
    if (composer) {
        chatboxPreview.value = composer(counter);
    } else {
        const pages = chatboxPages.value;
        chatboxPreview.value = renderChatbox(pages[counter % pages.length] || '');
    }
    if (chatboxEnabled.value && advance) {
        rotateCounter.value++;
    }
    if (!chatboxEnabled.value || !useGameStore().isGameRunning) {
        return;
    }
    const text = chatboxPreview.value;
    if (!text || text === lastSent) {
        return; // do not spam VRChat with identical text
    }
    lastSent = text;
    lastSentAt = Date.now();
    try {
        AppApi.SendOscChatbox(withBackgroundSetting(text, chatboxNoBg.value), true, chatboxNotify.value, 9000);
    } catch (e) {
        console.error('Neon chatbox failed', e);
    }
}

function restart() {
    clearInterval(timer);
    lastSent = '';
    timer = setInterval(tick, chatboxInterval.value * 1000);
    clearInterval(animTimer);
    // animated pieces move on every send; VRChat allows about one send per 1.5 s, so that is the fastest it can go
    animTimer = setInterval(() => {
        if (!chatboxEnabled.value || !hasAnimation(chatboxPages.value) || Date.now() < holdUntil) {
            return;
        }
        frame++;
        tick(false);
    }, MIN_GAP());
    startTypewriter();
    tick();
}
