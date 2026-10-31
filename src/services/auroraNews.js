/**
 * Neon's news feed: group announcements, events, update notices.
 * Anything pushed here shows in the dock and Neon says it out loud.
 */
import { ref } from 'vue';

export const newsItems = ref([]);
/** Items Neon has not spoken yet. */
export const unspoken = ref([]);

let nextId = 1;

export function pushNews({ kind, title = '', text = '' }) {
    const item = { id: nextId++, kind, title, text, at: Date.now() };
    newsItems.value = [item, ...newsItems.value].slice(0, 30);
    unspoken.value = [...unspoken.value, item].slice(-5);
    return item;
}

export function takeUnspoken() {
    const item = unspoken.value[0];
    if (item) {
        unspoken.value = unspoken.value.slice(1);
    }
    return item;
}

/** Called for every incoming notification, keeps only the ones worth announcing. */
export function newsFromNoty(noty) {
    if (!noty) {
        return;
    }
    if (noty.type === 'group.announcement') {
        pushNews({ kind: 'announcement', title: noty.title || '', text: noty.message || '' });
    } else if (noty.type === 'group.event.created') {
        pushNews({ kind: 'event', title: noty.title || '', text: noty.message || '' });
    }
}
