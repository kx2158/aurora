/**
 * Small things worth telling you about: alarms, group announcements, events.
 * Alarms pop up as a notice in the app; everything is kept in a short list for the Home page.
 */
import { ref } from 'vue';
import { toast } from 'vue-sonner';

export const newsItems = ref([]);

let nextId = 1;

export function pushNews({ kind, title = '', text = '' }) {
    const item = { id: nextId++, kind, title, text, at: Date.now() };
    newsItems.value = [item, ...newsItems.value].slice(0, 30);
    if (kind === 'alarm') {
        toast(text || 'Alarm', { description: title, duration: 20000 });
    }
    return item;
}

/** Called for every incoming notification, keeps only the ones worth remembering. */
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
