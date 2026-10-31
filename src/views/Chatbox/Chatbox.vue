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
                    <button type="button" class="nx-x" :aria-label="t('common.actions.delete')" @click="removePage(i)">x</button>
                </div>
                <button v-if="pages.length < 12" type="button" class="nx-add" @click="addPage">+ {{ t('view.chatbox.add_page') }}</button>

                <h2 class="nx-h2 nx-mt">{{ t('view.chatbox.insert') }}</h2>
                <div class="nx-chips">
                    <button v-for="tok in tokens" :key="tok" type="button" class="nx-chip" @click="insertToken(tok)">{{ '{' + tok + '}' }}</button>
                </div>

                <div class="nx-opts">
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
                    <div class="nx-bubble">{{ preview || '...' }}</div>
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
    import { computed, onMounted, ref } from 'vue';
    import { useI18n } from 'vue-i18n';

    import { Input } from '@/components/ui/input';
    import { Switch } from '@/components/ui/switch';
    import {
        chatboxEnabled,
        chatboxInterval,
        chatboxNotify,
        chatboxPageIndex,
        chatboxPages,
        initChatbox,
        renderChatbox,
        sendChatboxNow,
        setChatboxEnabled,
        setChatboxInterval,
        setChatboxNotify,
        setChatboxPages,
        setTyping
    } from '@/services/auroraChatbox';
    import { useGameStore } from '@/stores';

    const { t } = useI18n();
    const game = useGameStore();
    const tokens = ['time', 'date', 'world', 'players', 'friends', 'uptime'];
    const focused = ref(0);
    const manual = ref('');

    onMounted(initChatbox);

    const pages = computed(() => chatboxPages.value);
    const activeIndex = computed(() => chatboxPageIndex.value % Math.max(1, pages.value.length));
    const gameRunning = computed(() => game.isGameRunning);
    const preview = computed(() => renderChatbox(pages.value[focused.value] ?? pages.value[0] ?? ''));

    function editPage(i, v) {
        const next = [...pages.value];
        next[i] = v;
        setChatboxPages(next);
    }
    function addPage() {
        setChatboxPages([...pages.value, '']);
        focused.value = pages.value.length - 1;
    }
    function removePage(i) {
        setChatboxPages(pages.value.filter((_, idx) => idx !== i));
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
    .nx-small {
        width: 90px;
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
