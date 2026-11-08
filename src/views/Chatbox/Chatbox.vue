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
    import { friendlyApp, initIntegrations, INTEGRATIONS, mediaSessions, setEnabled, setOption, setSlot, state } from '@/services/auroraIntegrations';
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
        height: 100%;
        overflow-y: auto;
        padding: 28px 32px 48px;
        display: flex;
        flex-direction: column;
        gap: 18px;
        max-width: 1144px;
        margin: 0 auto;
        width: 100%;
    }
    .nx-head {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 16px;
    }
    .nx-title {
        font-size: 1.55rem;
        font-weight: 600;
        letter-spacing: -0.01em;
    }
    .nx-meta {
        font-size: 0.78rem;
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
        gap: 16px;
        align-items: start;
    }
    .nx-right {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }
    .nx-card {
        border: 1px solid var(--a-line);
        border-radius: 16px;
        background: color-mix(in oklch, var(--card) 70%, transparent);
    }
    .nx-panel {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 20px 22px;
    }
    .nx-h2 {
        font-size: 0.78rem;
        font-weight: 500;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--muted-foreground);
    }
    .nx-mt {
        margin-top: 10px;
    }
    .nx-page {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 4px;
        border-radius: 12px;
    }
    .nx-page.active {
        background: color-mix(in oklch, var(--a-accent) 10%, transparent);
    }
    .nx-num {
        width: 20px;
        text-align: center;
        font-size: 0.78rem;
        color: var(--muted-foreground);
        font-variant-numeric: tabular-nums;
    }
    .nx-input {
        flex: 1;
    }
    .nx-x {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        color: var(--muted-foreground);
    }
    .nx-x:hover {
        background: var(--a-soft);
        color: var(--foreground);
    }
    .nx-add {
        align-self: flex-start;
        height: 32px;
        padding: 0 14px;
        font-size: 0.82rem;
        border-radius: 999px;
        border: 1px solid var(--a-line);
    }
    .nx-add:hover {
        background: var(--a-soft);
    }
    .nx-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }
    .nx-chip {
        height: 28px;
        padding: 0 10px;
        font-size: 0.76rem;
        font-family: var(--xr-mono, ui-monospace, monospace);
        border-radius: 8px;
        background: var(--a-soft);
        border: 1px solid var(--a-line);
        color: var(--foreground);
    }
    .nx-chip:hover {
        border-color: var(--a-accent);
    }
    .nx-opts {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 10px 16px;
        margin-top: 8px;
        padding-top: 14px;
        border-top: 1px solid var(--a-line);
    }
    .nx-ints {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 8px;
    }
    .nx-int {
        padding: 12px 16px;
        transition: border-color 0.15s ease;
    }
    .nx-int.on {
        border-color: color-mix(in oklch, var(--a-accent) 45%, transparent);
    }
    .nx-int-main {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
    }
    .nx-int-icon {
        width: 32px;
        height: 32px;
        display: grid;
        place-items: center;
        font-size: 16px;
        border-radius: 10px;
        background: var(--a-soft);
        color: var(--foreground);
    }
    .nx-int-text {
        flex: 1;
        min-width: 180px;
        display: flex;
        flex-direction: column;
    }
    .nx-int-text b {
        font-size: 0.88rem;
        font-weight: 500;
    }
    .nx-custom {
        font-size: 0.78rem;
        color: var(--muted-foreground);
        padding: 4px 8px;
        border-radius: 8px;
    }
    .nx-custom:hover {
        color: var(--foreground);
        background: var(--a-soft);
    }
    .nx-badge {
        font-size: 0.68rem;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid var(--a-line);
        color: var(--muted-foreground);
    }
    .nx-badge.off {
        opacity: 0.35;
    }
    .nx-int-opts {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px 16px;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--a-line);
    }
    .nx-full {
        grid-column: 1 / -1;
    }
    .nx-sessions {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .nx-session {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.82rem;
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
        gap: 2px;
        padding: 2px;
        border-radius: 999px;
        background: var(--a-soft);
    }
    .nx-pill {
        height: 24px;
        padding: 0 9px;
        font-size: 0.7rem;
        border-radius: 999px;
        color: var(--muted-foreground);
    }
    .nx-pill.on {
        background: var(--background);
        color: var(--foreground);
        box-shadow: 0 1px 2px oklch(0 0 0 / 18%);
    }
    .nx-small {
        width: 90px;
    }
    .nx-wide {
        width: 280px;
    }
    .nx-bubble {
        padding: 14px 16px;
        border-radius: 14px;
        background: var(--a-soft);
        border: 1px solid var(--a-line);
        font-size: 0.9rem;
        line-height: 1.45;
        min-height: 64px;
    }
    .nx-actions {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    @media (max-width: 960px) {
        .nx-cols {
            grid-template-columns: minmax(0, 1fr);
        }
    }
</style>
