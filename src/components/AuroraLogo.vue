<template>
    <svg class="aurora-logo" :width="size" :height="size" viewBox="0 0 64 64" fill="none" aria-label="Aura" role="img">
        <circle cx="32" cy="32" r="19" stroke="currentColor" :stroke-width="bold ? 4.2 : 2.6" />
        <circle cx="32" cy="32" r="3" fill="currentColor" />
    </svg>
</template>

<script setup>
    import { computed } from 'vue';

    /** Aura's mark: one thin ring with a dot at its centre. */
    const props = defineProps({
        size: { type: [Number, String], default: 28 }
    });

    // small sizes get heavier strokes so the mark stays readable
    const bold = computed(() => Number(props.size) <= 22);
</script>

<style scoped>
    .aurora-logo {
        flex: none;
        color: var(--foreground);
    }
</style>
