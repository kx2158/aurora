<template>
    <div class="desk" @keydown.esc="hide">
        <header class="desk-head">
            <AuroraLogo :size="22" />
            <span class="desk-name">aurora</span>
            <span class="desk-hint">{{ hotkey ? t('view.desk.hint', { key: hotkey }) : '' }}</span>
            <button type="button" class="a-btn icon desk-x" :aria-label="t('view.desk.close')" @click="hide">
                <AuroraIcon name="close" :size="14" />
            </button>
        </header>

        <div class="a-seg desk-tabs">
            <button v-for="tb in tabs" :key="tb.key" type="button" :class="{ on: tab === tb.key }" @click="setTab(tb.key)">
                <AuroraIcon :name="tb.icon" :size="14" /> {{ tb.label }}
            </button>
        </div>

        <!-- Mic -->
        <section v-if="tab === 'mic'" class="desk-body">
            <div class="desk-row">
                <span class="a-dot" :class="{ on: mm.running }"></span>
                <span class="desk-strong">{{ micStatus }}</span>
                <span class="flex-1"></span>
                <button type="button" class="a-btn" :class="{ danger: mm.micMuted }" :disabled="!mm.running" @click="send('mmMute')">
                    <AuroraIcon :name="mm.micMuted ? 'mute' : 'mic'" :size="14" />
                    {{ mm.micMuted ? t('view.mic.unmute') : t('view.mic.mute') }}
                </button>
                <button type="button" class="a-btn" :class="mm.running ? 'on' : 'primary'" @click="send('mmToggle')">
                    <AuroraIcon name="power" :size="14" />
                    {{ mm.running ? t('view.mic.turn_off') : t('view.mic.turn_on') }}
                </button>
            </div>
            <p v-if="mm.error" class="desk-error">{{ mm.error }}</p>
            <div class="desk-meters">
                <div class="a-meter" :class="{ hot: mm.micPeak > 0.95 }"><i :style="{ width: meter(mm.micPeak) }"></i></div>
                <div class="a-meter" :class="{ hot: mm.outPeak > 0.95 }"><i :style="{ width: meter(mm.outPeak) }"></i></div>
            </div>

            <h3 class="desk-h">{{ t('view.mic.voice') }}</h3>
            <DeskSlider :label="t('view.mic.volume')" :value="mm.micVol" :max="5" :step="0.05" :fmt="pct" @set="(v) => setMm('micVol', v)" />
            <DeskSlider :label="t('view.mic.noise')" :value="mm.micNoise" :max="1" :step="0.05" :fmt="noise" @set="(v) => setMm('micNoise', v)" />
            <DeskSlider :label="t('view.mic.bass')" :value="mm.micBass" :max="1" :step="0.01" :fmt="pct" @set="(v) => setMm('micBass', v)" />

            <h3 class="desk-h">{{ t('view.mic.music') }}</h3>
            <select class="a-select desk-select" :value="mm.app" :aria-label="t('view.mic.source')" @change="(e) => send('mmApp', e.target.value)" @focus="send('mmRefresh')">
                <option value="">{{ t('view.mic.no_music') }}</option>
                <option v-for="a in appsWithCurrent" :key="a" :value="a">{{ a }}</option>
            </select>
            <DeskSlider :label="t('view.mic.volume')" :value="mm.musicVol" :max="10" :step="0.1" :fmt="pct" @set="(v) => setMm('musicVol', v)" />
            <DeskSlider :label="t('view.mic.bass')" :value="mm.musicBass" :max="1" :step="0.01" :fmt="pct" @set="(v) => setMm('musicBass', v)" />
        </section>

        <!-- Timers -->
        <section v-else-if="tab === 'timers'" class="desk-body">
            <div class="desk-grid">
                <button v-for="m in QUICK" :key="m" type="button" class="a-btn" @click="send('timer', m)">
                    {{ m < 60 ? t('view.automations.minutes', { n: m }) : t('view.desk.hours', { n: m / 60 }) }}
                </button>
            </div>
            <form class="desk-row" @submit.prevent="customTimer">
                <input
                    v-model.number="custom"
                    type="number"
                    min="1"
                    max="1440"
                    class="a-input desk-num"
                    :aria-label="t('view.automations.minutes_label')" />
                <span class="desk-muted">{{ t('view.desk.minutes') }}</span>
                <span class="flex-1"></span>
                <button type="submit" class="a-btn primary">{{ t('view.desk.start') }}</button>
            </form>

            <h3 class="desk-h">{{ t('view.automations.alarms') }}</h3>
            <p v-if="!state.alarms.length" class="a-empty">{{ t('view.automations.no_alarms') }}</p>
            <div v-for="a in sortedAlarms" :key="a.id" class="desk-alarm" :class="{ off: !a.enabled }">
                <span class="desk-time">{{ a.time }}</span>
                <span class="desk-label">{{ a.label || (a.daily ? t('view.automations.daily') : t('view.automations.once')) }}</span>
                <button
                    type="button"
                    class="a-toggle"
                    :class="{ on: a.enabled }"
                    :aria-pressed="a.enabled"
                    :aria-label="t('view.automations.enabled')"
                    @click="send('alarmToggle', a.id)"></button>
                <button type="button" class="a-btn icon" :aria-label="t('view.automations.remove')" @click="send('alarmRemove', a.id)">
                    <AuroraIcon name="close" :size="13" />
                </button>
            </div>
            <button type="button" class="a-btn danger desk-stop" @click="send('stopAlarm')">{{ t('view.desk.stop_alarm') }}</button>
        </section>

        <!-- Chatbox -->
        <section v-else class="desk-body">
            <div class="desk-row">
                <span class="desk-strong">{{ t('view.desk.chatbox_live') }}</span>
                <span class="flex-1"></span>
                <button
                    type="button"
                    class="a-toggle"
                    :class="{ on: state.chatbox.enabled }"
                    :aria-pressed="state.chatbox.enabled"
                    :aria-label="t('view.desk.chatbox_live')"
                    @click="send('chatboxToggle')"></button>
            </div>
            <div class="desk-bubble">{{ state.chatbox.preview || t('view.desk.chatbox_empty') }}</div>

            <h3 class="desk-h">{{ t('view.desk.say') }}</h3>
            <textarea
                ref="sayBox"
                v-model="say"
                class="a-input desk-say"
                maxlength="144"
                rows="3"
                :placeholder="t('view.desk.say_ph')"
                @keydown.enter.exact.prevent="sendSay"></textarea>
            <div class="desk-row">
                <span class="desk-muted">{{ say.length }}/144</span>
                <span class="flex-1"></span>
                <button type="button" class="a-btn" @click="send('brb')">{{ t('view.desk.brb') }}</button>
                <button type="button" class="a-btn" @click="send('clear')">{{ t('view.desk.clear') }}</button>
                <button type="button" class="a-btn primary" :disabled="!say.trim()" @click="sendSay">{{ t('view.desk.send') }}</button>
            </div>
        </section>

        <footer class="desk-foot">
            <button type="button" class="desk-link" @click="send('open')">{{ t('view.desk.open_app') }}</button>
        </footer>
    </div>
