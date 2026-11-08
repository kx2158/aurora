<template>
    <svg
        class="aurora-icon"
        :width="size"
        :height="size"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        :stroke-width="stroke"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true">
        <template v-for="(d, i) in shape.paths" :key="'p' + i"><path :d="d" /></template>
        <template v-for="(c, i) in shape.circles" :key="'c' + i"><circle :cx="c[0]" :cy="c[1]" :r="c[2]" /></template>
        <template v-for="(c, i) in shape.dots" :key="'d' + i"
            ><circle :cx="c[0]" :cy="c[1]" :r="c[2] || 1" fill="currentColor" stroke="none"
        /></template>
    </svg>
</template>

<script setup>
    import { computed } from 'vue';

    import { AURORA_ICONS } from '../shared/constants/auroraIcons';

    const props = defineProps({
        name: { type: String, required: true },
        size: { type: [Number, String], default: 18 },
        stroke: { type: [Number, String], default: 1.6 }
    });

    const shape = computed(() => {
        const s = AURORA_ICONS[props.name] || AURORA_ICONS.dot;
        return { paths: s.paths || [], circles: s.circles || [], dots: s.dots || [] };
    });
</script>

<style scoped>
    .aurora-icon {
        flex: none;
        display: inline-block;
    }
</style>
