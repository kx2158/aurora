<template>
    <header class="aura-top">
        <button class="aura-word" type="button" @click="go('home')">aura</button>

        <nav class="aura-tabs" aria-label="main">
            <button
                v-for="tab in tabs"
                :key="tab.key"
                type="button"
                class="aura-tab"
                :class="{ on: activeKey === tab.key }"
                @click="go(tab.routeName)">
                {{ t(tab.labelKey) }}
            </button>

            <DropdownMenu>
                <DropdownMenuTrigger as-child>
                    <button type="button" class="aura-tab" :class="{ on: moreActive }">{{ t('aura.more') }}</button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" class="aura-more">
                    <template v-for="(group, gi) in groups" :key="group.section">
                        <DropdownMenuSeparator v-if="gi > 0" />
                        <DropdownMenuLabel v-if="group.section" class="aura-label">
                            {{ t(`aura.section.${group.section}`) }}
                        </DropdownMenuLabel>
                        <DropdownMenuItem v-for="item in group.items" :key="item.key" @select="go(item.routeName)">
                            {{ t(item.labelKey) }}
                        </DropdownMenuItem>
                    </template>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem @select="go('settings')">{{ t('aura.settings') }}</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </nav>

        <div class="aura-status aura-label">{{ statusText }}</div>
    </header>
</template>

<script setup>
    import { computed } from 'vue';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';
    import { useRoute, useRouter } from 'vue-router';

    import {
        DropdownMenu,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuLabel,
        DropdownMenuSeparator,
        DropdownMenuTrigger
    } from '@/components/ui/dropdown-menu';
    import { navDefinitions } from '@/shared/constants';
    import { useUserStore } from '@/stores';

    const { t } = useI18n();
    const route = useRoute();
    const router = useRouter();
    const { currentUser } = storeToRefs(useUserStore());

    // the four things you reach for every day sit in the bar, everything else lives under "more"
    const TAB_KEYS = ['home', 'feed', 'friends-locations', 'friend-list'];
    const tabs = computed(() => TAB_KEYS.map((k) => navDefinitions.find((n) => n.key === k)).filter(Boolean));

    const groups = computed(() => {
        const rest = navDefinitions.filter((n) => !TAB_KEYS.includes(n.key) && n.routeName);
        const by = new Map();
        for (const item of rest) {
            const key = item.section || '';
            if (!by.has(key)) by.set(key, []);
            by.get(key).push(item);
        }
        return [...by.entries()].map(([section, items]) => ({ section, items }));
    });

    const activeKey = computed(() => tabs.value.find((x) => x.routeName === route.name)?.key ?? '');
    const moreActive = computed(() => !activeKey.value && route.name !== 'login');

    const STATUS = { 'join me': 'join me', active: 'visible', 'ask me': 'ask me', busy: 'busy', offline: 'offline' };
    const statusText = computed(() => {
        const s = String(currentUser.value?.status || '').toLowerCase();
        return (STATUS[s] || s || '').toUpperCase();
    });

    function go(name) {
        if (route.name !== name) router.push({ name });
    }
</script>

<style>
    .aura-top {
        display: none;
    }
    :root:is([data-theme='aura'], [data-theme='auradark']) .aura-top {
        display: flex;
        align-items: baseline;
        gap: 56px;
        padding: 22px 36px 14px;
        flex: none;
        font-family: var(--aura-font);
    }
    .aura-word {
        font-size: 30px;
        font-weight: 200;
        letter-spacing: -0.03em;
        color: var(--aura-ink);
        background: none;
        border: 0;
        padding: 0;
        line-height: 1;
        cursor: pointer;
    }
    .aura-tabs {
        display: flex;
        gap: 34px;
        align-items: baseline;
        flex: 1;
    }
    .aura-tab {
        background: none;
        border: 0;
        padding: 0;
        font-size: 12px;
        letter-spacing: 0.26em;
        text-transform: uppercase;
        font-weight: 300;
        color: var(--aura-mute);
        cursor: pointer;
        transition: color 0.15s;
    }
    .aura-tab:hover,
    .aura-tab.on {
        color: var(--aura-ink);
    }
    .aura-tab.on {
        font-weight: 500;
    }
    .aura-status {
        white-space: nowrap;
    }
    .aura-more {
        min-width: 220px;
        max-height: 70vh;
    }
</style>
