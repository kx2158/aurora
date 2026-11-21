<template>
    <section class="a-card drag-card">
        <div class="flex items-center gap-3">
            <h2 class="a-h2 flex-1"><AuroraIcon name="bolt" :size="15" /> {{ t('view.space_drag.title') }}</h2>
            <span class="a-pill" :class="badge.tone">{{ badge.text }}</span>
        </div>
        <p class="a-note mb-4">{{ t('view.space_drag.desc') }}</p>

        <div class="drag-controls">
            <label class="a-switch">
                <input type="checkbox" :checked="dragSettings.enabled" @change="(e) => updateDragSettings({ enabled: e.target.checked })" />
                <span class="a-switch-track"><span class="a-switch-knob"></span></span>
                <span class="flex-1">{{ t('view.space_drag.enable') }}</span>
            </label>

            <div class="drag-group">
                <span class="drag-label">{{ t('view.space_drag.hand') }}</span>
                <div class="a-seg" role="group" :aria-label="t('view.space_drag.hand')">
                    <button
                        v-for="h in HANDS"
                        :key="h"
                        type="button"
                        :class="{ on: dragSettings.hand === h }"
                        @click="updateDragSettings({ hand: h })">
                        {{ t(`view.space_drag.hand_${h}`) }}
                    </button>
                </div>
            </div>

            <div class="drag-group">
                <div class="drag-head">
                    <span class="drag-label">{{ t('view.space_drag.multiplier') }}</span>
                    <span class="drag-value">{{ dragSettings.multiplier.toFixed(2) }}x</span>
                </div>
                <input
                    type="range"
                    class="a-range full"
                    :min="DRAG_LIMITS.multiplier[0]"
                    :max="DRAG_LIMITS.multiplier[1]"
                    step="0.05"
                    :value="dragSettings.multiplier"
                    :aria-label="t('view.space_drag.multiplier')"
                    :style="{ '--fill': `${fill}%` }"
                    @input="(e) => updateDragSettings({ multiplier: e.target.value })" />
                <p class="a-note drag-hint">{{ t('view.space_drag.multiplier_hint') }}</p>
            </div>

            <label class="a-switch">
                <input type="checkbox" :checked="dragSettings.vertical" @change="(e) => updateDragSettings({ vertical: e.target.checked })" />
                <span class="a-switch-track"><span class="a-switch-knob"></span></span>
                <span class="flex-1">{{ t('view.space_drag.vertical') }}</span>
            </label>
            <label class="a-switch">
                <input type="checkbox" :checked="dragSettings.comfort" @change="(e) => updateDragSettings({ comfort: e.target.checked })" />
                <span class="a-switch-track"><span class="a-switch-knob"></span></span>
                <span class="flex-1">{{ t('view.space_drag.comfort') }}</span>
            </label>

            <p v-if="help" class="a-note drag-hint" :class="{ bad: state === 'error' }">{{ help }}</p>

            <div class="drag-row">
                <button type="button" class="a-btn" :disabled="state === 'missing'" @click="resetDragSpace">
                    <AuroraIcon name="refresh" :size="14" /> {{ t('view.space_drag.reset') }}
                </button>
                <button type="button" class="a-btn" @click="openSteamVrBindings">{{ t('view.space_drag.bindings') }}</button>
            </div>
            <p class="a-note drag-hint">{{ t('view.space_drag.how') }}</p>
        </div>
    </section>
</template>

<script setup>
    import { computed, onBeforeUnmount, onMounted } from 'vue';
    import { useI18n } from 'vue-i18n';

    import AuroraIcon from './AuroraIcon.vue';
    import {
        dragSettings,
        dragUiState,
        initSpaceDrag,
        openSteamVrBindings,
        resetDragSpace,
        stopSpaceDrag,
        updateDragSettings
    } from '../services/auroraSpaceDrag';
    import { DRAG_LIMITS, HANDS } from '../services/spaceDragCore';

    const { t } = useI18n();
    const state = dragUiState;

    const BADGES = {
        off: ['', 'off'],
        missing: ['bad', 'missing'],
        starting: ['warn', 'starting'],
        'no-steamvr': ['warn', 'no_steamvr'],
        unbound: ['warn', 'unbound'],
        ready: ['ok', 'ready'],
        dragging: ['ok', 'dragging'],
        error: ['bad', 'error']
    };
    const badge = computed(() => {
        const [tone, key] = BADGES[state.value] || BADGES.off;
        return { tone, text: t(`view.space_drag.state_${key}`) };
    });
    const help = computed(() => {
        const key = { missing: 'missing', 'no-steamvr': 'no_steamvr', unbound: 'unbound', error: 'error' }[state.value];
        return key ? t(`view.space_drag.help_${key}`) : '';
    });
    const fill = computed(() => {
        const [lo, hi] = DRAG_LIMITS.multiplier;
        return ((dragSettings.value.multiplier - lo) / (hi - lo)) * 100;
    });

    onMounted(initSpaceDrag);
    onBeforeUnmount(stopSpaceDrag);
</script>

<style scoped>
    .drag-controls {
        display: flex;
        flex-direction: column;
        gap: 18px;
    }
    .drag-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .drag-head,
    .drag-row {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
    }
    .drag-head {
        justify-content: space-between;
    }
    .drag-label {
        font-size: 0.85rem;
    }
    .drag-value {
        font-variant-numeric: tabular-nums;
        color: var(--a-muted);
    }
    .drag-hint {
        margin: 0;
    }
    .drag-hint.bad {
        color: var(--a-warn);
    }
    .a-seg {
        align-self: flex-start;
    }
</style>
