/**
 * Neon chatbox: puts a live line of text in the VRChat chatbox over OSC.
 * Written from scratch against the public VRChat OSC docs. No code from other chatbox apps.
 * VRChat limits: 144 characters, and it asks apps to send no faster than about every 1.5 seconds.
 */
import { ref, watch } from 'vue';

import configRepository from './config';
import { useFriendStore, useGameStore, useLocationStore } from '../stores';

export const chatboxEnabled = ref(false);
export const chatboxTemplate = ref('{time} | {world} | {friends} friends online');
export const chatboxInterval = ref(5);
export const chatboxNotify = ref(false);
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
    watch([chatboxEnabled, chatboxInterval], restart);
    startSysInfo();
    restart();
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
    const line = String(text || '').slice(0, 144);
    if (!line) {
        return;
    }
    AppApi.SendOscChatbox(renderChatbox(line), true, chatboxNotify.value, 9000);
    if (typingFirst) {
        AppApi.SendOscTyping(false, 9000);
    }
}

export function setTyping(on) {
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
        afk: (sysInfo.value.idleSeconds || 0) >= afkMinutes.value * 60 ? 'AFK' : ''
    };
    return String(template).replace(/\{(\w+)\}/g, (m, key) => (key in values ? values[key] : m)).slice(0, 144);
}

function tick() {
    // with integrations plugged in, pinned lines stay and the rotating ones take turns
    if (composer) {
        chatboxPreview.value = composer(rotateCounter.value);
    } else {
        const pages = chatboxPages.value;
        chatboxPreview.value = renderChatbox(pages[rotateCounter.value % pages.length] || '');
    }
    if (chatboxEnabled.value) {
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
    try {
        AppApi.SendOscChatbox(text, true, chatboxNotify.value, 9000);
    } catch (e) {
        console.error('Neon chatbox failed', e);
    }
}

function restart() {
    clearInterval(timer);
    lastSent = '';
    timer = setInterval(tick, chatboxInterval.value * 1000);
    tick();
}
