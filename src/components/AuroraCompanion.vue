<template>
    <div
        v-if="companionEnabled"
        class="aurora-companion"
        :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
        :class="{ dragging }">
        <div v-if="bubble" class="nx-dialog">
            <div class="nx-name">&gt; neon:</div>
            <div class="nx-text">{{ bubble }}<span class="nx-caret"></span></div>
            <div v-if="current" class="aurora-bubble-actions">
                <button type="button" @click="addNote">{{ t('view.settings.aurora.note_add') }}</button>
                <button type="button" class="ghost" @click="later">{{ t('view.settings.aurora.note_later') }}</button>
            </div>
        </div>
        <div v-if="bubble" class="nx-status">
            <span class="nx-dot"></span>
            <b>Neon</b><i>|</i><i>{{ speaking ? 'Talking' : 'Idle' }}</i>
            <span class="nx-grow"></span>
            <span class="nx-tag">{{ settings.mascotVoiceEnabled ? 'VOICE: TTS' : 'VOICE: OFF' }}</span>
        </div>
        <div class="aurora-body nx-portrait" @pointerdown="startDrag" @click="poke">
            <div class="nx-tab"></div>
            <div class="nx-frame">
                <AuroraMascot :size="120" />
            </div>
            <span class="nx-label">NEON.EXE</span>
        </div>
    </div>
</template>

