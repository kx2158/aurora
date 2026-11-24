<template>
    <section class="a-card fa-wrap">
        <div class="fa-top">
            <input v-model="q" class="fa-search" :placeholder="t('view.friends_manager.alerts.search')" />
            <div class="a-seg">
                <button v-for="f in filters" :key="f" type="button" :class="{ on: filter === f }" @click="filter = f">
                    {{ t(`view.friends_manager.review.f_${f}`) }}
                    <small>{{ counts[f] }}</small>
                </button>
            </div>
            <button type="button" class="a-btn" :disabled="busy || !cutIds.length" @click="$emit('unfriend', cutIds)">
                {{ t('view.friends_manager.review.unfriend_cut', { n: cutIds.length }) }}
            </button>
        </div>
        <p class="a-note">{{ t('view.friends_manager.review.note_text') }}</p>
        <div v-if="!shown.length" class="a-empty">{{ t('view.friends_manager.alerts.empty') }}</div>
        <div v-for="r in shown" :key="r.id" class="a-row fa-row">
            <img v-if="r.photo" :src="r.photo" class="fa-photo" alt="" loading="lazy" />
            <span class="fa-name">{{ r.name }}</span>
            <DecisionNote kind="friend" :id="r.id" />
        </div>
        <div v-if="rest > 0" class="a-note">{{ t('view.friends_manager.alerts.more', { n: rest }) }}</div>
    </section>
</template>

<script setup>
    import { computed, ref } from 'vue';
    import { useI18n } from 'vue-i18n';

    import DecisionNote from '../../components/DecisionNote.vue';
    import { decisions } from '../../services/decisionNotes';

    const props = defineProps({ rows: { type: Array, required: true }, busy: Boolean });
    defineEmits(['unfriend']);
    const { t } = useI18n();
    const q = ref('');
    const filter = ref('all');
    const filters = ['all', 'keep', 'cut', 'none'];
    const LIMIT = 150;

    const markOf = (id) => decisions.value.friend[id]?.m || '';
    const counts = computed(() => {
        const c = { all: props.rows.length, keep: 0, cut: 0, none: 0 };
        for (const r of props.rows) c[markOf(r.id) || 'none']++;
        return c;
    });
    // locked friends are filtered out again by the manager's confirm step
    const cutIds = computed(() => props.rows.filter((r) => markOf(r.id) === 'cut').map((r) => r.id));
    const matched = computed(() => {
        const needle = q.value.trim().toLowerCase();
        return props.rows.filter((r) => {
            if (filter.value !== 'all' && (markOf(r.id) || 'none') !== filter.value) return false;
            return !needle || String(r.name).toLowerCase().includes(needle);
        });
    });
    const shown = computed(() => matched.value.slice(0, LIMIT));
    const rest = computed(() => matched.value.length - shown.value.length);
</script>
