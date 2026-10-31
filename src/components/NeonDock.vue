<template>
    <div v-if="dockVisible" class="nx-dock" :class="{ collapsed }">
        <button type="button" class="nx-dock-head" @click="collapsed = !collapsed">
            <span>NEON // {{ t('view.dock.title') }}</span>
            <span>{{ collapsed ? '+' : '-' }}</span>
        </button>
        <template v-if="!collapsed">
            <div class="nx-sec">
                <span class="nx-lab">{{ t('view.dock.instance') }}</span>
                <b class="nx-world">{{ info.world }}</b>
                <span class="nx-line">{{ info.line }}</span>
            </div>
            <div class="nx-sec">
                <span class="nx-lab">{{ t('view.dock.news') }}</span>
                <p v-if="!newsItems.length" class="nx-line">{{ t('view.dock.no_news') }}</p>
                <div v-for="n in newsItems.slice(0, 4)" :key="n.id" class="nx-news">
                    <span class="nx-kind">{{ n.kind }}</span>
                    <span class="nx-newstext">{{ n.title || n.text }}</span>
                </div>
            </div>
        </template>
    </div>
</template>

<script setup>
    import { computed, ref, watch } from 'vue';
    import { useI18n } from 'vue-i18n';

    import { companionEnabled, companionHome } from '../services/auroraCompanion';
    import { newsItems, pushNews } from '../services/auroraNews';
    import { parseLocation, resolveRegion } from '../shared/utils/location';
    import { useLocationStore, useVRCXUpdaterStore } from '../stores';

    const { t } = useI18n();
    const locationStore = useLocationStore();
    const updater = useVRCXUpdaterStore();
    const collapsed = ref(false);

    const dockVisible = computed(() => companionEnabled.value && companionHome.value === 'dock');

    const info = computed(() => {
        const loc = locationStore.lastLocation;
        if (!loc?.location || loc.location === 'offline' || loc.location === 'private') {
            return { world: t('view.dock.not_in_world'), line: '' };
        }
        const L = parseLocation(loc.location);
        const parts = [
            L.accessTypeName || '',
            resolveRegion(L)?.toUpperCase?.() || '',
            t('view.dock.players', { n: loc.playerList?.size ?? 0 })
        ].filter(Boolean);
        return { world: loc.name || L.worldId || '', line: parts.join(' | ') };
    });

    // link the updater to Neon: a new release becomes news she says
    watch(
        () => updater.pendingVRCXUpdate,
        (pending) => {
            if (pending) {
                pushNews({
                    kind: 'update',
                    title: t('view.dock.update', { v: updater.latestAppVersion || '' }),
                    text: t('view.dock.update', { v: updater.latestAppVersion || '' })
                });
            }
        }
    );
</script>

<style scoped>
    .nx-dock {
        position: fixed;
        right: 16px;
        bottom: 38px;
        z-index: 55;
        width: 300px;
        font-family: 'Share Tech Mono', ui-monospace, monospace;
        color: #fff;
        background: #05030a;
        border: 1px solid var(--primary);
        box-shadow: 0 0 18px color-mix(in oklch, var(--primary) 40%, transparent);
        clip-path: polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px));
    }
    .nx-dock-head {
        display: flex;
        justify-content: space-between;
        width: 100%;
        padding: 8px 14px;
        font-size: 11px;
        letter-spacing: 0.16em;
        color: var(--primary-foreground);
        background: var(--primary);
    }
    .nx-sec {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 10px 14px;
        border-top: 1px solid color-mix(in oklch, var(--primary) 30%, transparent);
    }
    .nx-lab {
        font-size: 10px;
        letter-spacing: 0.16em;
        color: var(--primary);
        text-transform: uppercase;
    }
    .nx-world {
        font-size: 14px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .nx-line {
        font-size: 11px;
        color: var(--muted-foreground);
    }
    .nx-news {
        display: flex;
        gap: 8px;
        font-size: 12px;
        align-items: baseline;
    }
    .nx-kind {
        flex: none;
        padding: 0 6px;
        font-size: 9px;
        text-transform: uppercase;
        color: var(--primary);
        border: 1px solid var(--primary);
    }
    .nx-newstext {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
