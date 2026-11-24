<template>
    <div class="fa-toggles">
        <button
            v-for="k in ALERT_KINDS"
            :key="k"
            type="button"
            class="a-chip"
            :class="{ on: marks.includes(k) }"
            :aria-pressed="marks.includes(k)"
            @click="setAlert(userId, k, !marks.includes(k))">
            {{ t(`view.friends_manager.alerts.kind.${k}`) }}
        </button>
        <button type="button" class="a-chip fa-all" @click="setAllAlerts(userId, marks.length < ALERT_KINDS.length)">
            {{ marks.length < ALERT_KINDS.length ? t('view.friends_manager.alerts.all_on') : t('view.friends_manager.alerts.all_off') }}
        </button>
    </div>
</template>

<script setup>
    import { computed } from 'vue';
    import { useI18n } from 'vue-i18n';

    import { ALERT_KINDS, alertMarks, setAlert, setAllAlerts } from '../services/friendAlerts';

    const props = defineProps({ userId: { type: String, required: true } });
    const { t } = useI18n();
    const marks = computed(() => alertMarks.value[props.userId] || []);
</script>

<style>
    .fa-toggles {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
    }
    .fa-toggles .a-chip.on {
        background: var(--aura-ink, currentColor);
        color: var(--aura-paper, #fff);
    }
    .fa-all {
        opacity: 0.7;
    }
</style>
