/**
 * Status rules: change your VRChat status around the people you care about.
 *
 * Each rule watches one or more friends:
 *   1. one of them comes online        -> your status becomes the rule's "online" status
 *   2. they join your instance in time -> the "joined" status (or keep the current one)
 *      ...but if anyone from your "keep away" list is online, the keep away status wins
 *   3. nobody joined after N minutes   -> the "fallback" status (for example Ask me)
 *   4. all of them went offline        -> your status goes back to what it was (optional)
 *
 * The first active rule in the list decides. Changing your status by hand pauses the rules
 * until the people involved go offline. Everything stays on this machine.
 */
import { ref, watch } from 'vue';

import { userRequest } from '../api';
import { useFriendStore } from '../stores/friend';
import { useUserStore } from '../stores/user';
import configRepository from './config';

const KEY = 'Aurora_statusRulesV2';

let nextId = Date.now();
export function newRule(partial = {}) {
    return {
        id: `rule_${nextId++}`,
        enabled: true,
        people: [],
        onlineStatus: 'join me',
        onlineDesc: '',
        waitMin: 10,
        joinedStatus: 'keep',
        joinedDesc: '',
        fallbackStatus: 'ask me',
        fallbackDesc: '',
        restore: true,
        ...partial
    };
}

/** settings: { enabled, rules: [...], avoid: { people: [], status, desc } } */
export const statusRules = ref({
    enabled: true,
    rules: [],
    avoid: { people: [], status: 'ask me', desc: '' }
});

/** Live state per rule id: { phase: 'waiting'|'fallback'|'joined', since, until } for the cards. */
export const ruleState = ref({});

let loaded = false;
const onlineNow = new Set();
const timers = new Map();
let before = null; // your status before any rule touched it
let lastApplied = null; // what the rules last set, to notice manual changes
let pausedByHand = false;
let lastRuleRestores = true; // whether the rule that was in charge wants your old status back

export async function initStatusRules() {
    if (loaded) {
        return;
    }
    loaded = true;
    try {
        const saved = JSON.parse(await configRepository.getString(KEY, ''));
        if (saved && Array.isArray(saved.rules)) {
            statusRules.value = {
                ...statusRules.value,
                ...saved,
                avoid: { ...statusRules.value.avoid, ...(saved.avoid || {}) },
                rules: saved.rules.map((r) => newRule(r))
            };
        }
    } catch {
        // first run: move the old single rule over
        try {
            const old = JSON.parse(await configRepository.getString('Neon_statusRules', '{}'));
            if (old && Array.isArray(old.ids) && old.ids.length) {
                statusRules.value.rules = [
                    newRule({
                        enabled: !!old.enabled,
                        people: old.ids,
                        onlineStatus: old.status || 'busy',
                        onlineDesc: old.desc || '',
                        fallbackStatus: old.status || 'busy',
                        fallbackDesc: old.desc || '',
                        restore: old.restore !== false
                    })
                ];
            }
        } catch {
            // nothing to move
        }
    }
    // friends that are already online count from the start
    try {
        for (const [id, f] of useFriendStore().friends) {
            if (f.state === 'online') {
                onlineNow.add(id);
            }
        }
    } catch {
        // stores not ready yet, presence events will fill it in
    }
    watch(statusRules, save, { deep: true });
}

function save() {
    configRepository.setString(KEY, JSON.stringify(statusRules.value));
}

export function addRule() {
    statusRules.value.rules = [...statusRules.value.rules, newRule()];
}

export function removeRule(id) {
    statusRules.value.rules = statusRules.value.rules.filter((r) => r.id !== id);
    clearTimer(id);
    delete ruleState.value[id];
    apply();
}

export function moveRule(id, delta) {
    const list = [...statusRules.value.rules];
    const i = list.findIndex((r) => r.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) {
        return;
    }
    [list[i], list[j]] = [list[j], list[i]];
    statusRules.value.rules = list;
    apply();
}

export function addPerson(list, id, name) {
    if (!id || list.some((p) => p.id === id)) {
        return;
    }
    list.push({ id, name: name || id });
}

export function removePerson(list, id) {
    const i = list.findIndex((p) => p.id === id);
    if (i >= 0) {
        list.splice(i, 1);
    }
}

const has = (people, id) => people.some((p) => p.id === id);
const anyOnline = (people) => people.some((p) => onlineNow.has(p.id));

