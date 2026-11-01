/**
 * Neon chatbox integrations. Each one turns something on your PC or in VRChat into a line of text.
 * Every enabled integration adds a line, and together they make the chatbox message.
 * Written from scratch, no code from other chatbox apps.
 */
import { reactive, ref, watch } from 'vue';

import configRepository from './config';
import { chatboxEnabled, chatboxPages, chatboxPageSlots, registerComposer, renderChatbox, sysInfo } from './auroraChatbox';
import { useGameStore, useLocationStore } from '../stores';

const KEY = 'Neon_integrations';

/** Definitions: what each integration is and which options it has. */
export const INTEGRATIONS = [
    {
        id: 'status',
        name: 'Personal status',
        desc: 'Write your own status message. Use the pages on this screen, with live values like {time} or {world}.',
        desktop: true,
        vr: true,
        icon: 'ri-chat-smile-3-line',
        defaults: { enabled: true }
    },
    {
        id: 'window',
        name: 'Window activity',
        desc: 'Shows if you are in VR or desktop mode, and in desktop mode the application you are focused on.',
        desktop: true,
        vr: true,
        icon: 'ri-window-line',
        defaults: { enabled: false, vrText: 'In VR', desktopText: 'Desktop', showApp: true },
        options: [
            { key: 'vrText', label: 'Text in VR', type: 'text' },
            { key: 'desktopText', label: 'Text on desktop', type: 'text' },
            { key: 'showApp', label: 'Show the focused app', type: 'bool' }
        ]
    },
    {
        id: 'time',
        name: 'Time',
        desc: 'Displays local time with optional time zone conversion.',
        desktop: true,
        vr: true,
        icon: 'ri-time-line',
        defaults: { enabled: false, hour12: false, tz: '', label: '' },
        options: [
            { key: 'label', label: 'Label (optional)', type: 'text' },
            { key: 'tz', label: 'Time zone (like Europe/Vienna, empty = local)', type: 'text' },
            { key: 'hour12', label: '12 hour clock', type: 'bool' }
        ]
    },
    {
        id: 'medialink',
        name: 'MediaLink',
        desc: 'Shows the song and artist from any media session on your PC (Spotify, Chrome, Brave, and so on).',
        desktop: true,
        vr: true,
        icon: 'ri-music-2-line',
        defaults: { enabled: false, autoswitch: true, picked: '', hidden: {}, noArtist: {}, noTitle: {} },
        options: [{ key: 'autoswitch', label: 'Switch to whatever starts playing', type: 'bool' }]
    },
    {
        id: 'components',
        name: 'Component stats',
        desc: 'Display your CPU, GPU, RAM and VRAM usage in real time.',
        desktop: true,
        vr: true,
        icon: 'ri-cpu-line',
        defaults: { enabled: false, cpu: true, gpu: true, ram: true, vram: false, battery: false },
        options: [
            { key: 'cpu', label: 'CPU', type: 'bool' },
            { key: 'gpu', label: 'GPU (NVIDIA)', type: 'bool' },
            { key: 'ram', label: 'RAM', type: 'bool' },
            { key: 'vram', label: 'VRAM (NVIDIA)', type: 'bool' },
            { key: 'battery', label: 'PC battery', type: 'bool' }
        ]
    },
    {
        id: 'network',
        name: 'Network stats',
        desc: 'Display real-time network stats such as download and upload speeds.',
        desktop: true,
        vr: false,
        icon: 'ri-wifi-line',
        defaults: { enabled: false }
    },
    {
        id: 'weather',
        name: 'Weather',
        desc: 'Display local weather details like temperature, feels-like, wind and humidity.',
        desktop: true,
        vr: true,
        icon: 'ri-sun-cloudy-line',
        defaults: { enabled: false, city: '', fahrenheit: false },
        options: [
            { key: 'city', label: 'City', type: 'text' },
            { key: 'fahrenheit', label: 'Fahrenheit', type: 'bool' }
        ]
    },
    {
        id: 'radar',
        name: 'VRChat Radar',
        desc: 'World info, player count and session time for your current VRChat session.',
        desktop: true,
        vr: true,
        icon: 'ri-radar-line',
        defaults: { enabled: false, world: true, players: true, session: true },
        options: [
            { key: 'world', label: 'World name', type: 'bool' },
            { key: 'players', label: 'Player count', type: 'bool' },
            { key: 'session', label: 'Time in this world', type: 'bool' }
        ]
    },
    {
        id: 'afk',
        name: 'AFK status',
        desc: 'Adds "AFK" when you have been idle for a while.',
        desktop: true,
        vr: false,
        icon: 'ri-zzz-line',
        defaults: { enabled: false, minutes: 5, text: 'AFK' },
        options: [
            { key: 'minutes', label: 'Idle minutes', type: 'number' },
            { key: 'text', label: 'Text', type: 'text' }
        ]
    }
];

