<template>
    <div class="au-page">
        <section class="au-main">
            <div class="aura-label">今 · {{ today }}</div>
            <h1 class="au-big">{{ t('aura.now.here', { n: here }) }}</h1>
            <p class="au-sub">{{ t('aura.now.in', { n: instances.length }) }}</p>
            <div class="au-counts">
                <div><b>{{ away }}</b> {{ t('aura.now.away') }}</div>
                <div><b>{{ offline }}</b> {{ t('aura.now.offline') }}</div>
            </div>

            <div class="aura-label au-gap">{{ t('aura.now.instances') }}</div>
            <div v-if="!instances.length" class="au-empty">{{ t('aura.now.none') }}</div>
            <div v-for="(i, n) in instances" :key="i.tag" class="au-item">
                <div class="au-num">{{ String(n + 1).padStart(2, '0') }}</div>
                <div class="au-grow">
                    <div class="au-title">{{ names[i.tag] || t('aura.now.unknown_world') }}</div>
                    <div class="au-meta">{{ i.access }}</div>
                </div>
                <div class="au-people">
                    <span v-for="p in i.people.slice(0, 4)" :key="p.id">{{ p.name }}</span>
                    <span v-if="i.people.length > 4" class="au-meta">+{{ i.people.length - 4 }}</span>
                </div>
                <button type="button" class="au-link" @click="launch.showLaunchDialog(i.tag)">
                    {{ t('aura.join') }}
                </button>
            </div>
        </section>
        <aside class="au-side" aria-hidden="true"><span>気配</span></aside>
    </div>
</template>

<script setup>
    import { computed, reactive, watch } from 'vue';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';

    import { getWorldName } from '../../shared/utils/world';
    import { isRealInstance } from '../../shared/utils/instance';
    import { useFriendStore, useLaunchStore } from '../../stores';

    const { t } = useI18n();
    const launch = useLaunchStore();
    const { onlineFriends, vipFriends, activeFriends, offlineFriends } = storeToRefs(useFriendStore());

    const today = computed(() =>
        new Date().toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', weekday: 'short' }).toUpperCase()
    );

    const inGame = computed(() => [...vipFriends.value, ...onlineFriends.value]);
    const here = computed(() => inGame.value.length);
    const away = computed(() => activeFriends.value.length);
    const offline = computed(() => offlineFriends.value.length);

    const instances = computed(() => {
        const by = new Map();
        for (const f of inGame.value) {
            const L = f.ref?.$location;
            const tag = L?.tag;
            if (!tag || !isRealInstance(tag)) continue;
            if (!by.has(tag)) by.set(tag, { tag, access: L.accessTypeName || '', people: [] });
            by.get(tag).people.push({ id: f.id, name: f.ref.displayName || f.name || f.id });
        }
        return [...by.values()].sort((a, b) => b.people.length - a.people.length).slice(0, 12);
    });

    // world names come from the API, one lookup per world, never twice
    const names = reactive({});
    const asked = new Set();
    watch(
        instances,
        (list) => {
            for (const i of list) {
                if (asked.has(i.tag)) continue;
                asked.add(i.tag);
                getWorldName(i.tag).then((n) => {
                    if (n) names[i.tag] = n;
                });
            }
        },
        { immediate: true }
    );
</script>