</template>

<script setup>
    import { computed, defineComponent, h, nextTick, onMounted, reactive, ref } from 'vue';
    import { useI18n } from 'vue-i18n';

    import AuroraIcon from '../components/AuroraIcon.vue';
    import AuroraLogo from '../components/AuroraLogo.vue';

    const { t } = useI18n();
    const QUICK = [5, 10, 15, 20, 30, 45, 60, 90];

    const state = reactive({
        chatbox: { enabled: false, preview: '' },
        alarms: [],
        mm: { running: false, micMuted: false, app: '', apps: [], micVol: 1, musicVol: 0.8, micNoise: 0, micBass: 0, musicBass: 0, micPeak: 0, outPeak: 0, error: '' }
    });
    const mm = computed(() => state.mm);
    const hotkey = ref('');

    // ---- talking to the app ----
    function send(command, value = '') {
        try {
            window.DeskApi?.Command(command, String(value));
        } catch (e) {
            console.error(e);
        }
    }
    function hide() {
        try {
            window.DeskApi?.Hide();
        } catch {
            // not in the app
        }
    }
    let slideTimer = null;
    function setMm(key, value) {
        state.mm[key] = value;
        clearTimeout(slideTimer);
        slideTimer = setTimeout(() => send('mmSet', JSON.stringify({ key, value })), 40);
    }

    window.deskState = (json) => {
        try {
            const next = typeof json === 'string' ? JSON.parse(json) : json;
            const root = document.documentElement;
            const aurora = next.theme === 'xray' || next.theme === 'xraydark';
            const theme = aurora ? next.theme : next.dark ? 'xraydark' : 'xray';
            root.setAttribute('data-theme', theme);
            root.classList.toggle('dark', theme === 'xraydark');
            if (next.axh) root.style.setProperty('--axh', next.axh);
            if (next.axk) root.style.setProperty('--axk', next.axk);
            if (typeof next.hotkey === 'string') hotkey.value = next.hotkey;
            if (next.chatbox) state.chatbox = next.chatbox;
            if (Array.isArray(next.alarms)) state.alarms = next.alarms;
            if (next.mm) state.mm = { ...state.mm, ...next.mm };
        } catch (e) {
            console.error('desk state', e);
        }
    };
    window.deskShown = () => {
        if (tab.value === 'chatbox') {
            nextTick(() => sayBox.value?.focus());
        }
    };

    onMounted(async () => {
        try {
            await window.CefSharp?.BindObjectAsync('DeskApi');
        } catch {
            // not in the app
        }
        send('mmRefresh');
        try {
            window.DeskApi?.Ready();
        } catch {
            // ignore
        }
    });

    // ---- tabs ----
    const tabs = computed(() => [
        { key: 'mic', icon: 'mic', label: t('view.desk.tab_mic') },
        { key: 'timers', icon: 'alarm', label: t('view.desk.tab_timers') },
        { key: 'chatbox', icon: 'chat', label: t('view.desk.tab_chatbox') }
    ]);
    const tab = ref(readTab());
    function readTab() {
        try {
            return localStorage.getItem('desk-tab') || 'mic';
        } catch {
            return 'mic';
        }
    }
    function setTab(k) {
        tab.value = k;
        try {
            localStorage.setItem('desk-tab', k);
        } catch {
            // ignore
        }
    }

    // ---- mic ----
    const pct = (v) => `${Math.round(v * 100)}%`;
    const noise = (v) => (v <= 0.001 ? t('view.mic.off') : `${Math.round(v * 100)}%`);
    const meter = (v) => `${Math.min(100, Math.round((v || 0) * 110))}%`;
    const micStatus = computed(() =>
        !mm.value.running ? t('view.mic.status_off') : mm.value.micMuted ? t('view.mic.status_muted') : t('view.mic.status_on')
    );
    const appsWithCurrent = computed(() => {
        const list = [...(mm.value.apps || [])];
        if (mm.value.app && !list.includes(mm.value.app)) list.unshift(mm.value.app);
        return list;
    });

    // ---- timers ----
    const custom = ref(25);
    function customTimer() {
        if (custom.value >= 1) send('timer', custom.value);
    }
    const sortedAlarms = computed(() => [...state.alarms].sort((a, b) => String(a.time).localeCompare(String(b.time))));

    // ---- chatbox ----
    const say = ref('');
    const sayBox = ref(null);
    function sendSay() {
        const text = say.value.trim();
        if (!text) return;
        send('chatboxSend', text);
        say.value = '';
    }

    /** label and value on top, the slider across the width below */
    const DeskSlider = defineComponent({
        props: { label: String, value: Number, max: Number, step: Number, fmt: Function },
        emits: ['set'],
        setup(props, { emit }) {
            return () =>
                h('div', { class: 'desk-slider' }, [
                    h('div', { class: 'desk-slider-top' }, [
                        h('span', props.label),
                        h('span', { class: 'desk-muted' }, props.fmt ? props.fmt(props.value) : props.value)
                    ]),
                    h('input', {
                        type: 'range',
                        class: 'a-range a-range-full',
                        min: 0,
                        max: props.max,
                        step: props.step,
                        value: props.value,
                        style: { '--fill': `${(props.value / (props.max || 1)) * 100}%` },
                        'aria-label': props.label,
                        onInput: (e) => emit('set', Number(e.target.value))
                    })
                ]);
        }
    });
