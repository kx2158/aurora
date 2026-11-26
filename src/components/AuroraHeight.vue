<template>
    <section class="a-card height-card">
        <div class="flex items-center gap-3">
            <h2 class="a-h2 flex-1"><AuroraIcon name="arrow" :size="15" class="-rotate-90" /> {{ t('view.height.title') }}</h2>
            <span class="height-value" :class="{ warn: isExtreme(height) }">{{ formatHeight(height) }}</span>
        </div>
        <p class="a-note mb-3">{{ t('view.height.desc') }}</p>
        <div class="height-row">
            <button type="button" class="a-btn icon" :aria-label="t('view.height.smaller')" @click="stepHeight(-1)">
                <AuroraIcon name="minus" :size="14" />
            </button>
            <input
                type="range"
                class="a-range full"
                min="-2"
                max="4"
                step="0.005"
                :value="toSlider(height)"
                :aria-label="t('view.height.title')"
                :style="{ '--fill': `${((toSlider(height) + 2) / 6) * 100}%` }"
                @input="(e) => setHeight(fromSlider(e.target.value))" />
            <button type="button" class="a-btn icon" :aria-label="t('view.height.bigger')" @click="stepHeight(1)">
                <AuroraIcon name="plus" :size="14" />
            </button>
        </div>
        <div class="height-scale">
            <span>1 cm</span><span>10 cm</span><span>1 m</span><span>10 m</span><span>100 m</span><span>1 km</span><span>10 km</span>
        </div>
        <div class="height-presets">
            <button
                v-for="p in HEIGHT_PRESETS"
                :key="p.label"
                type="button"
                class="a-chip"
                :class="{ on: Math.abs(height - p.m) < p.m * 0.01 }"
                @click="setHeight(p.m)">
                {{ p.label }} <small>{{ formatHeight(p.m) }}</small>
            </button>
        </div>
        <div class="height-row mt-3">
            <span class="a-note">{{ t('view.height.exact') }}</span>
            <input
                type="number"
                class="a-input height-exact"
                :min="MIN_HEIGHT"
                :max="MAX_HEIGHT"
                step="any"
                :value="height"
                @change="(e) => setHeight(e.target.value)" />
            <span class="a-note">m</span>
            <span class="flex-1"></span>
            <button type="button" class="a-btn" @click="backToNormal">
                {{ t('view.height.normal', { h: formatHeight(normalHeight) }) }}
            </button>
            <button type="button" class="a-btn" @click="setNormalHeight()">{{ t('view.height.set_normal') }}</button>
        </div>
        <div class="height-row mt-3">
            <button type="button" class="a-btn" :disabled="importState === 'waiting'" @click="importHeightFromVrchat">
                {{ t(importState === 'waiting' ? 'view.height.import_waiting' : 'view.height.import') }}
            </button>
            <span v-if="importState === 'found'" class="a-note">{{ t('view.height.import_found') }}</span>
            <span v-else-if="importState === 'none'" class="a-note height-warn">{{ t('view.height.import_none') }}</span>
        </div>
        <div class="height-row mt-3">
            <label class="flex items-center gap-2 text-sm">
                <input v-model="joinHeight.enabled" type="checkbox" />
                {{ t('view.height.join_label') }}
            </label>
            <input
                type="number"
                min="1"
                max="1000"
                step="1"
                class="height-join-input"
                :value="Math.round(joinHeight.m * 100)"
                :disabled="!joinHeight.enabled"
                @change="joinHeight.m = clamp(Number($event.target.value) / 100)" />
            <span class="a-note">cm</span>
        </div>
        <p v-if="isExtreme(height)" class="a-note height-warn">{{ t('view.height.extreme') }}</p>
    </section>
</template>

<script setup>
    import { onMounted } from 'vue';
    import { useI18n } from 'vue-i18n';

    import AuroraIcon from './AuroraIcon.vue';
    import {
        backToNormal,
        clamp,
        joinHeight,
        formatHeight,
        fromSlider,
        height,
        HEIGHT_PRESETS,
        importHeightFromVrchat,
        importState,
        initHeight,
        isExtreme,
        MAX_HEIGHT,
        MIN_HEIGHT,
        normalHeight,
        setHeight,
        setNormalHeight,
        stepHeight,
        toSlider
    } from '../services/auroraHeight';

    const { t } = useI18n();
    onMounted(initHeight);
</script>

<style scoped>
    .height-join-input {
        width: 72px;
        padding: 4px 8px;
        border: 1px solid var(--a-line, rgba(128, 128, 128, 0.3));
        border-radius: 8px;
        background: transparent;
        color: inherit;
    }
    .height-value {
        font-size: 1.4rem;
        font-weight: 300;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.02em;
    }
    .height-value.warn {
        color: var(--a-warn);
    }
    .height-row {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .height-scale {
        display: flex;
        justify-content: space-between;
        margin: 6px 44px 0;
        font-size: 0.68rem;
        color: var(--a-muted);
    }
    .height-presets {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 14px;
    }
    .height-exact {
        width: 110px;
    }
    .height-warn {
        margin-top: 10px;
        color: var(--a-warn);
    }
</style>
