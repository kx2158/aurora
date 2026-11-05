/**
 * Add-ons: plain folders in the Neon data folder (addons\<name>\), no installer or rebuild needed.
 *   faces\neutral.png, joy.png, ...   a character (shows up in the character picker)
 *   voice\poke\*.mp3, idle\*.wav ...  a voice (recordings Neon plays instead of the generated voice)
 * They are only pictures and sound files, an add-on cannot run code.
 */
import { ref } from 'vue';

import configRepository from './config';
import { registerCharacter } from './auroraCharacter';

/** [{ id, name, author, faces:[], voice:{ kind:[files] } }] */
export const addons = ref([]);
/** id of the add-on whose voice is used, '' for Neon's own voice */
export const addonVoice = ref('');
export const addonStatus = ref('');

const clipCache = new Map(); // "id/kind/file" -> { samples, rate }
let ctx = null;
let loaded = false;

export async function initAddons() {
    if (loaded) return;
    loaded = true;
    addonVoice.value = await configRepository.getString('Neon_addonVoice', '');
    await refreshAddons();
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
        const faces = {};
        for (const name of a.faces) {
            const url = await AppApi.ReadNeonAddonFile(a.id, `faces/${name}.png`);
            if (url) faces[name] = url;
        }
        if (faces.neutral) registerCharacter(a.id, faces);
    }
    if (addonVoice.value && !addons.value.some((a) => a.id === addonVoice.value)) {
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
    const addon = addons.value.find((a) => a.id === addonVoice.value);
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