/** Integrations that exist in other chatbox apps but are not built yet. */
export const COMING_SOON = ['Twitch', 'TikTok', 'Discord', 'Spotify (account)', 'Soundpad', 'VR gear battery'];

export const state = reactive({});
export const mediaSessions = ref([]);
const weather = ref('');
let loaded = false;
let lastPlaying = {};
let weatherTimer = null;
const worldSince = { loc: '', at: Date.now() };

function ensureDefaults() {
    for (const def of INTEGRATIONS) {
        state[def.id] = { slot: def.id === 'status' ? 'rotate' : 'top', ...def.defaults, ...(state[def.id] || {}) };
    }
}

export async function initIntegrations() {
    if (loaded) {
        return;
    }
    loaded = true;
    try {
        const saved = JSON.parse(await configRepository.getString(KEY, '{}'));
        for (const [id, value] of Object.entries(saved)) {
            state[id] = value;
        }
    } catch {
        // start from the defaults
    }
    ensureDefaults();
    watch(state, () => configRepository.setString(KEY, JSON.stringify(state)), { deep: true });
    watch(() => [state.weather?.city, state.weather?.enabled, state.weather?.fahrenheit], startWeather);
    watch(() => sysInfo.value, trackMedia);
    registerComposer(compose);
    startWeather();
}

export function setEnabled(id, value) {
    state[id].enabled = !!value;
}

export function setOption(id, key, value) {
    state[id][key] = value;
}

// ---------- media: remember which session started playing last ----------
function trackMedia(info) {
    const sessions = info?.sessions || [];
    mediaSessions.value = sessions;
    const m = state.medialink;
    if (!m) {
        return;
    }
    for (const s of sessions) {
        if (s.playing && !lastPlaying[s.id] && m.autoswitch) {
            m.picked = s.id;
        }
        lastPlaying[s.id] = s.playing;
    }
}

export function friendlyApp(id) {
    const base = String(id || '').split(/[!\\/]/)[0].replace(/\.exe$/i, '');
    const last = base.split('.').pop() || base;
    return last.charAt(0).toUpperCase() + last.slice(1);
}

function mediaLine() {
    const m = state.medialink;
    const sessions = mediaSessions.value.filter((s) => !m.hidden?.[s.id] && s.title);
    const chosen = sessions.find((s) => s.id === m.picked && s.playing) || sessions.find((s) => s.playing);
    if (!chosen) {
        return '';
    }
    const parts = [];
    if (chosen.artist && !m.noArtist?.[chosen.id]) parts.push(chosen.artist);
    if (!m.noTitle?.[chosen.id]) parts.push(chosen.title);
    return parts.length ? `♪ ${parts.join(' - ')}` : '';
}

// ---------- weather (open-meteo, no key needed) ----------
async function fetchWeather() {
    const w = state.weather;
    if (!w?.enabled || !w.city) {
        weather.value = '';
        return;
    }
    try {
        const geo = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(w.city)}`)).json();
        const place = geo?.results?.[0];
        if (!place) {
            weather.value = '';
            return;
        }
        const unit = w.fahrenheit ? '&temperature_unit=fahrenheit' : '';
        const data = await (
            await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m${unit}`
            )
        ).json();
        const c = data?.current;
        if (c) {
            const deg = w.fahrenheit ? 'F' : 'C';
            weather.value = `${place.name} ${Math.round(c.temperature_2m)}${deg} (feels ${Math.round(c.apparent_temperature)}${deg}) wind ${Math.round(c.wind_speed_10m)} km/h hum ${c.relative_humidity_2m}%`;
        }
    } catch {
        weather.value = '';
    }
}
function startWeather() {
    clearInterval(weatherTimer);
    fetchWeather();
    weatherTimer = setInterval(fetchWeather, 15 * 60 * 1000);
}

