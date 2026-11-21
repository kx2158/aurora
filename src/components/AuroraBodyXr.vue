<template>
    <section class="a-card">
        <div class="flex items-center gap-3">
            <h2 class="a-h2 flex-1">{{ t('view.body_xr.title') }}</h2>
            <span class="body-pill" :class="badge.tone">{{ badge.text }}</span>
        </div>
        <p class="a-note mb-4">{{ t('view.body_xr.desc') }}</p>
        <label class="body-switch">
            <input type="checkbox" :checked="xrEnabled" @change="(e) => setXrEnabled(e.target.checked)" />
            <span class="body-track"><span class="body-knob"></span></span>
            <span class="flex-1">{{ t('view.body_xr.enable') }}</span>
        </label>
        <p v-if="xrEnabled && xrStatus && xrStatus.note" class="a-note mt-3">{{ xrStatus.note }}</p>
    </section>
</template>

<script setup>
    import { computed, onBeforeUnmount, onMounted } from 'vue';
    import { useI18n } from 'vue-i18n';

    import { loadXrEnabled, setXrEnabled, watchXrStatus, xrEnabled, xrStatus } from '../services/auroraBodyXr';

    const { t } = useI18n();
    let stop = null;
    onMounted(async () => {
        await loadXrEnabled();
        stop = watchXrStatus();
    });
    onBeforeUnmount(() => stop && stop());

    // 0 starting, 1 no runtime or headset, 2 no body tracking, 3 session failed, 4 no data yet, 5 tracking
    const badge = computed(() => {
        if (!xrEnabled.value) return { tone: '', text: t('view.body_xr.state_off') };
        const s = xrStatus.value;
        if (!s || !s.installed) return { tone: 'bad', text: t('view.body_xr.state_missing') };
        if (!s.running) return { tone: 'warn', text: t('view.body_xr.state_starting') };
        if (s.state === 5) return { tone: 'ok', text: t('view.body_xr.state_tracking') };
        if (s.state === 4 || s.state === 0) return { tone: 'warn', text: t('view.body_xr.state_waiting') };
        return { tone: 'bad', text: t('view.body_xr.state_failed') };
    });
</script>