function clearTimer(id) {
    const t = timers.get(id);
    if (t) {
        clearTimeout(t);
        timers.delete(id);
    }
}

function setPhase(rule, phase) {
    const now = Date.now();
    ruleState.value = {
        ...ruleState.value,
        [rule.id]: {
            phase,
            since: now,
            until: phase === 'waiting' ? now + Math.max(1, Number(rule.waitMin) || 10) * 60000 : 0
        }
    };
}

function startWaiting(rule) {
    setPhase(rule, 'waiting');
    clearTimer(rule.id);
    timers.set(
        rule.id,
        setTimeout(
            () => {
                timers.delete(rule.id);
                if (ruleState.value[rule.id]?.phase === 'waiting') {
                    setPhase(rule, 'fallback');
                    apply();
                }
            },
            Math.max(1, Number(rule.waitMin) || 10) * 60000
        )
    );
}

function endRule(rule) {
    clearTimer(rule.id);
    const next = { ...ruleState.value };
    delete next[rule.id];
    ruleState.value = next;
}

/** What status the rules want right now, or null for "leave it alone". */
function desired() {
    if (!statusRules.value.enabled) {
        return null;
    }
    for (const rule of statusRules.value.rules) {
        const st = ruleState.value[rule.id];
        if (!rule.enabled || !st) {
            continue;
        }
        if (st.phase === 'waiting') {
            return { status: rule.onlineStatus, desc: rule.onlineDesc, rule };
        }
        if (st.phase === 'fallback') {
            return { status: rule.fallbackStatus, desc: rule.fallbackDesc, rule };
        }
        if (st.phase === 'joined') {
            const avoid = statusRules.value.avoid;
            if (avoid.people.length && anyOnline(avoid.people)) {
                return { status: avoid.status, desc: avoid.desc, rule };
            }
            if (rule.joinedStatus === 'keep') {
                return { keep: true, rule };
            }
            return { status: rule.joinedStatus, desc: rule.joinedDesc, rule };
        }
    }
    return null;
}

async function apply() {
    const me = useUserStore().currentUser;
    if (!me?.id) {
        return;
    }
    // you changed your status yourself since the rules last did: stay out of it
    if (lastApplied && me.status !== lastApplied.status) {
        pausedByHand = true;
    }
    const want = desired();
    if (!want) {
        // nothing active any more: put your status back if the last rule asked for that
        if (before && !pausedByHand && lastRuleRestores) {
            const prev = before;
            before = null;
            lastApplied = null;
            await userRequest.saveCurrentUser(prev).catch(() => {});
        } else {
            before = null;
            lastApplied = null;
        }
        pausedByHand = false;
        return;
    }
    lastRuleRestores = want.rule.restore;
    if (pausedByHand || want.keep) {
        return;
    }
    if (!before) {
        before = { status: me.status, statusDescription: me.statusDescription || '' };
    }
    if (me.status === want.status && (!want.desc || me.statusDescription === want.desc)) {
        lastApplied = { status: want.status };
        return;
    }
    const params = { status: want.status };
    if (want.desc) {
        params.statusDescription = want.desc;
    }
    lastApplied = { status: want.status };
    await userRequest.saveCurrentUser(params).catch(() => {});
}

/** A friend came online or went offline (from the friend presence code). */
export async function statusRuleFriendChange(id, isOnline) {
    await initStatusRules();
    if (isOnline) {
        onlineNow.add(id);
    } else {
        onlineNow.delete(id);
    }
    for (const rule of statusRules.value.rules) {
        if (!rule.enabled || !has(rule.people, id)) {
            continue;
        }
        const st = ruleState.value[rule.id];
        if (isOnline && !st) {
            startWaiting(rule);
        } else if (!isOnline && st && !anyOnline(rule.people)) {
            endRule(rule);
        }
    }
    // someone on the keep away list changed, the joined status may need to change too
    await apply();
}

/** Someone entered the instance you are in (from the game log). */
export async function statusRulePlayerJoined(id) {
    if (!id) {
        return;
    }
    await initStatusRules();
    let changed = false;
    for (const rule of statusRules.value.rules) {
        const st = ruleState.value[rule.id];
        if (rule.enabled && st && st.phase !== 'joined' && has(rule.people, id)) {
            clearTimer(rule.id);
            setPhase(rule, 'joined');
            changed = true;
        }
    }
    if (changed) {
        await apply();
    }
}
