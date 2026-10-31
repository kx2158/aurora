<template>
    <div class="aurora-mascot" :class="{ speaking: isSpeaking }" :style="{ width: size + 'px', height: size + 'px' }">
        <img :src="src" alt="Neon" draggable="false" />
    </div>
</template>

<script setup>
    import { computed } from 'vue';

    import { speaking } from '@/services/auroraVoice';
    import icon from '../../images/aurora/icon.png';

    const props = defineProps({
        size: { type: Number, default: 96 },
        expression: { type: String, default: 'neutral' },
        // when true the mascot reacts to the voice. Turn off for a static picture.
        reactive: { type: Boolean, default: true }
    });

    // any PNG dropped into images/aurora/mascot/ is picked up (see the README there)
    const sprites = import.meta.glob('../../images/aurora/mascot/*.png', { eager: true, import: 'default' });
    const bySlug = {};
    for (const [path, url] of Object.entries(sprites)) {
        bySlug[path.split('/').pop().replace('.png', '')] = url;
    }

    const isSpeaking = computed(() => props.reactive && speaking.value);
    const src = computed(() => {
        const wanted = isSpeaking.value && bySlug.speaking ? 'speaking' : props.expression;
        return bySlug[wanted] || bySlug.neutral || icon;
    });
</script>

<style scoped>
    .aurora-mascot {
        position: relative;
        display: inline-block;
        transition: filter 0.2s ease;
    }
    .aurora-mascot img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        border-radius: 22%;
        user-select: none;
    }
    .aurora-mascot.speaking {
        filter: drop-shadow(0 0 14px var(--aurora-pink, #ff7fb0));
        animation: aurora-bob 0.45s ease-in-out infinite alternate;
    }
    @keyframes aurora-bob {
        from {
            transform: translateY(0) scale(1);
        }
        to {
            transform: translateY(-3px) scale(1.04);
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .aurora-mascot.speaking {
            animation: none;
        }
    }
</style>
