<template>
    <section class="a-card body-card">
        <div class="flex items-center gap-3">
            <h2 class="a-h2 flex-1"><AuroraIcon name="arrow" :size="15" /> {{ t('view.body_cal.title') }}</h2>
            <span class="body-pill">{{ sourceText }}</span>
            <button type="button" class="a-btn" :disabled="running" @click="resetCalibration">{{ t('view.body_cal.reset') }}</button>
        </div>
        <p class="a-note mb-4">{{ t('view.body_cal.desc') }}</p>

        <div class="body-layout">
            <div class="body-controls">
                <!-- size -->
                <div class="body-group">
                    <div class="body-head">
                        <span class="body-label">{{ t('view.body_cal.eye_height') }}</span>
                        <span class="body-value">{{ formatHeight(calibration.eyeHeight) }}</span>
                    </div>
                    <div class="body-row">
                        <button type="button" class="a-btn icon" :aria-label="t('view.body_cal.smaller')" @click="nudgeEye(-1)">
                            <AuroraIcon name="minus" :size="14" />
                        </button>
                        <input
                            type="range"
                            class="body-slider"
                            :min="EYE_RANGE[0]"
                            :max="EYE_RANGE[1]"
                            step="0.005"
                            :value="eyeToSlider(calibration.eyeHeight)"
                            :aria-label="t('view.body_cal.eye_height')"
                            :style="{ '--fill': fill(eyeToSlider(calibration.eyeHeight), EYE_RANGE) }"
                            @input="(e) => setManual({ eyeHeight: 10 ** Number(e.target.value) })" />
                        <button type="button" class="a-btn icon" :aria-label="t('view.body_cal.bigger')" @click="nudgeEye(1)">
                            <AuroraIcon name="plus" :size="14" />
                        </button>
                    </div>
                    <div class="body-chips">
                        <button
                            v-for="p in SIZE_PRESETS"
                            :key="p.label"
                            type="button"
                            class="body-chip"
                            :class="{ on: Math.abs(calibration.eyeHeight - p.eye) < p.eye * 0.02 }"
                            @click="setManual({ eyeHeight: p.eye })">
                            {{ t(`view.body_cal.size_${p.label}`) }}
                        </button>
                    </div>
                </div>

                <div class="body-grid">
                    <div class="body-group">
                        <div class="body-head">
                            <span class="body-label">{{ t('view.body_cal.arm_scale') }}</span>
                            <span class="body-value small">{{ Math.round(calibration.armScale * 100) }}%</span>
                        </div>
                        <input
                            type="range"
                            class="body-slider"
                            :min="CAL_LIMITS.armScale[0]"
                            :max="CAL_LIMITS.armScale[1]"
                            step="0.01"
                            :value="calibration.armScale"
                            :style="{ '--fill': fill(calibration.armScale, CAL_LIMITS.armScale) }"
                            @input="(e) => setManual({ armScale: e.target.value })"
                            @dblclick="setManual({ armScale: 1 })" />
                    </div>
                    <div class="body-group">
                        <div class="body-head">
                            <span class="body-label">{{ t('view.body_cal.leg_scale') }}</span>
                            <span class="body-value small">{{ Math.round(calibration.legScale * 100) }}%</span>
                        </div>
                        <input
                            type="range"
                            class="body-slider"
                            :min="CAL_LIMITS.legScale[0]"
                            :max="CAL_LIMITS.legScale[1]"
                            step="0.01"
                            :value="calibration.legScale"
                            :style="{ '--fill': fill(calibration.legScale, CAL_LIMITS.legScale) }"
                            @input="(e) => setManual({ legScale: e.target.value })"
                            @dblclick="setManual({ legScale: 1 })" />
                    </div>
                </div>
                <p class="a-note body-hint">{{ t('view.body_cal.average') }} {{ t('view.body_cal.dblclick') }}</p>

                <!-- feel: how the body moves -->
                <div v-for="f in FEEL" :key="f.key" class="body-group">
                    <div class="body-head">
                        <span class="body-label">{{ t(`view.body_cal.feel_${f.key}`) }}</span>
                        <span class="body-value small">{{ Math.round(calibration[f.key] * 100) }}%</span>
                    </div>
                    <input
                        type="range"
                        class="body-slider"
                        :min="CAL_LIMITS[f.key][0]"
                        :max="CAL_LIMITS[f.key][1]"
                        step="0.05"
                        :value="calibration[f.key]"
                        :style="{ '--fill': fill(calibration[f.key], CAL_LIMITS[f.key]) }"
                        @input="(e) => setManual({ [f.key]: e.target.value })"
                        @dblclick="setManual({ [f.key]: 1 })" />
                </div>
                <!-- sitting -->
                <div class="body-group">
                    <div class="body-head">
                        <span class="body-label">{{ t('view.body_cal.seat_height') }}</span>
                        <span class="body-value small">{{ Math.round(calibration.seatHeight * 100) }} cm</span>
                    </div>
                    <input
                        type="range"
                        class="body-slider"
                        :min="CAL_LIMITS.seatHeight[0]"
                        :max="CAL_LIMITS.seatHeight[1]"
                        step="0.01"
                        :value="calibration.seatHeight"
                        :style="{ '--fill': fill(calibration.seatHeight, CAL_LIMITS.seatHeight) }"
                        @input="(e) => setManual({ seatHeight: e.target.value })" />
                    <div class="body-chips">
                        <button
                            v-for="p in SEAT_PRESETS"
                            :key="p.label"
                            type="button"
                            class="body-chip"
                            :class="{ on: Math.abs(calibration.seatHeight - p.h) < 0.015 }"
                            @click="setManual({ seatHeight: p.h })">
                            {{ t(`view.body_cal.seat_${p.label}`) }} <small>{{ Math.round(p.h * 100) }}</small>
                        </button>
                    </div>
                    <div class="body-segment" role="group" :aria-label="t('view.body_cal.sit_mode')">
                        <button
                            v-for="m in SIT_MODES"
                            :key="m"
                            type="button"
                            :class="{ on: sitMode === m }"
                            @click="sitMode = m">
                            {{ t(`view.body_cal.sit_${m}`) }}
                        </button>
                    </div>
                    <p class="a-note body-hint">{{ t('view.body_cal.seat_note') }}</p>
                    <div class="flex flex-wrap items-center gap-2">
                        <button type="button" class="a-btn" :class="{ on: measure.hand === 'left' }" @click="setMeasureHand('left')">{{ t('view.body_cal.measure_left') }}</button>
                        <button type="button" class="a-btn" :class="{ on: measure.hand === 'right' }" @click="setMeasureHand('right')">{{ t('view.body_cal.measure_right') }}</button>
                        <button type="button" class="a-btn" :disabled="measure.status === 'wait'" @click="measureFloor">{{ t('view.body_cal.measure_floor') }}</button>
                        <button type="button" class="a-btn" :disabled="measure.status === 'wait'" @click="measurePoint">{{ t('view.body_cal.measure_point') }}</button>
                        <button type="button" class="a-btn" :disabled="measure.meters === null" @click="applyMeasure('seat')">{{ t('view.body_cal.measure_seat') }}</button>
                        <button type="button" class="a-btn" :disabled="measure.meters === null" @click="applyMeasure('eye')">{{ t('view.body_cal.measure_eye') }}</button>
                    </div>
                    <p class="a-note body-hint">{{ measureText }}</p>
                </div>

                <!-- standable -->
                <label class="body-switch">
                    <input v-model="autoDisable" type="checkbox" />
                    <span class="body-track"><span class="body-knob"></span></span>
                    <span class="flex-1">{{ t('view.body_cal.standable_auto') }}</span>
                    <span v-if="standableBadge" class="body-pill" :class="standableBadge.tone">{{ standableBadge.text }}</span>
                </label>
                <p v-if="standableDetail" class="a-note body-hint" :class="{ bad: standableState === 'error' }">{{ standableDetail }}</p>

                <!-- calibrate -->
                <div class="body-row wrap">
                    <button
                        type="button"
                        class="a-btn primary"
                        :disabled="running"
                        @click="calibrateNow({ withArms: true })">
                        {{ t('view.body_cal.calibrate') }}
                    </button>
                    <button type="button" class="a-btn" :disabled="running" @click="calibrateNow({ withArms: false })">
                        {{ t('view.body_cal.height_only') }}
                    </button>
                    <button v-if="running" type="button" class="a-btn" @click="cancelCalibration">
                        {{ t('view.body_cal.cancel') }}
                    </button>
                </div>
                <label class="flex items-center gap-3">
                    <input type="checkbox" :checked="driverOut" @change="(e) => setDriverOut(e.target.checked)" />
                    <span class="flex-1">{{ t('view.body_cal.driver_send') }}</span>
                    <span class="a-note">{{ t(`view.body_cal.driver_${driverState}`) }}</span>
                </label>
                <p v-if="status" class="a-note" :class="{ bad: calStatus === 'failed' }" aria-live="polite">{{ status }}</p>
                <p v-else class="a-note">{{ t('view.body_cal.no_source') }}</p>
            </div>

            <div class="body-preview">
                <AuroraBodyPreview embedded />
            </div>
        </div>
    </section>