</script>

<style>
    html,
    body {
        margin: 0;
        height: 100%;
        overflow: hidden;
        background: var(--card);
        color: var(--foreground);
        font-family: var(--xr-font, 'Inter Variable', 'Segoe UI', sans-serif);
    }
    #root {
        height: 100%;
    }
</style>

<style scoped>
    .desk {
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 14px 16px 10px;
        box-sizing: border-box;
        border: 1px solid var(--a-line);
        border-radius: 14px;
    }
    .desk-head {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .desk-name {
        font-size: 0.95rem;
        font-weight: 500;
    }
    .desk-hint {
        flex: 1;
        font-size: 0.72rem;
        color: var(--a-muted);
    }
    .desk-x {
        width: 28px;
        height: 28px;
    }
    .desk-tabs {
        display: flex;
    }
    .desk-tabs button {
        flex: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
    }
    .desk-body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding-right: 2px;
    }
    .desk-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .desk-strong {
        font-size: 0.88rem;
        font-weight: 500;
    }
    .desk-muted {
        font-size: 0.76rem;
        color: var(--a-muted);
        font-variant-numeric: tabular-nums;
    }
    .desk-error {
        font-size: 0.76rem;
        color: var(--destructive);
    }
    .desk-meters {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
    }
    .desk-meters .a-meter {
        flex: none;
    }
    .desk-h {
        margin-top: 6px;
        font-size: 0.72rem;
        font-weight: 500;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--a-muted);
    }
    .desk-select {
        width: 100%;
    }
    .desk-slider {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 0.84rem;
    }
    .desk-slider-top {
        display: flex;
        justify-content: space-between;
    }
    .desk-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
    }
    .desk-grid .a-btn {
        padding: 0;
    }
    .desk-num {
        width: 80px;
        text-align: center;
    }
    .desk-alarm {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 0;
        border-top: 1px solid var(--a-line);
    }
    .desk-alarm.off {
        opacity: 0.5;
    }
    .desk-time {
        font-size: 1.05rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
    }
    .desk-label {
        flex: 1;
        min-width: 0;
        font-size: 0.8rem;
        color: var(--a-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .desk-stop {
        align-self: flex-start;
        margin-top: 4px;
    }
    .desk-bubble {
        padding: 12px 14px;
        border-radius: 12px;
        background: var(--a-soft);
        border: 1px solid var(--a-line);
        font-size: 0.86rem;
        line-height: 1.45;
        min-height: 48px;
        white-space: pre-wrap;
        word-break: break-word;
    }
    .desk-say {
        height: auto;
        padding: 10px 12px;
        resize: none;
        line-height: 1.4;
    }
    .desk-foot {
        display: flex;
        justify-content: center;
        padding-top: 4px;
        border-top: 1px solid var(--a-line);
    }
    .desk-link {
        font-size: 0.76rem;
        color: var(--a-muted);
        padding: 4px 8px;
        border-radius: 8px;
    }
    .desk-link:hover {
        color: var(--foreground);
        background: var(--a-soft);
    }
</style>
