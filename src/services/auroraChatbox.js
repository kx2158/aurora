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
    watch([chatboxEnabled, chatboxInterval], restart);
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
export function setChatboxPages(pages) {
    chatboxPages.value = pages.map((p) => String(p).slice(0, 300)).slice(0, 12);
    if (!chatboxPages.value.length) {
        chatboxPages.value = [''];
    }
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
        uptime: formatUptime(Date.now() - startedAt)
    };
    return String(template).replace(/\{(\w+)\}/g, (m, key) => (key in values ? values[key] : m)).slice(0, 144);
}

function tick() {
    const pages = chatboxPages.value;
    const template = pages[chatboxPageIndex.value % pages.length] || '';
    chatboxPreview.value = renderChatbox(template);
    if (chatboxEnabled.value && pages.length > 1) {
        chatboxPageIndex.value = (chatboxPageIndex.value + 1) % pages.length;
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
