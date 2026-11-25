/**
 * Aura modules runtime. A module is one JavaScript file the user installs; it gets the fixed `aura` connectors from
 * moduleGuide.js and nothing else. Modules run natively inside Aura, so only install ones you trust.
 */
import { reactive, ref } from 'vue';
import { toast } from 'vue-sonner';

import configRepository from './config';
import { addExternalIntegration, removeExternalIntegrations } from './auroraIntegrations';
import { createApi, runModuleSource } from './moduleGuide';
import { sysInfo } from './auroraChatbox';
import { useFriendStore, useGameStore, useLocationStore } from '../stores';

const KEY_LIST = 'Aura_modules';
const KEY_OPTS = 'Aura_moduleOpts';
const KEY_STORE = 'Aura_moduleData';
export const MAX_SOURCE = 200 * 1024;

/** Installed modules: { id, name, version, description, source, enabled, error, options } */
export const modules = ref([]);
/** Panels of running modules: { key, modId, title, render } */
export const modulePanels = ref([]);
export const moduleOpts = reactive({});
const moduleData = {};
const running = new Map(); // modId -> { listeners: [] }
const listeners = new Map(); // event -> Set<{ modId, cb }>
let loaded = false;
let timer = null;
let last = { world: null, song: null, friends: null };

function saveList() {
    configRepository.setString(KEY_LIST, JSON.stringify(modules.value.map(({ id, source, enabled }) => ({ id, source, enabled }))));
}
function saveOpts() {
    configRepository.setString(KEY_OPTS, JSON.stringify(moduleOpts));
}
function saveStore() {
    configRepository.setString(KEY_STORE, JSON.stringify(moduleData));
}

function emit(event, payload) {
    for (const l of listeners.get(event) || []) {
        try {
            l.cb(payload);
        } catch (e) {
            console.error(`[module ${l.modId}] ${event} listener failed`, e);
        }
    }
}

function pollEvents() {
    emit('tick', Date.now());
    const world = useLocationStore().lastLocation?.name || '';
    const info = sysInfo.value || {};
    const song = `${info.song || ''}|${info.artist || ''}`;
    const friends = useFriendStore().onlineFriendCount ?? 0;
    if (last.world !== null && world !== last.world) emit('world', world);
    if (last.song !== null && song !== last.song) emit('song', { song: info.song || '', artist: info.artist || '' });
    if (last.friends !== null && friends !== last.friends) emit('friends', friends);
    last = { world, song, friends };
}

/** Read only values a module may look at. */
export const data = {
    world: () => String(useLocationStore().lastLocation?.name || ''),
    players: () => useLocationStore().lastLocation?.playerList?.size ?? 0,
    friendsOnline: () => useFriendStore().onlineFriendCount ?? 0,
    song: () => String(sysInfo.value?.song || ''),
    artist: () => String(sysInfo.value?.artist || ''),
    musicPlaying: () => !!sysInfo.value?.musicPlaying,
    idleSeconds: () => Number(sysInfo.value?.idleSeconds || 0),
    app: () => String(sysInfo.value?.app || ''),
    vrchatRunning: () => !!useGameStore().isGameRunning,
    now: () => new Date()
};

function liveHost(mod) {
    return {
        data,
        getOption: (id, key) => moduleOpts[id]?.[key],
        addLine(m, line) {
            const defaults = { enabled: false, slot: line.slot };
            for (const o of line.options) defaults[o.key] = o.default;
            addExternalIntegration(
                { id: line.id, name: line.name, desc: line.desc, defaults, options: line.options.map((o) => ({ key: o.key, label: o.label, type: o.type })), module: m.id },
                (ctx) => line.render({ options: { ...(moduleOpts[m.id] || {}), ...ctx } })
            );
        },
        on(id, event, cb) {
            if (!['tick', 'world', 'song', 'friends'].includes(event) || typeof cb !== 'function') return;
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event).add({ modId: id, cb });
        },
        storageGet: (id, key, fallback) => moduleData[id]?.[key] ?? fallback,
        storageSet(id, key, value) {
            const text = JSON.stringify(value);
            if (text === undefined || text.length > 8192) throw new Error('storage value is too big (8 KB max).');
            (moduleData[id] ||= {})[key] = JSON.parse(text);
            saveStore();
        },
        addPanel(id, panel) {
            modulePanels.value.push({ key: `${id}-${modulePanels.value.length}-${Date.now()}`, modId: id, ...panel });
        },
        notify: (text) => toast(text)
    };
}

