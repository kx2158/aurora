/**
 * Which mascot character is shown. Neon is built in. Every sub folder of
 * images/aurora/mascot/ (for example mascot/fox/neutral.png) is another character.
 */
import { computed, reactive, ref } from 'vue';

import configRepository from './config';

const files = import.meta.glob('../../images/aurora/mascot/*/*.png', { eager: true, import: 'default' });

/** { fox: { neutral: url, joy: url, ... }, ... }  Built in characters plus add-ons. */
export const characters = reactive({});
for (const [path, url] of Object.entries(files)) {
    const parts = path.split('/');
    const file = parts.pop().replace('.png', '');
    const slug = parts.pop();
    (characters[slug] ||= {})[file] = url;
}

export const characterList = computed(() => ['neon', ...Object.keys(characters).filter((s) => characters[s].neutral).sort()]);
export const character = ref('neon');
let savedSlug = 'neon';

export async function initCharacter() {
    savedSlug = await configRepository.getString('Neon_character', 'neon');
    character.value = characterList.value.includes(savedSlug) ? savedSlug : 'neon';
}

/** Adds (or replaces) a character, used by add-ons. faces is { neutral: url, joy: url, ... }. */
export function registerCharacter(slug, faces) {
    characters[slug] = faces;
    if (slug === savedSlug) {
        character.value = slug; // the saved choice was an add-on that just finished loading
    }
}

export function setCharacter(slug) {
    character.value = characterList.value.includes(slug) ? slug : 'neon';
    savedSlug = character.value;
    configRepository.setString('Neon_character', character.value);
}

export function prettyName(slug) {
    return slug.charAt(0).toUpperCase() + slug.slice(1);
}
