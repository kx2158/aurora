<template>
    <section class="a-card fa-wrap">
        <div class="fa-top">
            <input v-model="q" class="fa-search" :placeholder="t('view.friends_manager.alerts.search')" />
            <button type="button" class="a-chip" :class="{ on: onlyMarked }" @click="onlyMarked = !onlyMarked">
                {{ t('view.friends_manager.alerts.only_marked') }} <small>{{ markedCount }}</small>
            </button>
        </div>
        <p class="a-note">{{ t('view.friends_manager.alerts.note') }}</p>
        <div v-if="!shown.length" class="a-empty">{{ t('view.friends_manager.alerts.empty') }}</div>
        <div v-for="r in shown" :key="r.id" class="a-row fa-row">
            <img v-if="r.photo" :src="r.photo" class="fa-photo" alt="" loading="lazy" />
            <span class="fa-name">{{ r.name }}</span>
            <FriendAlertToggles :user-id="r.id" />
        </div>
        <div v-if="rest > 0" class="a-note">{{ t('view.friends_manager.alerts.more', { n: rest }) }}</div>
    </section>
</template>

<script setup>
    import { computed, ref } from 'vue';
    import { useI18n } from 'vue-i18n';

    import FriendAlertToggles from '../../components/FriendAlertToggles.vue';
    import { alertMarks } from '../../services/friendAlerts';

    const props = defineProps({ rows: { type: Array, required: true } });
    const { t } = useI18n();
    const q = ref('');
    const onlyMarked = ref(false);
    const LIMIT = 150;

    const markedCount = computed(() => Object.keys(alertMarks.value).length);
    const matched = computed(() => {
        const needle = q.value.trim().toLowerCase();
        return props.rows.filter((r) => {
            if (onlyMarked.value && !(alertMarks.value[r.id]?.length > 0)) return false;
            return !needle || String(r.name).toLowerCase().includes(needle);
        });
    });
    const shown = computed(() => matched.value.slice(0, LIMIT));
    const rest = computed(() => matched.value.length - shown.value.length);
</script>

<style>
    .fa-top {
        display: flex;
        gap: 12px;
        align-items: center;
        margin-bottom: 8px;
    }
    .fa-search {
        flex: 1;
        padding: 8px 10px;
        background: var(--aura-tint, transparent);
        border: 0;
        outline: none;
        color: inherit;
    }
    .fa-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 0;
    }
    .fa-photo {
        width: 28px;
        height: 28px;
        object-fit: cover;
    }
    .fa-name {
        width: 200px;
        flex: none;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