</template>

<script setup>
    import { computed, onMounted } from 'vue';
    import { useI18n } from 'vue-i18n';

    import AuroraBodyPreview from './AuroraBodyPreview.vue';
    import AuroraIcon from './AuroraIcon.vue';
    import { driverOut, setDriverOut } from '../services/auroraBodyOutput';
    import { driverState } from '../services/auroraTrackerDriver';
    import { applyMeasure, calibrateNow, measure, measureFloor, measurePoint, setMeasureHand } from '../services/auroraMeasure';
    import { formatHeight } from '../services/auroraHeight';
    import { autoDisable, initStandable, standableError, standableState } from '../services/auroraStandable';
    import {
        CAL_LIMITS,
        calMessage,
        calStatus,
        calibration,
        cancelCalibration,
        initCalibration,
        resetCalibration,
        setManual,
        sitMode
    } from '../services/auroraBodyCalibration';

    const { t } = useI18n();

    // body size on a log scale from 1 cm to 100 m, like the avatar height slider
    const EYE_RANGE = [Math.log10(CAL_LIMITS.eyeHeight[0]), Math.log10(CAL_LIMITS.eyeHeight[1])];
    const eyeToSlider = (m) => Math.log10(Math.min(CAL_LIMITS.eyeHeight[1], Math.max(CAL_LIMITS.eyeHeight[0], m)));
    const fill = (v, [lo, hi]) => `${((Number(v) - lo) / (hi - lo)) * 100}%`;
    const nudgeEye = (dir) => setManual({ eyeHeight: calibration.value.eyeHeight * (dir > 0 ? 1.02 : 1 / 1.02) });

    const SIZE_PRESETS = [
        { label: 'tiny', eye: 0.01 },
        { label: 'mini', eye: 0.3 },
        { label: 'small', eye: 1.2 },
        { label: 'normal', eye: 1.65 },
        { label: 'tall', eye: 1.95 },
        { label: 'giant', eye: 5 }
    ];
    const SEAT_PRESETS = [
        { label: 'sofa', h: 0.4 },
        { label: 'chair', h: 0.46 },
        { label: 'bed', h: 0.56 },
        { label: 'stool', h: 0.65 }
    ];
    const SIT_MODES = ['auto', 'sit', 'stand'];
    const FEEL = [
        { key: 'swayAmount' },
        { key: 'feetSeparation' },
        { key: 'seatSensitivity' },
        { key: 'counterbalance' },
        { key: 'smoothing' },
        { key: 'neckRange' },
        { key: 'legFreedom' }
    ];

    onMounted(() => {
        initCalibration();
        initStandable();
    });

    const measureText = computed(() => {
        if (measure.status === 'wait') return t('view.body_cal.measure_wait');
        if (measure.status === 'failed') return t(`view.body_cal.measure_${measure.message}`);
        if (measure.meters !== null) return `${(measure.meters * 100).toFixed(1)} cm`;
        return t('view.body_cal.measure_note');
    });
    const running = computed(() => calStatus.value === 'stand' || calStatus.value === 'tpose');
    const sourceText = computed(() => t(`view.body_cal.from_${calibration.value.source}`));

    const standableBadge = computed(() => {
        switch (standableState.value) {
            case 'on':
                return { tone: 'warn', text: t('view.body_cal.badge_on') };
            case 'off':
                return { tone: 'ok', text: t('view.body_cal.badge_off') };
            case 'restart':
                return { tone: 'warn', text: t('view.body_cal.badge_restart') };
            case 'error':
                return { tone: 'bad', text: t('view.body_cal.badge_error') };
            default:
                return null;
        }
    });
    const standableDetail = computed(() => {
        const st = standableState.value;
        if (st === 'restart') return t('view.body_cal.standable_restart');
        if (st === 'error') return t('view.body_cal.standable_error', { e: standableError.value });
        return '';
    });

    const status = computed(() => {
        switch (calStatus.value) {
            case 'stand':
                return t('view.body_cal.state_stand');
            case 'tpose':
                return t('view.body_cal.state_tpose');
            case 'done':
                return t('view.body_cal.state_done', {
                    h: formatHeight(calibration.value.eyeHeight),
                    a: `${Math.round(calibration.value.armScale * 100)}%`
                });
            case 'failed':
                return t(`view.body_cal.fail_${calMessage.value}`);
            default:
                return '';
        }
    });
