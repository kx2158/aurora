<template>
    <div class="a-page">
        <div class="a-page-inner">
            <header class="a-head">
                <div>
                    <h1 class="a-title">{{ t('view.mic.title') }}</h1>
                    <p class="a-sub">{{ t('view.mic.sub') }}</p>
                </div>
                <div class="flex items-center gap-2">
                    <button
                        type="button"
                        class="a-btn"
                        :class="{ danger: mm.micMuted }"
                        :disabled="!mm.running"
                        @click="toggleMicMute">
                        <AuroraIcon :name="mm.micMuted ? 'mute' : 'mic'" :size="16" />
                        {{ mm.micMuted ? t('view.mic.unmute') : t('view.mic.mute') }}
                    </button>
                    <button type="button" class="a-btn" :class="mm.running ? 'on' : 'primary'" @click="toggleMusicMic">
                        <AuroraIcon name="power" :size="16" />
                        {{ mm.running ? t('view.mic.turn_off') : t('view.mic.turn_on') }}
                    </button>
                </div>
            </header>

            <section class="a-card mic-status">
                <div class="flex items-center gap-3">
                    <span class="a-dot" :class="{ on: mm.running }"></span>
                    <span class="text-sm font-medium">{{ statusText }}</span>
                    <span v-if="mm.error" class="text-sm text-destructive">{{ mm.error }}</span>
                    <span class="ml-auto a-note">{{ mm.autoStart ? t('view.mic.auto_on') : t('view.mic.auto_off') }}</span>
                </div>
                <div class="mic-meters">
                    <div v-for="m in meters" :key="m.key" class="mic-meter">
                        <span class="mic-meter-label">{{ m.label }}</span>
                        <div class="a-meter" :class="{ hot: mm[m.key] > 0.95 }">
                            <i :style="{ width: meterWidth(mm[m.key]) }"></i>
                        </div>
                    </div>
                </div>
            </section>

            <div class="a-grid a-grid-2">
                <section class="a-card">
                    <h2 class="a-h2"><AuroraIcon name="mic" :size="15" /> {{ t('view.mic.voice') }}</h2>
                    <div class="a-field">
                        <div class="a-field-label">{{ t('view.mic.microphone') }}</div>
                        <div class="a-field-control">
                            <select class="a-select" :value="mm.mic" @change="(e) => setMm('mic', e.target.value)">
                                <option value="">{{ t('view.mic.none') }}</option>
                                <option v-for="d in audioDevices.capture" :key="d.id" :value="d.id">{{ d.name }}</option>
                            </select>
                        </div>
                    </div>
                    <RangeField
                        :label="t('view.mic.volume')"
                        :value="mm.micVol"
                        :min="0"
                        :max="5"
                        :step="0.05"
                        :format="pct"
                        @input="(v) => setMm('micVol', v)" />
                    <RangeField
                        :label="t('view.mic.noise')"
                        :hint="t('view.mic.noise_hint')"
                        :value="mm.micNoise"
                        :min="0"
                        :max="1"
                        :step="0.05"
                        :format="noiseLabel"
                        @input="(v) => setMm('micNoise', v)" />
                    <RangeField
                        :label="t('view.mic.bass')"
                        :value="mm.micBass"
                        :min="0"
                        :max="1"
                        :step="0.01"
                        :format="pct"
                        @input="(v) => setMm('micBass', v)" />
                </section>

                <section class="a-card">
                    <h2 class="a-h2"><AuroraIcon name="music" :size="15" /> {{ t('view.mic.music') }}</h2>
                    <div class="a-field">
                        <div class="a-field-label">
                            {{ t('view.mic.source') }}
                            <small>{{ t('view.mic.source_hint') }}</small>
                        </div>
                        <div class="a-field-control">
                            <select class="a-select" :value="mm.app" @change="(e) => setMm('app', e.target.value)">
                                <option value="">{{ t('view.mic.no_music') }}</option>
                                <option v-for="a in audioApps" :key="a" :value="a">{{ a }}</option>
                            </select>
                        </div>
                    </div>
                    <RangeField
                        :label="t('view.mic.volume')"
                        :value="mm.musicVol"
                        :min="0"
                        :max="10"
                        :step="0.1"
                        :format="pct"
                        @input="(v) => setMm('musicVol', v)" />
                    <RangeField
                        :label="t('view.mic.bass')"
                        :value="mm.musicBass"
                        :min="0"
                        :max="1"
                        :step="0.01"
                        :format="pct"
                        @input="(v) => setMm('musicBass', v)" />
                </section>
            </div>

            <section class="a-card">
                <h2 class="a-h2"><AuroraIcon name="speaker" :size="15" /> {{ t('view.mic.output') }}</h2>
                <div class="a-field">
                    <div class="a-field-label">
                        {{ t('view.mic.cable') }}
                        <small>{{ t('view.mic.cable_hint') }}</small>
                    </div>
                    <div class="a-field-control">
                        <select class="a-select" :value="mm.out" @change="(e) => setMm('out', e.target.value)">
                            <option value="">{{ t('view.mic.none') }}</option>
                            <option v-for="d in audioDevices.render" :key="d.id" :value="d.id">{{ d.name }}</option>
                        </select>
                    </div>
                </div>
                <div class="a-field">
                    <div class="a-field-label">
                        {{ t('view.mic.latency') }}
                        <small>{{ t('view.mic.latency_hint') }}</small>
                    </div>
                    <div class="a-field-control">
                        <div class="a-seg">
                            <button
                                v-for="l in latencies"
                                :key="l.value"
                                type="button"
                                :class="{ on: mm.latency === l.value }"
                                @click="setMm('latency', l.value)">
                                {{ l.label }}
                            </button>
                        </div>
                    </div>
                </div>
                <div class="a-field">
                    <div class="a-field-label">
                        {{ t('view.mic.auto') }}
                        <small>{{ t('view.mic.auto_hint') }}</small>
                    </div>
                    <div class="a-field-control">
                        <button
                            type="button"
                            class="a-toggle"
                            :class="{ on: mm.autoStart }"
                            :aria-pressed="mm.autoStart"
                            :aria-label="t('view.mic.auto')"
                            @click="setMm('autoStart', !mm.autoStart)"></button>
                    </div>
                </div>
                <div class="a-field">
                    <div class="a-field-label">
                        {{ t('view.mic.devices') }}
                        <small>{{ t('view.mic.devices_hint') }}</small>
                    </div>
                    <div class="a-field-control">
                        <button type="button" class="a-btn" @click="refreshAudioLists">
                            <AuroraIcon name="refresh" :size="15" /> {{ t('view.mic.refresh') }}
                        </button>
                    </div>
                </div>
                <p v-if="mm.running && mm.info" class="a-note mt-2">{{ mm.info }}</p>
            </section>

            <p class="a-note">{{ t('view.mic.setup') }}</p>
        </div>
    </div>
