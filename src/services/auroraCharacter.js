/**
 * Which mascot character is shown. Neon is built in. Every sub folder of
 * images/aurora/mascot/ (for example mascot/fox/neutral.png) is another character.
 */
import { ref } from 'vue';

import configRepository from './config';

const files = import.meta.glob('../../images/aurora/mascot/*/*.png', { eager: true, import: 'default' });

/** { fox: { neutral: url, joy: url, ... }, ... } */
export const characters = {};
for (const [path, url] of Object.entries(files)) {
    const parts = path.split('/');
    const file = parts.pop().replace('.png', '');
    const slug = parts.pop();
    (characters[slug] ||= {})[file] = url;
}

export const characterList = ['neon', ...Object.keys(characters).filter((s) => characters[s].neutral).sort()];
export const character = ref('neon');

export async function initCharacter() {
    const saved = await configRepository.getString('Neon_character', 'neon');
    character.value = characterList.includes(saved) ? saved : 'neon';
}

export function setCharacter(slug) {
    character.value = characterList.includes(slug) ? slug : 'neon';
    configRepository.setString('Neon_character', character.value);
}

export function prettyName(slug) {
    return slug.charAt(0).toUpperCase() + slug.slice(1);
}