</script>

<style scoped>
    .body-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 380px);
        gap: 24px;
        align-items: start;
    }
    @media (max-width: 1100px) {
        .body-layout {
            grid-template-columns: minmax(0, 1fr);
        }
    }
    .body-controls {
        display: flex;
        flex-direction: column;
        gap: 18px;
        min-width: 0;
    }
    .body-preview {
        position: sticky;
        top: 12px;
    }
    .body-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
    }
    .body-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 18px;
    }
    .body-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
    }
    .body-label {
        font-size: 0.8rem;
        color: var(--a-muted);
        letter-spacing: 0.02em;
    }
    .body-value {
        font-size: 1.35rem;
        font-weight: 300;
        font-variant-numeric: tabular-nums;
    }
    .body-value.small {
        font-size: 0.95rem;
        font-weight: 400;
    }
    .body-row {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .body-row.wrap {
        flex-wrap: wrap;
    }
    .body-hint {
        margin: 0;
    }
    .body-slider {
        flex: 1;
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
    .body-slider:focus-visible::-webkit-slider-thumb {
        box-shadow: 0 0 0 4px color-mix(in oklch, var(--a-accent, #b4b4b4) 55%, transparent);
    }
    .body-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }
    .body-chip {
        font-size: 0.78rem;
        padding: 4px 12px;
        border-radius: 999px;
        border: 1px solid var(--a-line);
        color: var(--a-text);
        transition:
            border-color 0.15s,
            background 0.15s;
    }
    .body-chip small {
        color: var(--a-muted);
        margin-left: 2px;
    }
    .body-chip:hover,
    .body-chip.on {
        border-color: var(--a-accent, #b4b4b4);
        background: color-mix(in oklch, var(--a-accent, #b4b4b4) 12%, transparent);
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
        background: transparent;
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
    .a-note.bad {
        color: #ffcf8a;
    }
</style>
