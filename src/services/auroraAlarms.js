/**
 * Neon alarms: set a time, she makes a noise and says it out loud, on the desktop and on the VR wrist.
 */
import { ref, watch } from 'vue';

import configRepository from './config';
import { pushNews } from './auroraNews';

const KEY = 'Neon_alarms';
export const alarms = ref([]);
let loaded = false;
let timer = null;
let lastMinute = '';

export async function initAlarms() {
    if (loaded) {
        return;
    }
    loaded = true;
    try {
        const list = JSON.parse(await configRepository.getString(KEY, '[]'));
        alarms.value = Array.isArray(list) ? list.slice(0, 20) : [];
    } catch {
        alarms.value = [];
    }
    watch(alarms, () => configRepository.setString(KEY, JSON.stringify(alarms.value)), { deep: true });
    timer = setInterval(check, 10000);
}

export function addAlarm() {
    alarms.value = [...alarms.value, { id: Date.now(), time: '09:00', label: '', enabled: true, daily: true }].slice(0, 20);
}
export function removeAlarm(id) {
    alarms.value = alarms.value.filter((a) => a.id !== id);
}

/** A short rising alarm made from beeps. No audio files needed. */
export function ringAlarm() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        let t = ctx.currentTime;
        for (let i = 0; i < 6; i++) {
            for (const f of [880, 1175]) {
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.type = 'square';
                o.frequency.value = f;
                g.gain.setValueAtTime(0.0001, t);
                g.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
                g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
                o.connect(g).connect(ctx.destination);
                o.start(t);
                o.stop(t + 0.16);
                t += 0.16;
            }
            t += 0.12;
        }
        setTimeout(() => ctx.close(), 4500);
    } catch (e) {
        console.error(e);
    }
}

function check() {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (hhmm === lastMinute) {
        return;
    }
    lastMinute = hhmm;
    for (const a of alarms.value) {
        if (a.enabled && a.time === hhmm) {
            fire(a);
        }
    }
}

function fire(a) {
    ringAlarm();
    pushNews({ kind: 'alarm', title: a.time, text: a.label || 'Alarm' });
    try {
        AppApi.ExecuteVrOverlayFunction('neonAlarm', JSON.stringify({ label: a.label || 'Alarm', time: a.time }));
    } catch (e) {
        console.error(e);
    }
    if (!a.daily) {
        a.enabled = false;
    }
}

export function stopAlarms() {
    clearInterval(timer);
}
