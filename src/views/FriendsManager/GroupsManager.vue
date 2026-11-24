<template>
    <section class="a-card fa-wrap">
        <div class="fa-top">
            <input v-model="q" class="fa-search" :placeholder="t('view.friends_manager.groups.search')" />
            <div class="a-seg">
                <button v-for="f in filters" :key="f" type="button" :class="{ on: filter === f }" @click="filter = f">
                    {{ t(`view.friends_manager.review.f_${f}`) }}
                    <small>{{ counts[f] }}</small>
                </button>
            </div>
        </div>
        <p class="a-note">{{ t('view.friends_manager.groups.note') }}</p>
        <div v-if="!shown.length" class="a-empty">{{ t('view.friends_manager.groups.empty') }}</div>
        <div v-for="g in shown" :key="g.id" class="a-row fa-row">
            <img v-if="g.iconUrl" :src="g.iconUrl" class="fa-photo" alt="" loading="lazy" />
            <button type="button" class="fa-name gm-open" @click="showGroupDialog(g.id)">{{ g.name }}</button>
            <span class="a-pill">{{ g.memberCount ?? '?' }}</span>
            <DecisionNote kind="group" :id="g.id" />
            <button type="button" class="a-btn" @click="leaveGroupPrompt(g.id)">
                {{ t('view.friends_manager.groups.leave') }}
            </button>
        </div>
    </section>
</template>

<script setup>
    import { computed, ref } from 'vue';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';

    import DecisionNote from '../../components/DecisionNote.vue';
    import { leaveGroupPrompt, showGroupDialog } from '../../coordinators/groupCoordinator';
    import { decisions } from '../../services/decisionNotes';
    import { useGroupStore } from '../../stores';

    const { t } = useI18n();
    const { currentUserGroups } = storeToRefs(useGroupStore());
    const q = ref('');
    const filter = ref('all');
    const filters = ['all', 'keep', 'cut', 'none'];

    const groups = computed(() =>
        [...currentUserGroups.value.values()]
            .map((g) => ({ id: g.id, name: g.name || g.id, iconUrl: g.iconUrl, memberCount: g.memberCount }))
            .sort((a, b) => a.name.localeCompare(b.name))
    );
    const markOf = (id) => decisions.value.group[id]?.m || '';
    const counts = computed(() => {
        const c = { all: groups.value.length, keep: 0, cut: 0, none: 0 };
        for (const g of groups.value) c[markOf(g.id) || 'none']++;
        return c;
    });
    const shown = computed(() => {
        const needle = q.value.trim().toLowerCase();
        return groups.value.filter((g) => {
            if (filter.value !== 'all' && (markOf(g.id) || 'none') !== filter.value) return false;
            return !needle || g.name.toLowerCase().includes(needle);
        });
    });
</script>

<style>
    .gm-open {
        background: none;
        border: 0;
        padding: 0;
        text-align: left;
        color: inherit;
        cursor: pointer;
    }
</style>
