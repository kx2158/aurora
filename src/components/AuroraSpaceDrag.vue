<template>
    <section class="a-card drag-card">
        <div class="flex items-center gap-3">
            <h2 class="a-h2 flex-1"><AuroraIcon name="bolt" :size="15" /> {{ t('view.space_drag.title') }}</h2>
            <span class="body-pill" :class="badge.tone">{{ badge.text }}</span>
        </div>
        <p class="a-note mb-4">{{ t('view.space_drag.desc') }}</p>

        <div class="drag-controls">
            <label class="body-switch">
                <input type="checkbox" :checked="dragSettings.enabled" @change="(e) => updateDragSettings({ enabled: e.target.checked })" />
                <span class="body-track"><span class="body-knob"></span></span>
                <span class="flex-1">{{ t('view.space_drag.enable') }}</span>
            </label>

            <div class="drag-group">
                <span class="drag-label">{{ t('view.space_drag.hand') }}</span>
                <div class="body-segment" role="group" :aria-label="t('view.space_drag.hand')">
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
                    class="body-slider"
                    :min="DRAG_LIMITS.multiplier[0]"
                    :max="DRAG_LIMITS.multiplier[1]"
                    step="0.05"
                    :value="dragSettings.multiplier"
                    :aria-label="t('view.space_drag.multiplier')"
                    :style="{ '--fill': `${fill}%` }"
                    @input="(e) => updateDragSettings({ multiplier: e.target.value })" />
                <p class="a-note drag-hint">{{ t('view.space_drag.multiplier_hint') }}</p>
            </div>

            <label class="body-switch">
                <input type="checkbox" :checked="dragSettings.allowVertical" @change="(e) => updateDragSettings({ allowVertical: e.target.checked })" />
                <span class="body-track"><span class="body-knob"></span></span>
                <span class="flex-1">{{ t('view.space_drag.vertical') }}</span>
            </label>
            <label class="body-switch">
                <input type="checkbox" :checked="dragSettings.comfort" @change="(e) => updateDragSettings({ comfort: e.target.checked })" />
                <span class="body-track"><span class="body-knob"></span></span>
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
        color: #ffcf8a;
    }
    .body-slider {
        width: 100%;
        appearance: none;
        height: 6px;
        border-radius: 999px;
        background: linear-gradient(90deg, var(--a-accent, #b4b4b4) var(--fill, 50%), var(--a-line, rgba(255, 255, 255, 0.12)) var(--fill, 50%));
        outline: none;
        cursor: pointer;
    }
    .body-slider::-webkit-slider-thumb {
        appearance: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--a-text, #eee);
        box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.08);
    }
    .body-segment {
        display: inline-flex;
        align-self: flex-start;
        border: 1px solid var(--a-line);
        border-radius: 999px;
        padding: 3px;
        gap: 2px;
    }
    .body-segment button {
        font-size: 0.78rem;
        padding: 4px 14px;
        border-radius: 999px;
        color: var(--a-muted);
        transition:
            background 0.15s,
            color 0.15s;
    }
    .body-segment button.on {
        background: color-mix(in oklch, var(--a-accent, #b4b4b4) 22%, transparent);
        color: var(--a-text);
    }
    .body-pill {
        font-size: 0.72rem;
        padding: 2px 10px;
        border-radius: 999px;
        border: 1px solid var(--a-line);
        color: var(--a-muted);
        white-space: nowrap;
    }
    .body-pill.ok {
        color: #8fe3b0;
        border-color: color-mix(in oklch, #8fe3b0 45%, transparent);
    }
    .body-pill.warn {
        color: #ffcf8a;
        border-color: color-mix(in oklch, #ffcf8a 45%, transparent);
    }
    .body-pill.bad {
        color: #ff9a9a;
        border-color: color-mix(in oklch, #ff9a9a 45%, transparent);
    }
    .body-switch {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 0.85rem;
        cursor: pointer;
    }
    .body-switch input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
    }
    .body-track {
        flex: none;
        width: 36px;
        height: 20px;
        border-radius: 999px;
        border: 1px solid var(--a-line);
        position: relative;
        transition:
            background 0.2s,
            border-color 0.2s;
    }
    .body-knob {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--a-muted);
        transition:
            transform 0.2s,
            background 0.2s;
    }
    .body-switch input:checked + .body-track {
        background: color-mix(in oklch, var(--a-accent, #b4b4b4) 28%, transparent);
        border-color: var(--a-accent, #b4b4b4);
    }
    .body-switch input:checked + .body-track .body-knob {
        transform: translateX(16px);
        background: var(--a-text, #eee);
    }
    .body-switch input:focus-visible + .body-track {
        outline: 2px solid color-mix(in oklch, var(--a-accent, #b4b4b4) 60%, transparent);
        outline-offset: 2px;
    }
</style>
