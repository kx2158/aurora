<template>
    <div
        v-if="!ready || locked"
        class="fixed inset-0 z-[10000] flex items-center justify-center bg-background"
        role="dialog"
        aria-modal="true">
        <form v-if="ready" class="flex w-72 flex-col items-center gap-4" @submit.prevent="submit">
            <AuroraMascot :size="96" :reactive="false" />
            <span class="text-lg font-semibold text-foreground">{{ t('view.settings.aurora.lock.title') }}</span>
            <Input
                ref="pinInput"
                v-model="pin"
                type="password"
                inputmode="numeric"
                autocomplete="off"
                maxlength="12"
                class="text-center tracking-widest"
                :disabled="waiting"
                :placeholder="t('view.settings.aurora.lock.placeholder')" />
            <span v-if="message" class="text-center text-xs text-destructive">{{ message }}</span>
            <Button type="submit" class="w-full" :disabled="waiting || pin.length < 4">
                {{ t('view.settings.aurora.lock.unlock') }}
            </Button>
        </form>
    </div>
</template>

<script setup>
    import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';

    import { useAuroraSettingsStore } from '@/stores';
    import AuroraMascot from './AuroraMascot.vue';

    const { t } = useI18n();
    const store = useAuroraSettingsStore();
    const { ready, locked, appLockEnabled, autoLockMinutes, lockedUntil } = storeToRefs(store);

    const pin = ref('');
    const message = ref('');
    const waiting = ref(false);
    const pinInput = ref(null);
    let timer = null;
    let idleTimer = null;

    function tickWait() {
        const left = Math.ceil((lockedUntil.value - Date.now()) / 1000);
        waiting.value = left > 0;
        message.value = left > 0 ? t('view.settings.aurora.lock.wait', { seconds: left }) : '';
        if (left <= 0 && timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    function startWaitTimer() {
        tickWait();
        if (waiting.value && !timer) {
            timer = setInterval(tickWait, 500);
        }
    }

    async function submit() {
        const result = await store.tryUnlock(pin.value);
        pin.value = '';
        if (result === 'ok') {
            message.value = '';
            return;
        }
        if (result === 'wait') {
            startWaitTimer();
        } else {
            message.value = t('view.settings.aurora.lock.wrong');
        }
    }

    // auto lock after being idle
    function resetIdle() {
        clearTimeout(idleTimer);
        if (!appLockEnabled.value || locked.value || autoLockMinutes.value <= 0) {
            return;
        }
        idleTimer = setTimeout(() => store.lockNow(), autoLockMinutes.value * 60 * 1000);
    }
    const events = ['pointerdown', 'keydown', 'wheel'];

    watch([appLockEnabled, locked, autoLockMinutes], resetIdle);
    watch(locked, async (value) => {
        if (value) {
            startWaitTimer();
            await nextTick();
            pinInput.value?.$el?.focus?.();
        }
    });
    watch(ready, startWaitTimer);

    onMounted(() => {
        events.forEach((e) => window.addEventListener(e, resetIdle, { passive: true }));
        resetIdle();
    });
    onBeforeUnmount(() => {
        events.forEach((e) => window.removeEventListener(e, resetIdle));
        clearTimeout(idleTimer);
        clearInterval(timer);
    });
</script>
