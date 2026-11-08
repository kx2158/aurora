<template>
    <div ref="el" class="a-chart" :style="{ height: height + 'px' }"></div>
</template>

<script setup>
    import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
    import * as echarts from 'echarts';

    /** A thin echarts wrapper: sizes itself to its box and redraws when the option changes. */
    const props = defineProps({
        option: { type: Object, required: true },
        height: { type: Number, default: 220 }
    });
    const emit = defineEmits(['select']);

    const el = ref(null);
    let chart = null;
    let observer = null;

    onMounted(() => {
        chart = echarts.init(el.value, null, { renderer: 'svg' });
        chart.setOption(props.option, true);
        chart.on('click', (p) => emit('select', p));
        observer = new ResizeObserver(() => chart?.resize());
        observer.observe(el.value);
    });

    watch(
        () => props.option,
        (option) => chart?.setOption(option, true),
        { deep: true }
    );

    onBeforeUnmount(() => {
        observer?.disconnect();
        chart?.dispose();
        chart = null;
    });
</script>

<style scoped>
    .a-chart {
        width: 100%;
    }
</style>
