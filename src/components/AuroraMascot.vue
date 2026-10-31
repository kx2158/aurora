<template>
    <div class="aurora-mascot" :class="{ speaking: isSpeaking }" :style="{ width: size + 'px', height: size + 'px' }">
        <img :src="src" alt="Neon" draggable="false" />
    </div>
</template>

<script setup>
    import { computed } from 'vue';

    import { emotion, mouthLevel, speaking } from '@/services/auroraVoice';
    import icon from '../../images/aurora/icon.png';

    const props = defineProps({
        size: { type: Number, default: 96 },
        // leave empty to follow Neon's live emotion
        expression: { type: String, default: '' },
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

    // emotions whose own face already shows the mood, mouth sync would hide it
    const FIXED_FACE = ['angry', 'sad', 'sleepy', 'error', 'surprised'];

    function mouthFor(level, mood) {
        if (level < 0.08) return 'm-closed';
        if (level < 0.2) return mood === 'joy' ? 'm-happy' : 'm-small';
        if (level < 0.38) return mood === 'joy' ? 'm-laugh' : 'm-happy';
        if (level < 0.6) return 'm-o';
        return mood === 'joy' ? 'm-laugh' : 'm-grin';
    }

    const src = computed(() => {
        const mood = props.expression || (props.reactive ? emotion.value : 'neutral');
        let wanted = mood;
        if (isSpeaking.value && !FIXED_FACE.includes(mood)) {
            wanted = mouthFor(mouthLevel.value, mood);
        }
        return bySlug[wanted] || bySlug[mood] || bySlug.neutral || icon;
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
        object-fit: cover;
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