</template>

<script setup>
    import { computed, defineComponent, h, onMounted } from 'vue';
    import { useI18n } from 'vue-i18n';

    import AuroraIcon from '../../components/AuroraIcon.vue';
    import {
        audioApps,
        audioDevices,
        initMusicMic,
        mm,
        refreshAudioLists,
        setMm,
        toggleMicMute,
        toggleMusicMic
    } from '../../services/auroraMusicMic';

    const { t } = useI18n();

    onMounted(async () => {
        await initMusicMic();
        refreshAudioLists();
    });

    const pct = (v) => `${Math.round(v * 100)}%`;
    const noiseLabel = (v) => (v <= 0.001 ? t('view.mic.off') : `${Math.round(v * 100)}%`);
    const meterWidth = (v) => `${Math.min(100, Math.round((v || 0) * 110))}%`;

    const statusText = computed(() => {
        if (!mm.value.running) {
            return t('view.mic.status_off');
        }
        return mm.value.micMuted ? t('view.mic.status_muted') : t('view.mic.status_on');
    });

    const meters = computed(() => [
        { key: 'micPeak', label: t('view.mic.voice') },
        { key: 'musicPeak', label: t('view.mic.music') },
        { key: 'outPeak', label: t('view.mic.output') }
    ]);

    const latencies = computed(() => [
        { value: 10, label: t('view.mic.lat_low') },
        { value: 30, label: t('view.mic.lat_normal') },
        { value: 80, label: t('view.mic.lat_safe') }
    ]);

    /** One slider row: label left, slider and value right. */
    const RangeField = defineComponent({
        props: {
            label: String,
            hint: String,
            value: Number,
            min: Number,
            max: Number,
            step: Number,
            format: Function
        },
        emits: ['input'],
        setup(props, { emit }) {
            return () => {
                const fill = ((props.value - props.min) / (props.max - props.min || 1)) * 100;
                return h('div', { class: 'a-field' }, [
                    h('div', { class: 'a-field-label' }, [props.label, props.hint ? h('small', props.hint) : null]),
                    h('div', { class: 'a-field-control' }, [
                        h('input', {
                            type: 'range',
                            class: 'a-range',
                            min: props.min,
                            max: props.max,
                            step: props.step,
                            value: props.value,
                            style: { '--fill': `${fill}%` },
                            'aria-label': props.label,
                            onInput: (e) => emit('input', Number(e.target.value))
                        }),
                        h('span', { class: 'a-field-value' }, props.format ? props.format(props.value) : props.value)
                    ])
                ]);
            };
        }
    });
</script>

<style scoped>
    .mic-status {
        display: flex;
        flex-direction: column;
        gap: 18px;
    }
    .mic-meters {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 18px;
    }
    .mic-meter {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .mic-meter-label {
        font-size: 0.75rem;
        color: var(--a-muted);
    }
    @media (max-width: 760px) {
        .mic-meters {
            grid-template-columns: minmax(0, 1fr);
        }
    }
</style>
