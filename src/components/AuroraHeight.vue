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
                class="height-slider"
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
                class="height-chip"
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
        <p v-if="isExtreme(height)" class="a-note height-warn">{{ t('view.height.extreme') }}</p>
    </section>
</template>

<script setup>
    import { onMounted } from 'vue';
    import { useI18n } from 'vue-i18n';

    import AuroraIcon from './AuroraIcon.vue';
    import {
        backToNormal,
        formatHeight,
        fromSlider,
        height,
        HEIGHT_PRESETS,
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
    .height-value {
        font-size: 1.4rem;
        font-weight: 300;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.02em;
    }
    .height-value.warn {
        color: #ffcf8a;
    }
    .height-row {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .height-slider {
        flex: 1;
        appearance: none;
        height: 6px;
        border-radius: 999px;
        background: linear-gradient(90deg, var(--a-accent, #b4b4b4) var(--fill), var(--a-line, rgba(255, 255, 255, 0.12)) var(--fill));
        outline: none;
    }
    .height-slider::-webkit-slider-thumb {
        appearance: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--a-text, #eee);
        box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.08);
        cursor: pointer;
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
    .height-chip {
        font-size: 0.78rem;
        padding: 4px 12px;
        border-radius: 999px;
        border: 1px solid var(--a-line);
        color: var(--a-text);
    }
    .height-chip small {
        color: var(--a-muted);
        margin-left: 4px;
    }
    .height-chip:hover,
    .height-chip.on {
        border-color: var(--a-accent, #b4b4b4);
        background: rgba(255, 255, 255, 0.06);
    }
    .height-exact {
        width: 110px;
    }
    .height-warn {
        margin-top: 10px;
        color: #ffcf8a;
    }
</style>
