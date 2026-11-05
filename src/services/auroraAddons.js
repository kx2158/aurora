/**
 * Add-ons: plain folders in the Neon data folder (addons\<name>\), no installer or rebuild needed.
 *   faces\neutral.png, joy.png, ...   a character (shows up in the character picker)
 *   voice\poke\*.mp3, idle\*.wav ...  a voice (recordings Neon plays instead of the generated voice)
 * They are only pictures and sound files, an add-on cannot run code.
 */
import { computed, ref, watch } from 'vue';

import configRepository from './config';
import { setAccentOverride } from './auroraAccent';
import { character, registerCharacter } from './auroraCharacter';

/** [{ id, name, author, faces:[], voice:{ kind:[files] } }] */
export const addons = ref([]);
/** id of the add-on whose voice is used, '' for Neon's own voice */
export const addonVoice = ref('');
export const addonStatus = ref('');
/** ids of hidden add-ons the user has unlocked */
export const unlockedAddons = ref([]);
/** add-ons that are visible: not hidden, or hidden and unlocked */
export const visibleAddons = computed(() => addons.value.filter((a) => !a.hidden || unlockedAddons.value.includes(a.id)));

/** English lines of add-on personas, { addonId: { kind: [lines] } } */
const personaLines = ref({});

/**
 * An add-on character can bring its own look and voice (addon.json: appName, accent, voiceId, voiceSpeed,
 * lines:true plus a lines.json). It applies while that character is the chosen one.
 */
export const persona = computed(() => {
    const a = addons.value.find((x) => x.id === character.value);
    const m = a?.meta;
    if (!m || !(m.appName || m.accent || m.voiceId || m.lines)) return null;
    return {
        id: a.id,
        appName: String(m.appName || ''),
        accent: String(m.accent || ''),
        voiceId: String(m.voiceId || ''),
        voiceSpeed: Number(m.voiceSpeed) || 1,
        lines: personaLines.value[a.id] || null
    };
});
export const appName = computed(() => persona.value?.appName || 'Neon');

const baseTitle = typeof document !== 'undefined' ? document.title : 'Neon';
watch(
    persona,
    (p) => {
        setAccentOverride(p?.accent || '');
        try {
            document.title = p?.appName || baseTitle;
        } catch {
            // no document
        }
    },
    { immediate: true }
);

/** A line from the persona for this kind of line, or '' to use Neon's own. */
export function personaLine(kind, recent = []) {
    const pool = persona.value?.lines?.[kind];
    if (!Array.isArray(pool) || !pool.length) return '';
    const fresh = pool.filter((l) => !recent.includes(l));
    const from = fresh.length ? fresh : pool;
    return from[Math.floor(Math.random() * from.length)];
}

const clipCache = new Map(); // "id/kind/file" -> { samples, rate }
let ctx = null;
let loaded = false;

export async function initAddons() {
    if (loaded) return;
    loaded = true;
    addonVoice.value = await configRepository.getString('Neon_addonVoice', '');
    try {
        unlockedAddons.value = JSON.parse(await configRepository.getString('Neon_addonUnlocked', '[]')) || [];
    } catch {
        unlockedAddons.value = [];
    }
    await refreshAddons();
}

/** Unlocks hidden add-ons whose addon.json "unlockFor" matches the logged in VRChat name. */
export async function autoUnlockFor(displayName) {
    const n = String(displayName || '').trim().toLowerCase();
    if (!n) return;
    await initAddons();
    const hits = addons.value.filter(
        (a) => a.hidden && a.unlockFor && String(a.unlockFor).toLowerCase() === n && !unlockedAddons.value.includes(a.id)
    );
    if (!hits.length) return;
    unlockedAddons.value = [...unlockedAddons.value, ...hits.map((a) => a.id)];
    configRepository.setString('Neon_addonUnlocked', JSON.stringify(unlockedAddons.value));
    await refreshAddons();
}

/** Reveals a hidden add-on when its id (or name) is typed in. Returns true on a match. */
export async function unlockAddon(code) {
    const c = String(code || '').trim().toLowerCase();
    if (!c) return false;
    const hit = addons.value.find((a) => a.hidden && (a.id.toLowerCase() === c || String(a.name).toLowerCase() === c));
    if (!hit) return false;
    if (!unlockedAddons.value.includes(hit.id)) {
        unlockedAddons.value = [...unlockedAddons.value, hit.id];
        configRepository.setString('Neon_addonUnlocked', JSON.stringify(unlockedAddons.value));
    }
    await refreshAddons();
    return true;
}

export function openAddonsFolder() {
    try {
        AppApi.OpenNeonAddonsFolder();
    } catch (e) {
        console.error(e);
    }
}

export async function refreshAddons() {
    addonStatus.value = '';
    let list = [];
    try {
        list = JSON.parse((await AppApi.ListNeonAddons()) || '[]');
    } catch (e) {
        console.error('Neon add-ons', e);
    }
    addons.value = Array.isArray(list) ? list : [];
    for (const a of addons.value) {
        if (!a.faces?.includes('neutral')) continue;
        if (a.hidden && !unlockedAddons.value.includes(a.id)) continue;
        const faces = {};
        for (const name of a.faces) {
            const url = await AppApi.ReadNeonAddonFile(a.id, `faces/${name}.png`);
            if (url) faces[name] = url;
        }
        if (faces.neutral) registerCharacter(a.id, faces);
        if (a.meta?.lines === true) {
            try {
                const uri = await AppApi.ReadNeonAddonFile(a.id, 'lines.json');
                if (uri) {
                    const text = await (await fetch(uri)).text();
                    personaLines.value = { ...personaLines.value, [a.id]: JSON.parse(text) };
                }
            } catch (e) {
                console.error('Neon add-on lines', e);
            }
        }
    }
    if (addonVoice.value && !visibleAddons.value.some((a) => a.id === addonVoice.value)) {
        addonVoice.value = '';
    }
    addonStatus.value = `${addons.value.length}`;
}

export function setAddonVoice(id) {
    addonVoice.value = id || '';
    configRepository.setString('Neon_addonVoice', addonVoice.value);
}

async function decode(dataUri) {
    ctx = ctx || new AudioContext();
    const bytes = await (await fetch(dataUri)).arrayBuffer();
    const buf = await ctx.decodeAudioData(bytes);
    // mono is enough for the mouth sync, mix the channels down
    const out = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
        const ch = buf.getChannelData(c);
        for (let i = 0; i < out.length; i++) out[i] += ch[i] / buf.numberOfChannels;
    }
    return { samples: out, rate: buf.sampleRate };
}

/** A random recording of this kind of line from the chosen voice add-on, or null to use the normal voice. */
export async function pickClip(kind) {
    if (!addonVoice.value || !kind) return null;
    const addon = visibleAddons.value.find((a) => a.id === addonVoice.value);
    const files = addon?.voice?.[kind];
    if (!files?.length) return null;
    const file = files[Math.floor(Math.random() * files.length)];
    const key = `${addon.id}/${kind}/${file}`;
    if (clipCache.has(key)) return clipCache.get(key);
    try {
        const uri = await AppApi.ReadNeonAddonFile(addon.id, `voice/${kind}/${file}`);
        if (!uri) return null;
        const entry = await decode(uri);
        clipCache.set(key, entry);
        return entry;
    } catch (e) {
        console.error('Neon add-on clip', e);
        return null;
    }
}
