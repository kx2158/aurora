import { ref } from 'vue';

import configRepository from './config';

const KEY = 'Aura_unmuteCounter';
export const unmuteEnabled = ref(false);
export const unmuteCount = ref(0);
let timer = null;

function poll() {
    try {
        Promise.resolve(AppApi.GetUnmuteCount()).then((n) => {
            unmuteCount.value = Number(n) || 0;
        });
    } catch {
        // not available
    }
}

function run(on) {
    clearInterval(timer);
    timer = null;
    if (typeof AppApi === 'undefined' || !AppApi.StartUnmuteCounter) {
        return;
    }
    if (on) {
        AppApi.StartUnmuteCounter();
        unmuteCount.value = 0;
        timer = setInterval(poll, 2000);
    } else {
        AppApi.StopUnmuteCounter();
    }
}

export async function initUnmuteCounter() {
    unmuteEnabled.value = await configRepository.getBool(KEY, false);
    run(unmuteEnabled.value);
}

export function setUnmuteEnabled(v) {
    unmuteEnabled.value = !!v;
    configRepository.setBool(KEY, unmuteEnabled.value);
    run(unmuteEnabled.value);
}
