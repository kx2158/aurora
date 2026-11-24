<template>
    <div class="au-page">
        <section class="au-left">
            <div class="aura-label">{{ today }}</div>
            <h1 class="au-big">{{ t('aura.now.here', { n: here }) }}</h1>
            <p class="au-sub">{{ t('aura.now.in', { n: instances.length }) }}</p>
            <div class="au-counts">
                <div><b>{{ away }}</b>&nbsp; {{ t('aura.now.away') }}</div>
                <div><b>{{ offline }}</b>&nbsp; {{ t('aura.now.offline') }}</div>
            </div>

            <div class="aura-label au-gap">{{ t('aura.now.music') }}</div>
            <div v-if="!events.length" class="au-empty">{{ loadingEvents ? t('aura.now.loading') : t('aura.now.no_music') }}</div>
            <div v-for="e in events" :key="e.id" class="au-item">
                <div class="au-num">{{ e.when }}</div>
                <div class="au-grow">
                    <div class="au-title">{{ e.title }}</div>
                    <div class="au-meta">{{ e.live ? t('aura.now.live') : e.day }}</div>
                </div>
            </div>
        </section>

    </div>
</template>

<script setup>
    import { computed, onMounted, ref } from 'vue';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';

    import { groupRequest } from '../../api';
    import { upcomingMusic } from '../../services/musicEvents';
    import { isRealInstance } from '../../shared/utils/instance';
    import { useFriendStore } from '../../stores';

    const { t } = useI18n();
    const { onlineFriends, vipFriends, activeFriends, offlineFriends } = storeToRefs(useFriendStore());

    const today = computed(() =>
        new Date().toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', weekday: 'short' }).toUpperCase()
    );
    const inGame = computed(() => [...vipFriends.value, ...onlineFriends.value]);
    const here = computed(() => inGame.value.length);
    const away = computed(() => activeFriends.value.length);
    const offline = computed(() => offlineFriends.value.length);
    const instances = computed(() => {
        const tags = new Set();
        for (const f of inGame.value) {
            const tag = f.ref?.$location?.tag;
            if (tag && isRealInstance(tag)) tags.add(tag);
        }
        return [...tags];
    });

    // music events from VRChat's featured calendar: what is on now and what is coming
    const calendar = ref([]);
    const loadingEvents = ref(true);
    const events = computed(() => upcomingMusic(calendar.value, Date.now()));
    onMounted(async () => {
        try {
            const args = await groupRequest.getFeaturedGroupCalendars({
                n: 100,
                offset: 0,
                date: new Date().toISOString().replace(/\.\d+Z$/, 'Z')
            });
            calendar.value = args?.json?.results || args?.results || [];
        } catch (err) {
            console.error('music events', err);
        } finally {
            loadingEvents.value = false;
        }
    });
</script>
