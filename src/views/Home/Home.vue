<template>
    <div class="nx-home x-container">
        <div class="nx-head">
            <div>
                <h1 class="nx-title">{{ greeting }}</h1>
                <p class="nx-sub">{{ t('view.home.online_line', { n: onlineCount }) }}</p>
            </div>
            <div class="nx-clock">{{ clock }}</div>
        </div>

        <div class="nx-tiles">
            <div v-for="tile in tiles" :key="tile.label" class="nx-card nx-tile">
                <span class="nx-meta">{{ tile.label }}</span>
                <span class="nx-num">{{ tile.value }}</span>
            </div>
        </div>

        <div class="nx-grid">
            <div class="nx-card nx-panel">
                <h2 class="nx-h2">{{ t('view.home.recent_feed') }}</h2>
                <RouterLink v-for="(row, i) in recent" :key="i" :to="{ name: 'feed' }" class="nx-row">
                    <span class="nx-avatar">{{ initial(row.displayName) }}</span>
                    <span class="nx-grow">
                        <b>{{ row.displayName }}</b>
                        <span class="nx-meta">{{ describe(row) }}</span>
                    </span>
                    <span class="nx-tag">{{ row.type }}</span>
                </RouterLink>
                <p v-if="!recent.length" class="nx-meta">{{ t('view.home.empty') }}</p>
            </div>

            <div class="nx-side">
                <div class="nx-card nx-panel">
                    <h2 class="nx-h2">{{ t('view.home.friends_online') }}</h2>
                    <button
                        v-for="f in online"
                        :key="f.id"
                        type="button"
                        class="nx-row nx-btn"
                        @click="showUserDialog(f.id)">
                        <span class="nx-avatar">{{ initial(f.name) }}<i class="nx-status"></i></span>
                        <span class="nx-grow">
                            <b>{{ f.name }}</b>
                            <span class="nx-meta">{{ f.ref?.statusDescription || f.ref?.status || '' }}</span>
                        </span>
                    </button>
                    <p v-if="!online.length" class="nx-meta">{{ t('view.home.nobody') }}</p>
                </div>

                <div class="nx-card nx-panel nx-notes">
                    <h2 class="nx-h2">
                        {{ t('view.home.no_notes') }}
                        <span class="nx-count">{{ pendingNotes.length }}</span>
                    </h2>
                    <p class="nx-meta">{{ t('view.home.no_notes_desc') }}</p>
                    <div v-for="f in pendingNotes.slice(0, 4)" :key="f.id" class="nx-row">
                        <span class="nx-avatar">{{ initial(f.name) }}</span>
                        <span class="nx-grow">
                            <b>{{ f.name }}</b>
                            <span class="nx-meta">{{ ago(f.at) }}</span>
                        </span>
                        <button type="button" class="nx-add" @click="addNote(f)">{{ t('view.settings.aurora.note_add') }}</button>
                    </div>
                    <p v-if="!pendingNotes.length" class="nx-meta">{{ t('view.home.all_noted') }}</p>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
    import { useI18n } from 'vue-i18n';

    import { showUserDialog } from '../../coordinators/userCoordinator';
    import { clearPending, initCompanion, pendingNotes } from '../../services/auroraCompanion';
    import { useFeedStore, useFriendStore, useLocationStore } from '../../stores';

    const { t } = useI18n();
    const friendStore = useFriendStore();
    const feedStore = useFeedStore();
    const locationStore = useLocationStore();

    const now = ref(new Date());
    let timer = null;
    onMounted(() => {
        initCompanion();
        timer = setInterval(() => (now.value = new Date()), 30000);
    });
    onBeforeUnmount(() => clearInterval(timer));

    const clock = computed(() => now.value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    const greeting = computed(() => {
        const h = now.value.getHours();
        return t(h < 5 ? 'view.home.night' : h < 12 ? 'view.home.morning' : h < 18 ? 'view.home.afternoon' : 'view.home.evening');
    });

    const online = computed(() => (friendStore.onlineFriends || []).slice(0, 6));
    const onlineCount = computed(() => friendStore.onlineFriendCount ?? online.value.length);
    const recent = computed(() => (feedStore.feedTable?.data || []).slice(0, 7));

    const tiles = computed(() => [
        { label: t('view.home.tile_online'), value: onlineCount.value },
        { label: t('view.home.tile_here'), value: locationStore.lastLocation?.playerList?.size ?? 0 },
        { label: t('view.home.tile_notes'), value: pendingNotes.value.length },
        { label: t('view.home.tile_world'), value: locationStore.lastLocation?.name || '-' }
    ]);

    function initial(name) {
        return String(name || '?').trim().charAt(0).toUpperCase();
    }
    function describe(row) {
        if (row.type === 'GPS') return row.worldName || '';
        if (row.type === 'Status') return row.statusDescription || row.status || '';
        if (row.type === 'Avatar') return row.avatarName || '';
        if (row.type === 'Bio') return row.bio ? String(row.bio).slice(0, 60) : '';
        return row.worldName || '';
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
    .nx-home {
        display: flex;
        flex-direction: column;
        gap: 18px;
        padding: 22px 26px 34px;
        overflow-y: auto;
    }
    .nx-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
    }
    .nx-title {
        font-size: 2rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--foreground);
        text-shadow: 3px 0 var(--primary), -3px 0 color-mix(in oklch, var(--foreground) 70%, transparent);
    }
    .nx-sub,
    .nx-meta {
        font-family: 'Share Tech Mono', ui-monospace, monospace;
        font-size: 12px;
        color: var(--muted-foreground);
    }
    .nx-clock {
        font-family: 'Share Tech Mono', ui-monospace, monospace;
        font-size: 1.6rem;
        letter-spacing: 0.12em;
        color: var(--primary);
    }
    .nx-tiles {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
    }
    .nx-card {
        background: var(--card);
        border: 1px solid var(--border);
        clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px));
    }
    .nx-tile {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 8px;
        padding: 16px 18px;
        min-height: 92px;
    }
    .nx-num {
        font-size: 2rem;
        font-weight: 800;
        color: var(--primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .nx-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
        gap: 14px;
        align-items: start;
    }
    .nx-side {
        display: flex;
        flex-direction: column;
        gap: 14px;
    }
    .nx-panel {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 18px 20px;
    }
    .nx-notes {
        background: linear-gradient(160deg, color-mix(in oklch, var(--primary) 14%, transparent), var(--card) 70%);
    }
    .nx-h2 {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 0.95rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: var(--primary);
        margin-bottom: 4px;
    }
    .nx-count {
        min-width: 22px;
        padding: 0 7px;
        font-size: 12px;
        text-align: center;
        background: var(--primary);
        color: var(--primary-foreground);
    }
    .nx-row {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 46px;
        padding: 0 8px;
        border-left: 3px solid transparent;
        text-align: left;
        color: var(--foreground);
        transition: background-color 0.12s ease;
    }
    .nx-row:hover {
        background: color-mix(in oklch, var(--primary) 12%, transparent);
        border-left-color: var(--primary);
    }
    .nx-btn {
        width: 100%;
    }
    .nx-grow {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
    }
    .nx-grow b {
        font-weight: 600;
        font-size: 14px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .nx-avatar {
        position: relative;
        width: 34px;
        height: 34px;
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        color: var(--primary-foreground);
        background: linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 40%, white));
    }
    .nx-status {
        position: absolute;
        right: -3px;
        bottom: -3px;
        width: 10px;
        height: 10px;
        background: var(--foreground);
        border: 2px solid var(--card);
        border-radius: 50%;
    }
    .nx-tag {
        padding: 2px 10px;
        font-family: 'Share Tech Mono', ui-monospace, monospace;
        font-size: 11px;
        color: var(--primary);
        border: 1px solid var(--primary);
    }
    .nx-add {
        height: 28px;
        padding: 0 12px;
        font-size: 12px;
        font-weight: 700;
        color: var(--primary);
        border: 1px solid var(--primary);
    }
    .nx-add:hover {
        background: var(--primary);
        color: var(--primary-foreground);
    }
</style>
