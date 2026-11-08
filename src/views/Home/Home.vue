<template>
    <div class="a-page">
        <div class="a-page-inner">
            <header class="a-head">
                <div>
                    <h1 class="a-title">{{ greeting }}</h1>
                    <p class="a-sub">{{ t('view.home.online_line', { n: onlineCount }) }}</p>
                </div>
                <div class="home-clock">{{ clock }}</div>
            </header>

            <div class="a-grid a-grid-4">
                <div v-for="tile in tiles" :key="tile.label" class="a-card a-stat">
                    <span class="a-stat-label">{{ tile.label }}</span>
                    <span class="a-stat-value">{{ tile.value }}</span>
                    <span v-if="tile.sub" class="a-stat-sub">{{ tile.sub }}</span>
                </div>
            </div>

            <div class="home-grid">
                <div class="flex min-w-0 flex-col gap-4">
                    <section class="a-card">
                        <h2 class="a-h2">
                            {{ t('view.home.week') }}
                            <router-link :to="{ name: 'insights' }" class="a-h2-aside home-link">
                                {{ t('view.home.more_insights') }} <AuroraIcon name="arrow" :size="13" />
                            </router-link>
                        </h2>
                        <div class="home-bars">
                            <div v-for="b in stats.bars" :key="b.label" class="home-bar" :title="b.ms ? fmtDuration(b.ms) : ''">
                                <span class="home-bar-track"><i :style="{ height: barHeight(b.ms) + '%' }"></i></span>
                                <span class="home-bar-label">{{ b.label }}</span>
                            </div>
                        </div>
                    </section>

                    <section class="a-card">
                        <h2 class="a-h2">
                            {{ t('view.home.worlds_visited') }}
                            <span class="a-pill">{{ stats.worldCount }}</span>
                            <span class="a-h2-aside a-seg">
                                <button type="button" :class="{ on: worldTab === 'recent' }" @click="worldTab = 'recent'">
                                    {{ t('view.home.tab_recent') }}
                                </button>
                                <button type="button" :class="{ on: worldTab === 'top' }" @click="worldTab = 'top'">
                                    {{ t('view.home.tab_top') }}
                                </button>
                            </span>
                        </h2>
                        <button
                            v-for="w in worldTab === 'recent' ? stats.recent : stats.top"
                            :key="w.id"
                            type="button"
                            class="a-row"
                            @click="showWorldDialog(w.id)">
                            <span class="a-initial">{{ initial(w.name) }}</span>
                            <span class="a-row-main">
                                <span class="a-row-title">{{ w.name }}</span>
                                <span class="a-row-meta">
                                    {{ t('view.home.visits', { n: w.visits }) }} - {{ fmtDuration(w.time) }}
                                </span>
                            </span>
                            <span class="a-pill">{{ agoDate(w.last) }}</span>
                        </button>
                        <p v-if="!stats.worldCount" class="a-empty">{{ t('view.home.empty') }}</p>
                    </section>
                </div>

                <div class="flex min-w-0 flex-col gap-4">
                    <section class="a-card">
                        <h2 class="a-h2">
                            {{ t('view.home.friends_online') }}
                            <span class="a-pill">{{ onlineCount }}</span>
                        </h2>
                        <button v-for="f in online" :key="f.id" type="button" class="a-row" @click="showUserDialog(f.id)">
                            <span class="a-initial online">{{ initial(f.name) }}</span>
                            <span class="a-row-main">
                                <span class="a-row-title">{{ f.name }}</span>
                                <span class="a-row-meta">{{ f.ref?.statusDescription || f.ref?.status || '' }}</span>
                            </span>
                        </button>
                        <p v-if="!online.length" class="a-empty">{{ t('view.home.nobody') }}</p>
                    </section>

                    <section v-if="stats.met.length" class="a-card">
                        <h2 class="a-h2">
                            {{ t('view.home.met_today') }}
                            <span class="a-pill">{{ stats.met.length }}</span>
                        </h2>
                        <button v-for="p in stats.met" :key="p.id" type="button" class="a-row" @click="showUserDialog(p.id)">
                            <span class="a-initial">{{ initial(p.name) }}</span>
                            <span class="a-row-main">
                                <span class="a-row-title">{{ p.name }}</span>
                                <span class="a-row-meta">{{ t('view.home.met_in', { n: p.n }) }}</span>
                            </span>
                        </button>
                    </section>

                    <section v-if="pendingNotes.length" class="a-card">
                        <h2 class="a-h2">
                            {{ t('view.home.no_notes') }}
                            <span class="a-pill">{{ pendingNotes.length }}</span>
                        </h2>
                        <div v-for="f in pendingNotes.slice(0, 4)" :key="f.id" class="a-row">
                            <span class="a-initial">{{ initial(f.name) }}</span>
                            <span class="a-row-main">
                                <span class="a-row-title">{{ f.name }}</span>
                                <span class="a-row-meta">{{ ago(f.at) }}</span>
                            </span>
                            <button type="button" class="a-btn" @click="addNote(f)">{{ t('view.home.add_note') }}</button>
                        </div>
                    </section>

                    <section v-if="stats.memories.length" class="a-card">
                        <h2 class="a-h2">{{ t('view.home.on_this_day') }}</h2>
                        <button v-for="m in stats.memories" :key="m.at" type="button" class="a-row" @click="showWorldDialog(m.id)">
                            <span class="a-initial">{{ initial(m.name) }}</span>
                            <span class="a-row-main">
                                <span class="a-row-title">{{ m.name }}</span>
                                <span class="a-row-meta">{{ m.at.slice(0, 4) }} - {{ fmtDuration(m.time) }}</span>
                            </span>
                        </button>
                    </section>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
    import { useI18n } from 'vue-i18n';

    import { showUserDialog } from '../../coordinators/userCoordinator';
    import { showWorldDialog } from '../../coordinators/worldCoordinator';
    import { fmtDuration, loadStats } from '../../services/auroraStats';
    import { clearPending, initPendingNotes, pendingNotes } from '../../services/auroraNotes';
    import AuroraIcon from '../../components/AuroraIcon.vue';
    import { useFriendStore, useLocationStore } from '../../stores';

    const { t } = useI18n();
    const friendStore = useFriendStore();
    const locationStore = useLocationStore();

    const now = ref(new Date());
    let timer = null;
    const stats = ref({ total: 0, today: 0, week: 0, longest: 0, streak: 0, sessions: 0, worldCount: 0, met: [], memories: [], recent: [], top: [], bars: [] });
    const worldTab = ref('recent');
    async function refreshStats() {
        try {
            stats.value = await loadStats();
        } catch (e) {
            console.error('Aurora stats', e);
        }
    }
    onMounted(() => {
        initPendingNotes();
        refreshStats();
        timer = setInterval(() => {
            now.value = new Date();
            if (now.value.getSeconds() < 30) refreshStats();
        }, 30000);
    });
    onBeforeUnmount(() => clearInterval(timer));
    watch(() => locationStore.lastLocation?.location, refreshStats);

    const clock = computed(() => now.value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    const greeting = computed(() => {
        const h = now.value.getHours();
        return t(h < 5 ? 'view.home.night' : h < 12 ? 'view.home.morning' : h < 18 ? 'view.home.afternoon' : 'view.home.evening');
    });

    const online = computed(() => (friendStore.onlineFriends || []).slice(0, 6));
    const onlineCount = computed(() => friendStore.onlineFriendCount ?? online.value.length);
    const maxBar = computed(() => Math.max(1, ...stats.value.bars.map((b) => b.ms)));
    const barHeight = (ms) => (ms ? Math.max(6, Math.round((ms / maxBar.value) * 100)) : 0);

    const tiles = computed(() => [
        {
            label: t('view.home.tile_time'),
            value: fmtDuration(stats.value.total),
            sub: t('view.home.tile_time_sub', { n: stats.value.sessions })
        },
        {
            label: t('view.home.tile_today'),
            value: fmtDuration(stats.value.today),
            sub: t('view.home.tile_today_sub', { w: fmtDuration(stats.value.week), l: fmtDuration(stats.value.longest) })
        },
        {
            label: t('view.home.tile_worlds'),
            value: stats.value.worldCount,
            sub: t('view.home.tile_streak', { n: stats.value.streak })
        },
        { label: t('view.home.tile_online'), value: onlineCount.value, sub: locationStore.lastLocation?.name || '' }
    ]);

    function initial(name) {
        return String(name || '?').trim().charAt(0).toUpperCase();
    }
    function agoDate(iso) {
        const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
        return d <= 0 ? t('view.home.today') : d === 1 ? t('view.home.yesterday') : t('view.home.day_short', { n: d });
    }
    function ago(ms) {
        const m = Math.max(1, Math.round((Date.now() - ms) / 60000));
        if (m < 60) return t('view.home.min_ago', { n: m });
        const h = Math.round(m / 60);
        return h < 48 ? t('view.home.hour_ago', { n: h }) : t('view.home.day_ago', { n: Math.round(h / 24) });
    }
    function addNote(f) {
        showUserDialog(f.id);
        clearPending(f.id);
    }
</script>

<style scoped>
    .home-clock {
        font-size: 1.55rem;
        font-weight: 300;
        letter-spacing: 0.02em;
        color: var(--a-muted);
        font-variant-numeric: tabular-nums;
    }
    .home-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
        gap: 16px;
        align-items: start;
    }
    @media (max-width: 960px) {
        .home-grid {
            grid-template-columns: minmax(0, 1fr);
        }
    }
    .home-link {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--a-muted);
    }
    .home-link:hover {
        color: var(--foreground);
    }
    .home-bars {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 12px;
        height: 132px;
    }
    .home-bar {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }
    .home-bar-track {
        position: relative;
        flex: 1;
        width: 100%;
        max-width: 28px;
        border-radius: 8px;
        background: color-mix(in oklch, var(--foreground) 6%, transparent);
        overflow: hidden;
    }
    .home-bar-track i {
        position: absolute;
        inset: auto 0 0 0;
        border-radius: 8px;
        background: linear-gradient(to top, color-mix(in oklch, var(--a-accent) 45%, transparent), var(--a-accent));
        transition: height 0.4s ease;
    }
    .home-bar-label {
        font-size: 0.72rem;
        color: var(--a-muted);
    }
</style>