function stopModule(id) {
    for (const set of listeners.values()) {
        for (const l of [...set]) if (l.modId === id) set.delete(l);
    }
    removeExternalIntegrations((d) => d.module === id);
    modulePanels.value = modulePanels.value.filter((p) => p.modId !== id);
    running.delete(id);
}

function startModule(entry) {
    stopModule(entry.id);
    entry.error = '';
    if (!entry.enabled) return;
    try {
        const api = createApi(liveHost(entry), (def) => {
            Object.assign(entry, { name: def.name, version: def.version, description: def.description, options: def.options });
            const saved = moduleOpts[def.id] || {};
            moduleOpts[def.id] = Object.fromEntries(def.options.map((o) => [o.key, saved[o.key] ?? o.default]));
        });
        running.set(entry.id, {});
        runModuleSource(entry.source, api);
    } catch (e) {
        stopModule(entry.id);
        entry.error = String(e?.message || e);
    }
}

export async function initModules() {
    if (loaded) return;
    loaded = true;
    try {
        Object.assign(moduleOpts, JSON.parse(await configRepository.getString(KEY_OPTS, '{}')));
        Object.assign(moduleData, JSON.parse(await configRepository.getString(KEY_STORE, '{}')));
        const list = JSON.parse(await configRepository.getString(KEY_LIST, '[]'));
        modules.value = (Array.isArray(list) ? list : []).map((m) => reactive({ id: m.id, name: m.id, version: '', description: '', options: [], error: '', source: String(m.source || ''), enabled: m.enabled !== false }));
    } catch {
        modules.value = [];
    }
    modules.value.forEach(startModule);
    timer = setInterval(pollEvents, 1000);
}

/** Installs (or updates) a module from its source text. Returns the entry; throws a plain Error when it will not load. */
export function installModule(source) {
    const text = String(source || '');
    if (!text.trim()) throw new Error('The module is empty.');
    if (text.length > MAX_SOURCE) throw new Error('The module is over 200 KB.');
    // run it once on a throwaway api to read the manifest and catch errors before anything is saved
    let manifest = null;
    const probe = createApi(
        {
            data,
            getOption: () => undefined,
            addLine() {},
            on() {},
            storageGet: (id, k, f) => f,
            storageSet() {},
            addPanel() {},
            notify() {}
        },
        (def) => (manifest = def)
    );
    runModuleSource(text, probe);
    if (!manifest) throw new Error('The module never called aura.define.');
    const existing = modules.value.find((m) => m.id === manifest.id);
    const entry = existing || reactive({ id: manifest.id, name: manifest.name, version: '', description: '', options: [], error: '', source: '', enabled: true });
    entry.source = text;
    entry.enabled = true;
    if (!existing) modules.value.push(entry);
    startModule(entry);
    saveList();
    return entry;
}

export function setModuleEnabled(id, on) {
    const m = modules.value.find((x) => x.id === id);
    if (!m) return;
    m.enabled = !!on;
    startModule(m);
    saveList();
}

export function removeModule(id) {
    stopModule(id);
    modules.value = modules.value.filter((m) => m.id !== id);
    delete moduleOpts[id];
    delete moduleData[id];
    saveList();
    saveOpts();
    saveStore();
}

export function setModuleOption(id, key, value) {
    (moduleOpts[id] ||= {})[key] = value;
    saveOpts();
}
