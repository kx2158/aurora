/**
 * Per-person rules. Only things on YOUR screen and in Neon's own voice and bubble:
 * a greeting when the person joins your instance and a repeating reminder while they stay.
 * Nothing is sent to them, nothing goes into your chatbox, and the nickname never leaves this machine.
 */
import { ref } from 'vue';

import configRepository from './config';
import { pushNews } from './auroraNews';

const KEY = 'Neon_personRules';

/** [{ id, enabled, name, nickname, greeting, reminder, minutes, escalate }] */
export const personRules = ref([]);
let loaded = false;
const timers = new Map();

export async function initPersonRules() {
    if (loaded) return;
    loaded = true;
    try {
        const saved = JSON.parse(await configRepository.getString(KEY, '[]'));
        personRules.value = Array.isArray(saved) ? saved : [];
    } catch {
        personRules.value = [];
    }
}

export function savePersonRules() {
    configRepository.setString(KEY, JSON.stringify(personRules.value));
}

export function addPersonRule() {
    personRules.value = [
        ...personRules.value,
        {
            id: Date.now().toString(36),
            enabled: true,
            name: '',
            nickname: '',
            greeting: '',
            reminder: 'Sit up straight',
            minutes: 10,
            escalate: true
        }
    ];
    savePersonRules();
}

export function removePersonRule(id) {
    stopFor(id);
    personRules.value = personRules.value.filter((r) => r.id !== id);
    savePersonRules();
}

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const fill = (text, r) => String(text || '').replaceAll('{name}', r.nickname || r.name);

function stopFor(id) {
    const t = timers.get(id);
    if (t) clearTimeout(t);
    timers.delete(id);
}

function schedule(r, count) {
    stopFor(r.id);
    if (!r.reminder) return;
    const base = Math.max(1, Number(r.minutes) || 10);
    // escalate: every reminder comes sooner, down to once every minute
    const minutes = r.escalate ? Math.max(1, base * Math.pow(0.8, count)) : base;
    timers.set(
        r.id,
        setTimeout(() => {
            pushNews({ kind: 'prank', title: '', text: fill(r.reminder, r) });
            schedule(r, count + 1);
        }, minutes * 60000)
    );
}

/** Called from the game log when somebody joins or leaves your instance. */
export async function personRuleEvent(displayName, joined) {
    await initPersonRules();
    for (const r of personRules.value) {
        if (!r.enabled || !same(r.name, displayName)) continue;
        if (joined) {
            if (r.greeting) pushNews({ kind: 'prank', title: '', text: fill(r.greeting, r) });
            schedule(r, 0);
        } else {
            stopFor(r.id);
        }
    }
}
