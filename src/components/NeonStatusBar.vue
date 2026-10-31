<template>
    <div class="nx-bar">
        <span>NEON v{{ version }}</span>
        <span class="nx-pink">VOICE: {{ voiceOn ? 'LOCAL' : 'OFF' }}</span>
        <span>{{ gameRunning ? 'VRCHAT: RUNNING' : 'VRCHAT: OFFLINE' }}</span>
        <span class="nx-grow"></span>
        <span class="nx-dim">{{ clock }}</span>
    </div>
</template>

<script setup>
    import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

    import { useAuroraSettingsStore, useGameStore } from '../stores';

    const settings = useAuroraSettingsStore();
    const game = useGameStore();
    const version = computed(() => (typeof VERSION === 'string' ? VERSION : '1'));
    const voiceOn = computed(() => settings.mascotVoiceEnabled);
    const gameRunning = computed(() => game.isGameRunning);
    const now = ref(new Date());
    let timer = null;
    onMounted(() => (timer = setInterval(() => (now.value = new Date()), 30000)));
    onBeforeUnmount(() => clearInterval(timer));
    const clock = computed(() => now.value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
</script>

<style scoped>
    .nx-bar {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 40;
        display: flex;
        align-items: center;
        gap: 24px;
        height: 22px;
        padding: 0 16px;
        pointer-events: none;
        font-family: 'Share Tech Mono', ui-monospace, monospace;
        font-size: 10px;
        letter-spacing: 0.16em;
        color: var(--foreground);
        background: var(--sidebar);
        border-top: 1px solid var(--primary);
    }
    .nx-pink {
        color: var(--primary);
    }
    .nx-dim {
        color: var(--muted-foreground);
    }
    .nx-grow {
        flex: 1;
    }
</style>