// ---------- compose ----------
function fmtSpeed(kb) {
    return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB/s` : `${kb} KB/s`;
}

function minutesSince(ms) {
    const m = Math.max(0, Math.floor((Date.now() - ms) / 60000));
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function lineFor(id, statusText) {
    const s = state[id];
    const info = sysInfo.value || {};
    switch (id) {
        case 'status':
            return statusText;
        case 'window': {
            const inVr = !useGameStore().isGameNoVR;
            if (inVr) return s.vrText;
            const app = s.showApp && info.app ? `: ${info.app}` : '';
            return `${s.desktopText}${app}`;
        }
        case 'time': {
            try {
                const text = new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: !!s.hour12,
                    ...(s.tz ? { timeZone: s.tz } : {})
                });
                return s.label ? `${s.label} ${text}` : text;
            } catch {
                return ''; // bad time zone name
            }
        }
        case 'medialink':
            return mediaLine();
        case 'components': {
            const parts = [];
            if (s.cpu && info.cpu != null) parts.push(`CPU ${info.cpu}%`);
            if (s.gpu && info.gpu != null) parts.push(`GPU ${info.gpu}%`);
            if (s.ram && info.ram != null) parts.push(`RAM ${info.ram}%`);
            if (s.vram && info.vram != null) parts.push(`VRAM ${info.vram}%`);
            if (s.battery && info.battery != null) parts.push(`BAT ${info.battery}%${info.charging ? '+' : ''}`);
            return parts.join(' | ');
        }
        case 'network':
            return info.netDownKb != null ? `↓ ${fmtSpeed(info.netDownKb)} ↑ ${fmtSpeed(info.netUpKb)}` : '';
        case 'weather':
            return weather.value;
        case 'radar': {
            const loc = useLocationStore().lastLocation;
            if (!loc?.location || loc.location === 'offline') return '';
            if (worldSince.loc !== loc.location) {
                worldSince.loc = loc.location;
                worldSince.at = loc.date || Date.now();
            }
            const parts = [];
            if (s.world && loc.name) parts.push(loc.name);
            if (s.players) parts.push(`${loc.playerList?.size ?? 0} players`);
            if (s.session) parts.push(minutesSince(worldSince.at));
            return parts.join(' | ');
        }
        case 'afk':
            return (info.idleSeconds || 0) >= (Number(s.minutes) || 5) * 60 ? s.text : '';
        default:
            return '';
    }
}

/** Builds the chatbox text from every enabled integration. statusText is the current Personal status page. */
/**
 * Builds the chatbox text. Every item has a slot:
 *  top and bottom are always shown, rotate items take turns in the middle (one at a time).
 */
function compose(counter = 0) {
    const top = [];
    const bottom = [];
    const rotate = [];
    const put = (slot, text) => {
        const line = String(text || '').trim();
        if (!line) {
            return;
        }
        (slot === 'top' ? top : slot === 'bottom' ? bottom : rotate).push(line);
    };
    if (!loaded) {
        return renderChatbox(chatboxPages.value[counter % chatboxPages.value.length] || '');
    }
    for (const def of INTEGRATIONS) {
        if (!state[def.id]?.enabled) {
            continue;
        }
        if (def.id === 'status') {
            chatboxPages.value.forEach((page, i) => put(chatboxPageSlots.value[i] || 'rotate', renderChatbox(page)));
        } else {
            put(state[def.id].slot, lineFor(def.id, ''));
        }
    }
    const lines = [...top];
    if (rotate.length) {
        lines.push(rotate[counter % rotate.length]);
    }
    lines.push(...bottom);
    return lines.join('\n').slice(0, 144);
}

export function setSlot(id, slot) {
    if (state[id] && ['top', 'bottom', 'rotate'].includes(slot)) {
        state[id].slot = slot;
    }
}

export { chatboxEnabled };