<script setup>
    import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
    import { useI18n } from 'vue-i18n';

    import { showUserDialog } from '../coordinators/userCoordinator';
    import { clearPending, companionEnabled, initCompanion, noteReminders, pendingNotes } from '../services/auroraCompanion';
    import { setMood, speak, speaking } from '../services/auroraVoice';
    import { useAuroraSettingsStore } from '../stores';
    import AuroraMascot from './AuroraMascot.vue';

    const { t } = useI18n();
    const settings = useAuroraSettingsStore();

    const pos = ref({ x: 300, y: 300 });
    const dragging = ref(false);
    const bubble = ref('');
    const current = ref(null); // friend the bubble is about
    let target = { x: 300, y: 300 };
    let timers = [];
    let raf = 0;
    let dragOff = { x: 0, y: 0 };
    let snoozed = new Set();

    const SIZE = 76;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    function pickTarget() {
        const w = window.innerWidth - SIZE - 24;
        const h = window.innerHeight - SIZE - 24;
        target = { x: 260 + Math.random() * Math.max(40, w - 260), y: 80 + Math.random() * Math.max(40, h - 80) };
    }

    function step() {
        if (!dragging.value && !reduced) {
            // ease toward the target with a gentle drift
            pos.value = {
                x: pos.value.x + (target.x - pos.value.x) * 0.004,
                y: pos.value.y + (target.y - pos.value.y) * 0.004 + Math.sin(performance.now() / 700) * 0.12
            };
        }
        raf = requestAnimationFrame(step);
    }

    function say(text, mood) {
        bubble.value = text;
        setMood(mood || 'smug', 7000);
        if (settings.mascotVoiceEnabled) {
            speak(text, {
                voice: settings.mascotVoice,
                speed: settings.mascotVoiceSpeed,
                volume: settings.mascotVoiceVolume,
                mood
            }).catch(() => {});
        }
        timers.push(setTimeout(() => !current.value && (bubble.value = ''), 9000));
    }

    function nextReminder() {
        if (!noteReminders.value) {
            return;
        }
        const f = pendingNotes.value.find((p) => !snoozed.has(p.id));
        if (!f || current.value) {
            return;
        }
        current.value = f;
        say(t('view.settings.aurora.note_prompt', { name: f.name }), 'joy');
    }

    function addNote() {
        const f = current.value;
        if (f) {
            showUserDialog(f.id); // the profile has the note field
            clearPending(f.id);
        }
        current.value = null;
        bubble.value = '';
    }

    function later() {
        if (current.value) {
            snoozed.add(current.value.id);
        }
        current.value = null;
        bubble.value = '';
    }

    function poke() {
        if (!dragging.value) {
            say(t('view.settings.aurora.poke'), 'joy');
        }
    }

    function startDrag(e) {
        dragging.value = true;
        dragOff = { x: e.clientX - pos.value.x, y: e.clientY - pos.value.y };
        const move = (ev) => {
            pos.value = { x: ev.clientX - dragOff.x, y: ev.clientY - dragOff.y };
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            setTimeout(() => (dragging.value = false), 60);
            target = { ...pos.value };
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }

    onMounted(async () => {
        await initCompanion();
        pickTarget();
        raf = requestAnimationFrame(step);
        timers.push(setInterval(pickTarget, 9000));
        timers.push(setInterval(nextReminder, 20000));
        timers.push(setTimeout(nextReminder, 6000));
    });
    onBeforeUnmount(() => {
        cancelAnimationFrame(raf);
        timers.forEach((id) => {
            clearTimeout(id);
            clearInterval(id);
        });
    });
</script>

<style scoped>
    .aurora-companion {
        position: fixed;
        z-index: 60;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
        width: 290px;
        pointer-events: none;
        font-family: 'Share Tech Mono', ui-monospace, monospace;
    }
    .nx-dialog,
    .nx-status {
        pointer-events: auto;
        box-sizing: border-box;
        width: 100%;
        background: #05030a;
        color: #fff;
        border: 2px solid var(--primary);
        box-shadow: 0 0 20px color-mix(in oklch, var(--primary) 50%, transparent);
        clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px));
    }
    .nx-dialog {
        padding: 10px 14px 12px;
    }
    .nx-name {
        color: var(--primary);
        font-weight: 700;
        font-size: 12px;
        margin-bottom: 4px;
    }
    .nx-text {
        font-size: 12.5px;
        line-height: 1.5;
    }
    .nx-caret {
        display: inline-block;
        width: 7px;
        height: 13px;
        margin-left: 3px;
        vertical-align: -2px;
        background: var(--primary);
        animation: nx-blink 1s steps(1) infinite;
    }
    @keyframes nx-blink {
        50% {
            opacity: 0;
        }
    }
    .nx-status {
        display: flex;
        align-items: center;
        gap: 8px;
        height: 32px;
        padding: 0 12px;
        border-width: 1px;
        font-size: 11px;
    }
    .nx-status i {
        font-style: normal;
        color: var(--primary);
    }
    .nx-grow {
        flex-grow: 1;
    }
    .nx-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--primary);
        box-shadow: 0 0 8px var(--primary);
    }
    .nx-tag {
        padding: 1px 6px;
        border: 1px solid #fff;
        font-size: 10px;
    }
    .nx-portrait {
        position: relative;
        width: 132px;
        height: 158px;
        margin-top: 10px;
        pointer-events: auto;
        cursor: grab;
    }
    .dragging .nx-portrait {
        cursor: grabbing;
    }
    .nx-tab {
        position: absolute;
        left: 22px;
        top: -9px;
        width: 88px;
        height: 9px;
        background: var(--primary);
        clip-path: polygon(8px 0, calc(100% - 8px) 0, 100% 100%, 0 100%);
    }
    .nx-frame {
        position: absolute;
        inset: 0;
        padding: 4px;
        box-sizing: border-box;
        background: var(--primary);
        clip-path: polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px);
        filter: drop-shadow(0 0 12px var(--primary));
    }
    .nx-frame :deep(.aurora-mascot) {
        width: 100% !important;
        height: 100% !important;
        display: block;
        background: #000;
        clip-path: polygon(11px 0, calc(100% - 11px) 0, 100% 11px, 100% calc(100% - 11px), calc(100% - 11px) 100%, 11px 100%, 0 calc(100% - 11px), 0 11px);
    }
    .nx-frame :deep(img) {
        border-radius: 0;
        object-position: 50% 20%;
    }
    .nx-label {
        position: absolute;
        left: 14px;
        bottom: 8px;
        font-size: 9px;
        letter-spacing: 0.14em;
        color: #fff;
        text-shadow: 0 0 6px var(--primary);
        pointer-events: none;
    }
    .aurora-bubble-actions {
        display: flex;
        gap: 8px;
        margin-top: 8px;
    }
    .aurora-bubble-actions button {
        height: 26px;
        padding: 0 12px;
        font-size: 11px;
        font-weight: 700;
        background: var(--primary);
        color: #05030a;
    }
    .aurora-bubble-actions button.ghost {
        background: transparent;
        color: #fff;
        border: 1px solid var(--primary);
    }
</style>
