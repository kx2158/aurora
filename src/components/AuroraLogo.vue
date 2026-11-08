<template>
    <svg class="aurora-logo" :width="size" :height="size" viewBox="0 0 64 64" fill="none" aria-label="Aurora" role="img">
        <defs>
            <linearGradient :id="gradId" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="var(--logo-a, #4fe3a0)" />
                <stop offset=".55" stop-color="var(--logo-b, #5fd0e8)" />
                <stop offset="1" stop-color="var(--logo-c, #a08cff)" />
            </linearGradient>
            <mask :id="maskId" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
                <rect width="64" height="64" fill="#fff" />
                <path :d="RIBBON" stroke="#000" :stroke-width="bold ? 11 : 9" stroke-linecap="round" />
            </mask>
        </defs>
        <circle
            cx="32"
            cy="32"
            r="19"
            stroke="currentColor"
            :stroke-width="bold ? 4.2 : 2.6"
            :mask="`url(#${maskId})`" />
        <path :d="RIBBON" :stroke="`url(#${gradId})`" :stroke-width="bold ? 6 : 3.6" stroke-linecap="round" />
    </svg>
</template>

<script setup>
    import { computed } from 'vue';

    /** Aurora's mark: a planet's rim with an aurora ribbon passing in front of it. */
    const props = defineProps({
        size: { type: [Number, String], default: 28 }
    });

    const RIBBON = 'M7 41c9-3 13-15 25-15s15 10 25 3';
    const uid = Math.random().toString(36).slice(2, 9);
    const gradId = `aurora-logo-g-${uid}`;
    const maskId = `aurora-logo-m-${uid}`;
    // small sizes get heavier strokes so the mark stays readable
    const bold = computed(() => Number(props.size) <= 22);
</script>

<style scoped>
    .aurora-logo {
        flex: none;
        color: var(--foreground);
    }
</style>
