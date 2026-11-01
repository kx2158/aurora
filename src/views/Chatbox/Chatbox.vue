<template>
    <div class="nx-chat x-container">
        <div class="nx-head">
            <div>
                <h1 class="nx-title">{{ t('view.chatbox.title') }}</h1>
                <p class="nx-meta">{{ t('view.chatbox.subtitle') }}</p>
            </div>
            <div class="nx-switch">
                <span class="nx-meta">{{ chatboxEnabled ? 'LIVE' : 'OFF' }}</span>
                <Switch :model-value="chatboxEnabled" :ariaLabel="t('view.chatbox.title')" @update:modelValue="setChatboxEnabled" />
            </div>
        </div>

        <h2 class="nx-h2">{{ t('view.chatbox.integrations') }}</h2>
        <div class="nx-ints">
            <div v-for="def in INTEGRATIONS" :key="def.id" class="nx-int nx-card" :class="{ on: state[def.id]?.enabled }">
                <div class="nx-int-main">
                    <i :class="['nx-int-icon', def.icon]"></i>
                    <div class="nx-int-text">
                        <b>{{ def.name }}</b>
                        <span class="nx-meta">{{ def.desc }}</span>
                    </div>
                    <button
                        v-if="def.options || def.id === 'medialink' || def.id === 'status'"
                        type="button"
                        class="nx-custom"
                        @click="toggleOpen(def.id)">
                        {{ t('view.chatbox.customize') }} {{ open[def.id] ? 'v' : '>' }}
                    </button>
                    <span v-if="def.id !== 'status'" class="nx-slots" :title="t('view.chatbox.slot_hint')">
                        <button
                            v-for="sl in SLOTS"
                            :key="sl"
                            type="button"
                            class="nx-pill"
                            :class="{ on: state[def.id]?.slot === sl }"
                            @click="setSlot(def.id, sl)">
                            {{ sl.toUpperCase() }}
                        </button>
                    </span>
                    <span class="nx-badge" :class="{ off: !def.desktop }">DESKTOP</span>
                    <span class="nx-badge" :class="{ off: !def.vr }">VR</span>
                    <Switch
                        :model-value="state[def.id]?.enabled"
                        :ariaLabel="def.name"
                        @update:modelValue="(v) => setEnabled(def.id, v)" />
                </div>
                <div v-if="open[def.id]" class="nx-int-opts">
                    <template v-for="opt in def.options || []" :key="opt.key">
                        <label class="nx-meta">{{ opt.label }}</label>
                        <Switch
                            v-if="opt.type === 'bool'"
                            :model-value="!!state[def.id][opt.key]"
                            :ariaLabel="opt.label"
                            @update:modelValue="(v) => setOption(def.id, opt.key, v)" />
                        <Input
                            v-else
                            :type="opt.type === 'number' ? 'number' : 'text'"
                            :model-value="state[def.id][opt.key]"
                            class="nx-wide"
                            @update:modelValue="(v) => setOption(def.id, opt.key, v)" />
                    </template>
                    <p v-if="def.id === 'status'" class="nx-meta nx-full">{{ t('view.chatbox.status_hint') }}</p>
                    <div v-if="def.id === 'medialink'" class="nx-full nx-sessions">
                        <p v-if="!mediaSessions.length" class="nx-meta">{{ t('view.chatbox.no_media') }}</p>
                        <div v-for="m in mediaSessions" :key="m.id" class="nx-session">
                            <b>{{ friendlyApp(m.id) }}</b>
                            <span class="nx-meta nx-trunc">{{ m.title }}{{ m.artist ? ' - ' + m.artist : '' }}</span>
                            <button type="button" class="nx-pill" :class="{ on: !state.medialink.noArtist[m.id] }" @click="flip('noArtist', m.id)">ARTIST</button>
                            <button type="button" class="nx-pill" :class="{ on: !state.medialink.noTitle[m.id] }" @click="flip('noTitle', m.id)">TITLE</button>
                            <button type="button" class="nx-pill" :class="{ on: !state.medialink.hidden[m.id] }" @click="flip('hidden', m.id, true)">SHOW</button>
                            <span class="nx-meta">{{ m.playing ? 'PLAYING' : 'PAUSED' }}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div v-for="name in COMING_SOON" :key="name" class="nx-int nx-card soon">
                <div class="nx-int-main">
                    <i class="nx-int-icon ri-time-line"></i>
                    <div class="nx-int-text">
                        <b>{{ name }}</b>
                        <span class="nx-meta">{{ t('view.chatbox.soon') }}</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="nx-cols">
            <div class="nx-card nx-panel">
                <h2 class="nx-h2">{{ t('view.chatbox.pages') }}</h2>
                <div v-for="(page, i) in pages" :key="i" class="nx-page" :class="{ active: i === activeIndex }">
                    <span class="nx-num">{{ i + 1 }}</span>
                    <Input
                        :model-value="page"
                        maxlength="144"
                        class="nx-input"
                        @focus="focused = i"
                        @update:modelValue="(v) => editPage(i, v)" />
                    <span class="nx-slots">
                        <button
                            v-for="sl in SLOTS"
                            :key="sl"
                            type="button"
                            class="nx-pill"
                            :class="{ on: slotOf(i) === sl }"
                            @click="setSlotOfPage(i, sl)">
                            {{ sl.toUpperCase() }}
                        </button>
                    </span>
                    <button type="button" class="nx-x" :aria-label="t('common.actions.delete')" @click="removePage(i)">x</button>
                </div>
                <button v-if="pages.length < 12" type="button" class="nx-add" @click="addPage">+ {{ t('view.chatbox.add_page') }}</button>

                <h2 class="nx-h2 nx-mt">{{ t('view.chatbox.insert') }}</h2>
                <div class="nx-chips">
                    <button v-for="tok in tokens" :key="tok" type="button" class="nx-chip" @click="insertToken(tok)">{{ '{' + tok + '}' }}</button>
                </div>

                <div class="nx-opts">
                    <label class="nx-meta">{{ t('view.chatbox.afk_minutes') }}</label>
                    <Input type="number" min="1" max="120" :model-value="afkMinutes" class="nx-small" @update:modelValue="setAfkMinutes" />
                    <label class="nx-meta">{{ t('view.settings.aurora.chatbox_interval') }}</label>
                    <Input
                        type="number"
                        min="3"
                        max="60"
                        :model-value="chatboxInterval"
                        class="nx-small"
                        @update:modelValue="setChatboxInterval" />
                    <label class="nx-meta">{{ t('view.settings.aurora.chatbox_notify') }}</label>
                    <Switch :model-value="chatboxNotify" :ariaLabel="t('view.settings.aurora.chatbox_notify')" @update:modelValue="setChatboxNotify" />
                </div>
            </div>

            <div class="nx-right">
                <div class="nx-card nx-panel">
                    <h2 class="nx-h2">{{ t('view.chatbox.preview') }}</h2>
                    <div class="nx-bubble" style="white-space: pre-line">{{ preview || '...' }}</div>
                    <span class="nx-meta">{{ preview.length }} / 144</span>
                </div>

                <div class="nx-card nx-panel">
                    <h2 class="nx-h2">{{ t('view.chatbox.send_now') }}</h2>
                    <Input
                        v-model="manual"
                        maxlength="144"
                        :placeholder="t('view.chatbox.manual_ph')"
                        @input="setTyping(true)"
                        @keydown.enter="sendManual" />
                    <div class="nx-actions">
                        <button type="button" class="nx-add" @click="sendManual">{{ t('view.chatbox.send') }}</button>
                        <span v-if="!gameRunning" class="nx-meta">{{ t('view.chatbox.game_off') }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { computed, onMounted, reactive, ref } from 'vue';
    import { useI18n } from 'vue-i18n';

    import { Input } from '@/components/ui/input';
    import { Switch } from '@/components/ui/switch';
    import {
        afkMinutes,
        chatboxEnabled,
        chatboxInterval,
        chatboxNotify,
        chatboxPageIndex,
        chatboxPreview,
        chatboxPages,
        chatboxPageSlots,
        initChatbox,
        renderChatbox,
        sendChatboxNow,
        setChatboxEnabled,
        setChatboxInterval,
        setChatboxNotify,
        setAfkMinutes,
        setChatboxPages,
        setTyping
    } from '@/services/auroraChatbox';
    import { COMING_SOON, friendlyApp, initIntegrations, INTEGRATIONS, mediaSessions, setEnabled, setOption, setSlot, state } from '@/services/auroraIntegrations';
    import { useGameStore } from '@/stores';

    const { t } = useI18n();
    const game = useGameStore();
    const tokens = ['time', 'date', 'world', 'players', 'friends', 'uptime', 'window', 'app', 'music', 'song', 'artist', 'cpu', 'ram', 'battery', 'afk'];
    const focused = ref(0);
    const manual = ref('');

    onMounted(() => {
        initChatbox();
        initIntegrations();
    });

    const open = reactive({});
    function toggleOpen(id) {
        open[id] = !open[id];
    }
    // the per-session buttons store true for "off" (hidden, noArtist, noTitle)
    function flip(group, id) {
        state.medialink[group][id] = !state.medialink[group][id];
    }

    const pages = computed(() => chatboxPages.value);
    const activeIndex = computed(() => chatboxPageIndex.value % Math.max(1, pages.value.length));
    const gameRunning = computed(() => game.isGameRunning);
    const preview = computed(() => chatboxPreview.value || '');

    const SLOTS = ['top', 'rotate', 'bottom'];
    function slotOf(i) {
        return chatboxPageSlots.value[i] || 'rotate';
    }
    function setSlotOfPage(i, sl) {
        const slots = [...chatboxPageSlots.value];
        slots[i] = sl;
        setChatboxPages([...pages.value], slots);
    }
    function editPage(i, v) {
        const next = [...pages.value];
        next[i] = v;
        setChatboxPages(next);
    }
    function addPage() {
        setChatboxPages([...pages.value, ''], [...chatboxPageSlots.value, 'rotate']);
        focused.value = pages.value.length - 1;
    }
    function removePage(i) {
        setChatboxPages(
            pages.value.filter((_, idx) => idx !== i),
            chatboxPageSlots.value.filter((_, idx) => idx !== i)
        );
        focused.value = 0;
    }
    function insertToken(tok) {
        const i = Math.min(focused.value, pages.value.length - 1);
        editPage(i, (pages.value[i] || '') + '{' + tok + '}');
    }
    function sendManual() {
        if (!manual.value.trim()) {
            return;
        }
        sendChatboxNow(manual.value);
        setTyping(false);
        manual.value = '';
    }
</script>

<style scoped>
    .nx-chat {
        display: flex;
        flex-direction: column;
        gap: 18px;
        padding: 22px 26px 34px;
        overflow-y: auto;
    }
    .nx-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
    }
    .nx-title {
        font-size: 2rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        text-shadow: 3px 0 var(--primary), -3px 0 color-mix(in oklch, var(--foreground) 70%, transparent);
    }
    .nx-meta {
        font-family: 'Share Tech Mono', ui-monospace, monospace;
        font-size: 12px;
        color: var(--muted-foreground);
    }
    .nx-switch {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .nx-cols {
        display: grid;
        grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
        gap: 14px;
        align-items: start;
    }
    .nx-right {
        display: flex;
        flex-direction: column;
        gap: 14px;
    }
    .nx-card {
        background: var(--card);
        border: 1px solid var(--border);
        clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px));
    }
    .nx-panel {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 18px 20px;
    }
    .nx-h2 {
        font-size: 0.95rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: var(--primary);
    }
    .nx-mt {
        margin-top: 8px;
    }
    .nx-page {
        display: flex;
        align-items: center;
        gap: 10px;
        padding-left: 8px;
        border-left: 3px solid transparent;
    }
    .nx-page.active {
        border-left-color: var(--primary);
    }
    .nx-num {
        font-family: 'Share Tech Mono', ui-monospace, monospace;
        color: var(--primary);
        width: 18px;
    }
    .nx-input {
        flex: 1;
    }
    .nx-x {
        width: 26px;
        height: 26px;
        color: var(--muted-foreground);
        border: 1px solid var(--border);
    }
    .nx-x:hover {
        color: var(--primary);
        border-color: var(--primary);
    }
    .nx-add {
        align-self: flex-start;
        height: 30px;
        padding: 0 14px;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--primary);
        border: 1px solid var(--primary);
    }
    .nx-add:hover {
        background: var(--primary);
        color: var(--primary-foreground);
    }
    .nx-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }
    .nx-chip {
        padding: 3px 10px;
        font-family: 'Share Tech Mono', ui-monospace, monospace;
        font-size: 12px;
        color: var(--foreground);
        border: 1px solid var(--border);
    }
    .nx-chip:hover {
        border-color: var(--primary);
        color: var(--primary);
    }
    .nx-opts {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 10px;
        margin-top: 8px;
    }
    .nx-ints {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
    .nx-int {
        padding: 12px 16px;
        opacity: 0.85;
    }
    .nx-int.on {
        opacity: 1;
        border-color: var(--primary);
    }
    .nx-int.soon {
        opacity: 0.45;
    }
    .nx-int-main {
        display: flex;
        align-items: center;
        gap: 14px;
    }
    .nx-int-icon {
        font-size: 26px;
        color: var(--primary);
        width: 34px;
        text-align: center;
    }
    .nx-int-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
    }
    .nx-int-text b {
        font-size: 1.05rem;
    }
    .nx-custom {
        height: 26px;
        padding: 0 12px;
        font-size: 12px;
        color: var(--foreground);
        border: 1px solid var(--border);
    }
    .nx-custom:hover {
        border-color: var(--primary);
        color: var(--primary);
    }
    .nx-badge {
        padding: 2px 10px;
        font-family: 'Share Tech Mono', ui-monospace, monospace;
        font-size: 11px;
        color: var(--primary-foreground);
        background: var(--primary);
    }
    .nx-badge.off {
        color: var(--muted-foreground);
        background: transparent;
        border: 1px solid var(--border);
    }
    .nx-int-opts {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 10px;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--border);
    }
    .nx-full {
        grid-column: 1 / -1;
    }
    .nx-sessions {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .nx-session {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .nx-trunc {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .nx-slots {
        display: inline-flex;
        gap: 4px;
    }
    .nx-pill {
        padding: 2px 10px;
        font-size: 11px;
        font-weight: 700;
        color: var(--muted-foreground);
        border: 1px solid var(--border);
    }
    .nx-pill.on {
        color: var(--primary-foreground);
        background: var(--primary);
        border-color: var(--primary);
    }
    .nx-small {
        width: 90px;
    }
    .nx-wide {
        width: 180px;
    }
    .nx-bubble {
        padding: 14px 18px;
        font-size: 15px;
        text-align: center;
        color: #fff;
        background: #000;
        border-radius: 18px;
        border: 2px solid var(--primary);
        box-shadow: 0 0 18px color-mix(in oklch, var(--primary) 45%, transparent);
        word-break: break-word;
    }
    .nx-actions {
        display: flex;
        align-items: center;
        gap: 12px;
    }
</style>
