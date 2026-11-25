<template>
    <div id="chart" class="x-container">
        <div class="options-container">
            <span class="header">{{ t('view.tools.header') }}</span>

            <div class="mt-5 px-5">
                <AuroraStealth class="mb-6" />
                <AuroraHeight class="mb-6" />
                <AuroraSpaceDrag class="mb-6" />
                <AuroraAvatarFile />
                <div v-for="category in categories" :key="category.key" class="mb-6">
                    <div
                        class="cursor-pointer flex items-center p-2 px-3 rounded-lg mb-3 transition-all duration-200 ease-in-out"
                        @click="toggleCategory(category.key)">
                        <i
                            class="ri-arrow-down-s-line mr-2 text-sm transition-transform duration-300"
                            :class="{ '-rotate-90': categoryCollapsed[category.key] }" />
                        <span class="ml-1.5 text-base font-semibold">
                            {{ t(category.labelKey) }}
                        </span>
                    </div>

                    <div class="grid grid-cols-2 gap-4 ml-4" v-show="!categoryCollapsed[category.key]">
                        <ToolItem
                            v-for="tool in category.tools"
                            :key="tool.key"
                            :icon="tool.navIcon"
                            :title="t(tool.titleKey)"
                            :description="t(tool.descriptionKey)"
                            @click="triggerTool(tool)">
                            <template #actions>
                                <TooltipWrapper
                                    v-if="tool.navEligible && pinnedToolKeys.has(tool.key)"
                                    side="top"
                                    :content="t('nav_menu.custom_nav.unpin_from_nav')">
                                    <Button
                                        size="icon-xs"
                                        variant="secondary"
                                        class="opacity-0 transition-opacity group-hover:opacity-100"
                                        :title="t('nav_menu.custom_nav.unpin_from_nav')"
                                        :ariaLabel="t('nav_menu.custom_nav.unpin_from_nav')"
                                        @click.stop="unpinToolFromNav(tool.key)">
                                        <span class="relative inline-flex size-4">
                                            <i
                                                class="ri-side-bar-line inline-flex size-4 items-center justify-center text-base" />
                                            <span
                                                class="absolute -right-1 -top-1 grid size-2.5 place-items-center rounded-full bg-background shadow-sm">
                                                <i
                                                    class="ri-subtract-line inline-flex size-2 items-center justify-center text-[10px]" />
                                            </span>
                                        </span>
                                    </Button>
                                </TooltipWrapper>

                                <TooltipWrapper
                                    v-else-if="tool.navEligible"
                                    side="top"
                                    :content="t('nav_menu.custom_nav.pin_to_nav')">
                                    <Button
                                        size="icon-xs"
                                        variant="ghost"
                                        class="opacity-0 transition-opacity group-hover:opacity-100"
                                        :title="t('nav_menu.custom_nav.pin_to_nav')"
                                        :ariaLabel="t('nav_menu.custom_nav.pin_to_nav')"
                                        @click.stop="pinToolToNav(tool.key)">
                                        <span class="relative inline-flex size-4">
                                            <i
                                                class="ri-side-bar-line inline-flex size-4 items-center justify-center text-base" />
                                            <span
                                                class="absolute -right-1 -top-1 grid size-2.5 place-items-center rounded-full bg-background shadow-sm">
                                                <i
                                                    class="ri-add-line inline-flex size-2 items-center justify-center text-[10px]" />
                                            </span>
                                        </span>
                                    </Button>
                                </TooltipWrapper>
                            </template>
                        </ToolItem>
                    </div>
                </div>
                <div class="mb-6 flex items-center gap-2">
                    <template v-if="!devUnlocked">
                        <input
                            v-model="devPassword"
                            type="password"
                            class="a-input"
                            :placeholder="t('view.tools.dev_placeholder')"
                            @keydown.enter="submitDev" />
                        <button type="button" class="a-btn" @click="submitDev">{{ t('view.tools.dev_unlock') }}</button>
                    </template>
                    <button v-else type="button" class="a-btn" @click="lockDev">{{ t('view.tools.dev_lock') }}</button>
                </div>
                <div v-if="devUnlocked" class="mb-6 flex items-center gap-3">
                    <Switch :model-value="unmuteEnabled" :ariaLabel="t('view.tools.dev_unmutes')" @update:modelValue="setUnmuteEnabled" />
                    <span class="text-sm">{{ t('view.tools.dev_unmutes') }}: {{ unmuteCount }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { computed, onMounted, ref } from 'vue';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';

    import { Button } from '@/components/ui/button';
    import { Switch } from '@/components/ui/switch';
    import { TooltipWrapper } from '@/components/ui/tooltip';
    import ToolItem from './components/ToolItem.vue';
    import AuroraAvatarFile from '../../components/AuroraAvatarFile.vue';
    import AuroraStealth from '../../components/AuroraStealth.vue';
    import AuroraHeight from '../../components/AuroraHeight.vue';
    import AuroraSpaceDrag from '../../components/AuroraSpaceDrag.vue';
    import { useToolActions } from '../../composables/useToolActions';
    import { useToolNavPinning } from '../../composables/useToolNavPinning';
    import { getToolsByCategory, toolCategories } from '../../shared/constants';
    import configRepository from '../../services/config.js';
    import { devUnlocked, initDevLock, lockDev, tryUnlock } from '../../services/devLock';
    import { setUnmuteEnabled, unmuteCount, unmuteEnabled } from '../../services/unmuteCounter';

    const { t } = useI18n();
    const { triggerTool } = useToolActions();
    const { pinToolToNav, pinnedToolKeys, refreshPinnedState, unpinToolFromNav } = useToolNavPinning();
    // a new key so everything starts closed, even for people who had opened sections before
    const toolsCategoryCollapsedConfigKey = 'Aura_toolsCollapsed';
    // shortcuts and exports go to the bottom
    const BOTTOM = ['shortcuts', 'user'];
    // developer-only categories stay hidden until the developer password is entered
    const DEV_ONLY = ['system'];
    const allCategories = [...toolCategories]
        .sort((a, b) => BOTTOM.indexOf(a.key) - BOTTOM.indexOf(b.key) || 0)
        .map((category) => ({
            ...category,
            tools: getToolsByCategory(category.key)
        }));
    const categories = computed(() => allCategories.filter((c) => devUnlocked.value || !DEV_ONLY.includes(c.key)));
    const devPassword = ref('');
    async function submitDev() {
        const ok = await tryUnlock(devPassword.value);
        devPassword.value = '';
        if (!ok) toast.error(t('view.tools.dev_wrong'));
    }

    const categoryCollapsed = ref({
        group: true,
        image: true,
        shortcuts: true,
        system: true,
        user: true,
        other: true
    });

    const toggleCategory = (category) => {
        categoryCollapsed.value[category] = !categoryCollapsed.value[category];
        configRepository.setString(toolsCategoryCollapsedConfigKey, JSON.stringify(categoryCollapsed.value));
    };

    onMounted(async () => {
        initDevLock();
        await refreshPinnedState();
        const storedValue = await configRepository.getString(toolsCategoryCollapsedConfigKey, '{}');
        try {
            const parsed = JSON.parse(storedValue);
            categoryCollapsed.value = {
                ...categoryCollapsed.value,
                ...parsed
            };
        } catch {
            // ignore invalid stored value and keep defaults
        }
    });
</script>
