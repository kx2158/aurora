<template>
    <div
        v-if="companionEnabled"
        class="aurora-companion"
        :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
        :class="{ dragging }">
        <div v-if="bubble" class="aurora-bubble">
            <span>{{ bubble }}</span>
            <div v-if="current" class="aurora-bubble-actions">
                <button type="button" @click="addNote">{{ t('view.settings.aurora.note_add') }}</button>
                <button type="button" class="ghost" @click="later">{{ t('view.settings.aurora.note_later') }}</button>
            </div>
        </div>
        <div class="aurora-body" @pointerdown="startDrag" @click="poke">
            <AuroraMascot :size="76" />
        </div>
    </div>
</template>

<script setup>
    import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
    import { useI18n } from 'vue-i18n';

    import { showUserDialog } from '../coordinators/userCoordinator';
    import { clearPending, companionEnabled, initCompanion, noteReminders, pendingNotes } from '../services/auroraCompanion';
    import { setMood, speak } from '../services/auroraVoice';
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
        align-items: center;
        gap: 8px;
        pointer-events: none;
    }
    .aurora-body {
        pointer-events: auto;
        cursor: grab;
        filter: drop-shadow(0 6px 18px color-mix(in oklch, var(--primary) 55%, transparent));
    }
    .dragging .aurora-body {
        cursor: grabbing;
    }
    .aurora-bubble {
        pointer-events: auto;
        max-width: 240px;
        padding: 10px 14px;
        border-radius: 16px 16px 16px 4px;
        font-size: 13px;
        line-height: 1.4;
        background: var(--popover);
        color: var(--popover-foreground);
        border: 1px solid var(--primary);
        box-shadow: 0 0 20px color-mix(in oklch, var(--primary) 45%, transparent);
    }
    .aurora-bubble-actions {
        display: flex;
        gap: 8px;
        margin-top: 8px;
    }
    .aurora-bubble-actions button {
        height: 28px;
        padding: 0 12px;
        border-radius: 14px;
        font-size: 12px;
        font-weight: 600;
        background: var(--primary);
        color: var(--primary-foreground);
    }
    .aurora-bubble-actions button.ghost {
        background: transparent;
        color: var(--muted-foreground);
        border: 1px solid var(--border);
    }
</style>
